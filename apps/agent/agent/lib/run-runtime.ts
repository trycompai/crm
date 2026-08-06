import { createHash } from "node:crypto";
import { ActivityType, db, type Prisma } from "@crm/db";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import { readCompanyHistory, readDealHistory } from "./accounts";
import { readCrmHistory } from "./crm";
import { searchCrm } from "./lookup";
import { lockAgentRun, runTerminalEventId } from "./run-state";

const ACTION_LEASE_MS = 5 * 60_000;

type RunResource = {
	kind: "integration" | "company" | "contact" | "deal";
	id: string;
	label: string;
};

type RunRecordScope = "SELECTED" | "WORKSPACE";

export async function approvedRunInstructions(runId: string): Promise<string> {
	const run = await db.agentRun.findUnique({
		where: { id: runId },
		select: {
			status: true,
			version: { select: { instructions: true } },
		},
	});

	if (!run) throw new Error("This agent run is unavailable.");
	if (run.status !== "RUNNING") {
		throw new Error("This agent run is not active.");
	}
	return run.version.instructions;
}

export async function runContext(runId: string) {
	const run = await db.agentRun.findUnique({
		where: { id: runId },
		select: {
			id: true,
			status: true,
			triggerType: true,
			input: true,
			agent: { select: { id: true, name: true, description: true } },
			version: {
				select: {
					id: true,
					number: true,
					manifest: true,
					modelId: true,
					sandboxPolicy: true,
				},
			},
			trigger: { select: { id: true, name: true, type: true, config: true } },
		},
	});

	if (!run) throw new Error("This agent run is unavailable.");
	if (run.status !== "RUNNING") {
		throw new Error("This agent run is not active.");
	}

	const dataScope = manifestDataScope(run.version.manifest);
	return {
		...run,
		recordScope: dataScope.mode,
		allowedResources: dataScope.resources,
		allowedActions: manifestActions(run.version.manifest),
		now: new Date().toISOString(),
	};
}

export async function queryRunCrm(
	runId: string,
	input: {
		query: string;
		kinds?: ("contact" | "company" | "deal")[];
		limit: number;
	},
) {
	const run = await runContext(runId);
	const scoped = run.allowedResources.filter(
		(resource) => resource.kind !== "integration",
	);
	const result = await searchCrm(input.query, input);
	if (run.recordScope === "WORKSPACE") return result;

	const allowed = new Set(
		scoped.map((resource) => `${resource.kind}:${resource.id}`),
	);
	const contacts = result.contacts.filter((row) =>
		allowed.has(`contact:${row.id}`),
	);
	const companies = result.companies.filter((row) =>
		allowed.has(`company:${row.id}`),
	);
	const deals = result.deals.filter((row) => allowed.has(`deal:${row.id}`));
	return {
		...result,
		contacts,
		companies,
		deals,
		total: contacts.length + companies.length + deals.length,
	};
}

export async function readRunRecord(
	runId: string,
	input: {
		kind: "contact" | "company" | "deal";
		id: string;
	},
) {
	const run = await runContext(runId);
	assertResourceAllowed(run.recordScope, run.allowedResources, input);
	const sources = allowedHistorySources(run.allowedResources);

	if (input.kind === "contact")
		return readCrmHistory(input.id, {
			threads: 10,
			includeEmail: sources.gmail,
			includeCalendar: sources.calendar,
		});
	if (input.kind === "company") {
		return readCompanyHistory(input.id, {
			threads: 10,
			people: 50,
			includeEmail: sources.gmail,
			includeCalendar: sources.calendar,
		});
	}
	return readDealHistory(input.id, {
		threads: 10,
		includeEmail: sources.gmail,
		includeCalendar: sources.calendar,
	});
}

export async function createRunActivity(
	runId: string,
	callId: string,
	input: {
		type: "NOTE" | "TASK";
		targetKind: "company" | "contact" | "deal";
		targetId: string;
		subject?: string | null;
		body?: string | null;
		dueAt?: string | null;
	},
) {
	const run = await db.agentRun.findUnique({
		where: { id: runId },
		select: {
			id: true,
			status: true,
			agentId: true,
			initiatedById: true,
			agent: { select: { createdById: true } },
			version: { select: { manifest: true } },
		},
	});
	if (!run) throw new Error("This agent run is unavailable.");

	assertActivityAllowed(run.version.manifest, input.type);
	const dataScope = manifestDataScope(run.version.manifest);
	assertResourceAllowed(dataScope.mode, dataScope.resources, {
		kind: input.targetKind,
		id: input.targetId,
	});
	const idempotencyKey = `${runId}:${callId}`;
	const requestHash = actionRequestHash(input);
	const existing = await db.agentAction.findUnique({
		where: { idempotencyKey },
		select: {
			id: true,
			status: true,
			externalId: true,
			errorMessage: true,
			requestHash: true,
		},
	});
	if (existing) assertActionRequestMatches(existing.requestHash, requestHash);
	if (existing?.status === "SUCCEEDED") {
		return {
			actionId: existing.id,
			activityId: existing.externalId,
			replayed: true,
		};
	}
	if (run.status !== "RUNNING") {
		throw new Error("This agent run is not active.");
	}
	if (input.type === "TASK" && !input.subject?.trim()) {
		throw new Error("A CRM task needs a subject.");
	}
	if (input.type === "NOTE" && !input.subject?.trim() && !input.body?.trim()) {
		throw new Error("A CRM note needs a subject or body.");
	}
	const dueAt = input.dueAt ? new Date(input.dueAt) : null;
	if (dueAt && Number.isNaN(dueAt.getTime())) {
		throw new Error("The due date is invalid.");
	}
	const target = await targetRecord(input.targetKind, input.targetId);
	if (!target) throw new Error("The requested CRM target no longer exists.");

	let action = existing;
	if (!action) {
		action = await db.$transaction(async (tx) => {
			await lockIdempotencyKey(tx, idempotencyKey);
			const winner = await tx.agentAction.findUnique({
				where: { idempotencyKey },
				select: {
					id: true,
					status: true,
					externalId: true,
					errorMessage: true,
					requestHash: true,
				},
			});
			if (winner) {
				assertActionRequestMatches(winner.requestHash, requestHash);
				return winner;
			}

			return tx.agentAction.create({
				data: {
					agentId: run.agentId,
					runId,
					type: "crm.activity.create",
					provider: "crm",
					targetType: input.targetKind,
					targetId: input.targetId,
					targetLabel: target.label,
					summary:
						input.subject?.trim() ||
						`Create a ${input.type.toLowerCase()} on ${target.label}`,
					metadata: { activityType: input.type },
					idempotencyKey,
					requestHash,
				},
				select: {
					id: true,
					status: true,
					externalId: true,
					errorMessage: true,
					requestHash: true,
				},
			});
		});
	}
	if (action.status === "SUCCEEDED") {
		return {
			actionId: action.id,
			activityId: action.externalId,
			replayed: true,
		};
	}

	const claimed = await db.agentAction.updateMany({
		where: {
			id: action.id,
			OR: [
				{ status: { in: ["PLANNED", "FAILED"] } },
				{
					status: "RUNNING",
					startedAt: { lt: new Date(Date.now() - ACTION_LEASE_MS) },
				},
			],
		},
		data: {
			status: "RUNNING",
			startedAt: new Date(),
			completedAt: null,
			attemptCount: { increment: 1 },
			errorCode: null,
			errorMessage: null,
		},
	});
	if (claimed.count === 0) {
		const current = await db.agentAction.findUnique({
			where: { id: action.id },
			select: { status: true, externalId: true },
		});
		if (current?.status === "SUCCEEDED") {
			return {
				actionId: action.id,
				activityId: current.externalId,
				replayed: true,
			};
		}
		throw new Error("This agent action is already in progress.");
	}

	try {
		const activityId = `agent-action-${action.id}`;
		const now = new Date();

		await db.$transaction(async (tx) => {
			await tx.activity.upsert({
				where: { id: activityId },
				create: {
					id: activityId,
					type: input.type === "TASK" ? ActivityType.TASK : ActivityType.NOTE,
					subject: input.subject?.trim() || null,
					body: input.body?.trim() || null,
					occurredAt: now,
					dueAt: input.type === "TASK" ? dueAt : null,
					companyId: target.companyId,
					contactId: target.contactId,
					dealId: target.dealId,
					createdById: run.initiatedById ?? run.agent.createdById,
					meta: {
						source: "agent",
						agentId: run.agentId,
						runId,
						actionId: action.id,
					},
				},
				update: {},
			});

			if (target.companyId) {
				await tx.company.update({
					where: { id: target.companyId },
					data: { lastActivityAt: now },
				});
			}
			if (target.contactId) {
				await tx.contact.update({
					where: { id: target.contactId },
					data: { lastActivityAt: now },
				});
			}
			if (target.dealId) {
				await tx.deal.update({
					where: { id: target.dealId },
					data: { lastActivityAt: now },
				});
			}

			await tx.agentAction.update({
				where: { id: action.id },
				data: {
					status: "SUCCEEDED",
					externalId: activityId,
					completedAt: now,
				},
			});
		});

		return { actionId: action.id, activityId, replayed: false };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await db.agentAction.updateMany({
			where: { id: action.id, status: "RUNNING" },
			data: {
				status: "FAILED",
				errorCode: "ACTION_REJECTED",
				errorMessage: message,
				completedAt: new Date(),
			},
		});
		throw error;
	}
}

export async function stageRunResult(
	runId: string,
	input: { summary: string; result?: Record<string, unknown> | null },
) {
	return db.$transaction(async (tx) => {
		const run = await lockAgentRun(tx, runId);
		if (run.status !== "RUNNING") {
			throw new Error(`This agent run already ended with ${run.status}.`);
		}

		await assertRunSummaryAllowed(tx, run.versionId);
		await tx.agentRun.update({
			where: { id: runId },
			data: {
				summary: input.summary,
				result: (input.result ?? {}) as Prisma.InputJsonValue,
			},
		});

		return { id: run.id, status: "RUNNING" as const };
	});
}

export async function finishRun(
	runId: string,
	input: { summary: string; result?: Record<string, unknown> | null },
) {
	return db.$transaction(async (tx) => {
		const run = await lockAgentRun(tx, runId);
		if (run.status === "SUCCEEDED") {
			return { id: run.id, status: "SUCCEEDED" as const };
		}
		if (run.status !== "RUNNING") {
			throw new Error(`This agent run already ended with ${run.status}.`);
		}
		await assertRunSummaryAllowed(tx, run.versionId);

		const sequence = run.nextEventSequence + 1;
		const finishedAt = new Date();
		await tx.agentRun.update({
			where: { id: runId },
			data: {
				status: "SUCCEEDED",
				summary: input.summary,
				result: (input.result ?? {}) as Prisma.InputJsonValue,
				finishedAt,
				nextEventSequence: sequence,
			},
		});
		await tx.agentRunEvent.create({
			data: {
				id: runTerminalEventId(run.id, "completed"),
				runId: run.id,
				sequence,
				type: "run.completed",
				data: { summary: input.summary },
				emittedAt: finishedAt,
			},
		});
		await tx.agentAuditEvent.upsert({
			where: {
				agentId_type_requestId: {
					agentId: run.agentId,
					type: "run.completed",
					requestId: run.id,
				},
			},
			create: {
				agentId: run.agentId,
				versionId: run.versionId,
				actorType: "AGENT",
				actorId: run.id,
				type: "run.completed",
				summary: input.summary,
				requestId: run.id,
			},
			update: {},
		});

		return { id: run.id, status: "SUCCEEDED" as const };
	});
}

async function assertRunSummaryAllowed(
	tx: Prisma.TransactionClient,
	versionId: string,
): Promise<void> {
	const version = await tx.agentVersion.findUniqueOrThrow({
		where: { id: versionId },
		select: { manifest: true },
	});
	if (
		!manifestActions(version.manifest).some(
			(action) => action.type === "run.summary",
		)
	) {
		throw new Error("Agent version does not allow a run summary.");
	}
}

function manifestDataScope(value: unknown): {
	mode: RunRecordScope;
	resources: RunResource[];
} {
	const manifest = recordOf(value);
	const scope = recordOf(manifest.dataScope);
	if (scope.mode !== "SELECTED" && scope.mode !== "WORKSPACE") {
		throw new Error("Agent version has no valid CRM record scope.");
	}
	if (!Array.isArray(scope.resources)) {
		throw new Error("Agent version has no valid CRM resources.");
	}

	const resources = scope.resources.flatMap((resource) => {
		if (!resource || typeof resource !== "object") return [];
		const row = resource as Record<string, unknown>;
		if (
			!["integration", "company", "contact", "deal"].includes(
				String(row.kind),
			) ||
			typeof row.id !== "string" ||
			typeof row.label !== "string"
		) {
			return [];
		}
		return [resource as RunResource];
	});
	const records = resources.filter(
		(resource) => resource.kind !== "integration",
	);
	if (scope.mode === "SELECTED" && records.length === 0) {
		throw new Error("Agent version selected no CRM records.");
	}
	if (scope.mode === "WORKSPACE" && records.length > 0) {
		throw new Error("Agent version mixes workspace and selected CRM scope.");
	}
	return { mode: scope.mode, resources };
}

function manifestActions(value: unknown) {
	const actions = recordOf(value).actions;
	return Array.isArray(actions) ? actions.map(recordOf) : [];
}

function assertActivityAllowed(
	manifest: unknown,
	activityType: "NOTE" | "TASK",
) {
	const allowed = manifestActions(manifest).some(
		(action) =>
			action.type === "crm.activity.create" &&
			Array.isArray(action.activityTypes) &&
			action.activityTypes.includes(activityType),
	);
	if (!allowed) {
		throw new Error(
			`Agent version does not allow CRM ${activityType.toLowerCase()} activities.`,
		);
	}
}

function assertResourceAllowed(
	mode: RunRecordScope,
	resources: RunResource[],
	input: { kind: "contact" | "company" | "deal"; id: string },
) {
	if (mode === "WORKSPACE") return;
	const records = resources.filter(
		(resource) => resource.kind !== "integration",
	);
	if (
		records.some(
			(resource) => resource.kind === input.kind && resource.id === input.id,
		)
	) {
		return;
	}
	throw new Error(
		"That CRM record is outside this agent version's approved scope.",
	);
}

export function allowedHistorySources(resources: RunResource[]): {
	gmail: boolean;
	calendar: boolean;
} {
	const integrations = new Set(
		resources
			.filter((resource) => resource.kind === "integration")
			.map((resource) => resource.id),
	);
	return {
		gmail: integrations.has("google:gmail"),
		calendar: integrations.has("google:calendar"),
	};
}

async function targetRecord(kind: "company" | "contact" | "deal", id: string) {
	if (kind === "company") {
		const company = await db.company.findUnique({
			where: { id },
			select: { id: true, name: true },
		});
		return company
			? {
					label: company.name,
					companyId: company.id,
					contactId: null,
					dealId: null,
				}
			: null;
	}
	if (kind === "contact") {
		const contact = await db.contact.findUnique({
			where: { id },
			select: { id: true, firstName: true, lastName: true, companyId: true },
		});
		return contact
			? {
					label: [contact.firstName, contact.lastName]
						.filter(Boolean)
						.join(" "),
					companyId: contact.companyId,
					contactId: contact.id,
					dealId: null,
				}
			: null;
	}

	const deal = await db.deal.findUnique({
		where: { id },
		select: { id: true, name: true, companyId: true },
	});
	return deal
		? {
				label: deal.name,
				companyId: deal.companyId,
				contactId: null,
				dealId: deal.id,
			}
		: null;
}

function recordOf(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function actionRequestHash(input: {
	type: "NOTE" | "TASK";
	targetKind: "company" | "contact" | "deal";
	targetId: string;
	subject?: string | null;
	body?: string | null;
	dueAt?: string | null;
}): string {
	return createHash("sha256")
		.update(
			JSON.stringify({
				type: input.type,
				targetKind: input.targetKind,
				targetId: input.targetId,
				subject: input.subject?.trim() || null,
				body: input.body?.trim() || null,
				dueAt: input.dueAt?.trim() || null,
			}),
		)
		.digest("hex");
}

function assertActionRequestMatches(
	existingHash: string | null,
	requestHash: string,
): void {
	if (existingHash !== requestHash) {
		throw new Error("That agent action call was already used for other input.");
	}
}
