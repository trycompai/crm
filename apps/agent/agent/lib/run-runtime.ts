import { createHash, randomUUID } from "node:crypto";
import { ActivityType, db, type Prisma } from "@crm/db";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import { readCompanyHistory, readDealHistory } from "./accounts";
import {
	AGENT_ACTION_EXECUTORS,
	AGENT_ACTION_TYPES,
	isAgentActionType,
} from "./agent-actions";
import { parseAgentManifest } from "./agent-manifest";
import { readCrmHistory } from "./crm";
import { searchCrm } from "./lookup";
import {
	type LockedAgentRun,
	lockAgentRun,
	runTerminalEventId,
} from "./run-state";
import { slackAccessToken } from "./slack-connection";

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
			const activeRun = await lockAgentRun(tx, runId);
			if (activeRun.status !== "RUNNING") {
				throw new Error("This agent run is not active.");
			}
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

export async function postRunSlackMessage(
	runId: string,
	callId: string,
	input: { text: string },
	abortSignal?: AbortSignal,
) {
	const run = await db.agentRun.findUnique({
		where: { id: runId },
		select: {
			id: true,
			status: true,
			agentId: true,
			version: { select: { manifest: true } },
		},
	});
	if (!run) throw new Error("This agent run is unavailable.");

	const destination = approvedSlackDestination(run.version.manifest);
	const text = input.text.trim();
	if (!text) throw new Error("A Slack message needs text.");
	const idempotencyKey = `${runId}:${callId}`;
	const requestHash = hashRequest({ destinationId: destination.id, text });
	const existing = await db.agentAction.findUnique({
		where: { idempotencyKey },
		select: {
			id: true,
			status: true,
			externalId: true,
			requestHash: true,
			metadata: true,
		},
	});
	if (existing) assertActionRequestMatches(existing.requestHash, requestHash);
	if (existing?.status === "SUCCEEDED") {
		return {
			actionId: existing.id,
			messageId: existing.externalId,
			destination: destination.label,
			replayed: true,
		};
	}
	if (run.status !== "RUNNING") {
		throw new Error("This agent run is not active.");
	}

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
					requestHash: true,
					metadata: true,
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
					type: "slack.message.post",
					provider: "slack",
					targetType: destination.kind,
					targetId: destination.id,
					targetLabel: destination.label,
					summary: `Post a message to ${destination.label}`,
					metadata: { clientMessageId: randomUUID() },
					idempotencyKey,
					requestHash,
				},
				select: {
					id: true,
					status: true,
					externalId: true,
					requestHash: true,
					metadata: true,
				},
			});
		});
	}
	if (action.status === "SUCCEEDED") {
		return {
			actionId: action.id,
			messageId: action.externalId,
			destination: destination.label,
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
				messageId: current.externalId,
				destination: destination.label,
				replayed: true,
			};
		}
		throw new Error("This agent action is already in progress.");
	}

	try {
		const activeRun = await db.agentRun.findUnique({
			where: { id: runId },
			select: { status: true },
		});
		if (activeRun?.status !== "RUNNING") {
			throw new Error("This agent run is not active.");
		}
		const clientMessageId = recordOf(action.metadata).clientMessageId;
		if (typeof clientMessageId !== "string" || !clientMessageId) {
			throw new Error("This Slack action is missing its replay key.");
		}
		const accessToken = await slackAccessToken();
		if (!accessToken) throw new Error("Slack is not connected.");

		const posted = await sendSlackMessage(
			accessToken,
			destination,
			text,
			clientMessageId,
			fetch,
			abortSignal,
		);
		const messageId = `${posted.channel}:${posted.ts}`;
		await db.agentAction.update({
			where: { id: action.id },
			data: {
				status: "SUCCEEDED",
				externalId: messageId,
				completedAt: new Date(),
			},
		});

		return {
			actionId: action.id,
			messageId,
			destination: destination.label,
			replayed: false,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await db.agentAction.updateMany({
			where: { id: action.id, status: "RUNNING" },
			data: {
				status: "FAILED",
				errorCode: slackActionErrorCode(message),
				errorMessage: message,
				completedAt: new Date(),
			},
		});
		throw error;
	}
}

export async function sendSlackMessage(
	accessToken: string,
	destination: { kind: "channel" | "user"; id: string; label: string },
	text: string,
	clientMessageId: string,
	fetcher: typeof fetch = fetch,
	abortSignal?: AbortSignal,
): Promise<{ channel: string; ts: string }> {
	let channel = destination.id;
	if (destination.kind === "user") {
		const opened = await slackApiRequest(
			fetcher,
			accessToken,
			"conversations.open",
			{ users: destination.id, return_im: true },
			abortSignal,
		);
		const conversation = recordOf(opened.channel);
		if (typeof conversation.id !== "string" || !conversation.id) {
			throw new Error("Slack did not return a direct-message channel.");
		}
		channel = conversation.id;
	}

	const data = await slackApiRequest(
		fetcher,
		accessToken,
		"chat.postMessage",
		{
			channel,
			text,
			client_msg_id: clientMessageId,
		},
		abortSignal,
	);
	if (typeof data.channel !== "string" || typeof data.ts !== "string") {
		throw new Error("Slack returned an incomplete message receipt.");
	}

	return { channel: data.channel, ts: data.ts };
}

async function slackApiRequest(
	fetcher: typeof fetch,
	accessToken: string,
	method: string,
	body: Record<string, unknown>,
	abortSignal?: AbortSignal,
): Promise<Record<string, unknown>> {
	const response = await fetcher(`https://slack.com/api/${method}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json; charset=utf-8",
		},
		body: JSON.stringify(body),
		signal: abortSignal,
	});
	if (!response.ok) throw new Error("Slack message delivery failed.");

	const data = recordOf(await response.json());
	if (data.ok !== true) {
		const reason = typeof data.error === "string" ? data.error : "rejected";
		if (reason === "not_in_channel") {
			throw new Error(
				"The Slack bot is not in the selected channel. Invite the app to that channel and retry the run.",
			);
		}
		if (reason === "missing_scope") {
			throw new Error(
				"Slack needs an additional permission. Reconnect Slack, then retry the run.",
			);
		}
		throw new Error(`Slack rejected the message (${reason}).`);
	}
	return data;
}

function slackActionErrorCode(message: string): string {
	return message === "Slack is not connected." ||
		message.includes("additional permission")
		? "NOT_AUTHORISED"
		: "PROVIDER_ERROR";
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
		const actionFailure = await requiredActionFailure(tx, run);
		if (actionFailure) {
			return failLockedRun(tx, run, actionFailure.code, actionFailure.message);
		}

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

async function requiredActionFailure(
	tx: Prisma.TransactionClient,
	run: LockedAgentRun,
): Promise<{ code: string; message: string } | null> {
	const version = await tx.agentVersion.findUniqueOrThrow({
		where: { id: run.versionId },
		select: { manifest: true },
	});
	const declared = manifestActions(version.manifest);
	const external = declared.filter(
		(action) => action.type !== AGENT_ACTION_TYPES.RUN_SUMMARY,
	);
	const recorded = await tx.agentAction.findMany({
		where: { runId: run.id },
		orderBy: [{ completedAt: "desc" }, { plannedAt: "desc" }],
		select: {
			type: true,
			status: true,
			errorCode: true,
			errorMessage: true,
		},
	});

	for (const action of external) {
		const type = typeof action.type === "string" ? action.type : "unknown";
		const rows = recorded.filter((row) => row.type === type);
		if (rows.some((row) => row.status === "SUCCEEDED")) continue;

		const executable =
			isAgentActionType(type) && Object.hasOwn(AGENT_ACTION_EXECUTORS, type);
		const latestFailure = rows.find((row) => row.status === "FAILED");
		const code = executable
			? (latestFailure?.errorCode ?? "ACTION_NOT_PERFORMED")
			: "NO_EXECUTOR";
		const message = executable
			? (latestFailure?.errorMessage ??
				`The declared ${type} action was not performed.`)
			: `The declared ${type} action has no executor.`;

		if (rows.length === 0) {
			await tx.agentAction.create({
				data: {
					agentId: run.agentId,
					runId: run.id,
					type,
					provider:
						type === AGENT_ACTION_TYPES.SLACK_MESSAGE_POST ? "slack" : "crm",
					summary:
						typeof action.summary === "string"
							? action.summary
							: `Perform ${type}`,
					status: "FAILED",
					idempotencyKey: `run:${run.id}:required:${type}`,
					requestHash: hashRequest({ type, required: true }),
					errorCode: code,
					errorMessage: message,
					completedAt: new Date(),
				},
			});
		}

		return { code, message };
	}

	return null;
}

async function failLockedRun(
	tx: Prisma.TransactionClient,
	run: LockedAgentRun,
	code: string,
	message: string,
) {
	const sequence = run.nextEventSequence + 1;
	const finishedAt = new Date();
	await tx.agentRun.update({
		where: { id: run.id },
		data: {
			status: "FAILED",
			errorCode: code,
			errorMessage: message,
			finishedAt,
			nextEventSequence: sequence,
		},
	});
	await tx.agentRunEvent.create({
		data: {
			id: runTerminalEventId(run.id, "failed"),
			runId: run.id,
			sequence,
			type: "run.failed",
			data: { code, message },
			emittedAt: finishedAt,
		},
	});
	await tx.agentAuditEvent.upsert({
		where: {
			agentId_type_requestId: {
				agentId: run.agentId,
				type: "run.failed",
				requestId: run.id,
			},
		},
		create: {
			agentId: run.agentId,
			versionId: run.versionId,
			actorType: "AGENT",
			actorId: run.id,
			type: "run.failed",
			summary: message,
			requestId: run.id,
		},
		update: {},
	});

	return { id: run.id, status: "FAILED" as const };
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
	const scope = parseAgentManifest(value).dataScope;
	const resources = scope.resources as RunResource[];
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
	return parseAgentManifest(value).actions;
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

export function approvedSlackDestination(manifest: unknown): {
	kind: "channel" | "user";
	id: string;
	label: string;
} {
	const scope = manifestDataScope(manifest);
	if (
		!scope.resources.some(
			(resource) =>
				resource.kind === "integration" && resource.id === "slack:workspace",
		)
	) {
		throw new Error("Agent version does not allow Slack.");
	}

	const destinations = manifestActions(manifest).flatMap((action) => {
		if (action.type !== "slack.message.post") return [];
		const destination = recordOf(action.destination);
		if (
			!["channel", "user"].includes(String(destination.kind)) ||
			typeof destination.id !== "string" ||
			!destination.id ||
			typeof destination.label !== "string" ||
			!destination.label
		) {
			return [];
		}
		return [
			{
				kind: destination.kind as "channel" | "user",
				id: destination.id,
				label: destination.label,
			},
		];
	});
	const [destination] = destinations;
	if (!destination || destinations.length !== 1) {
		throw new Error(
			"Agent version needs exactly one approved Slack destination.",
		);
	}

	return destination;
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
	return hashRequest({
		type: input.type,
		targetKind: input.targetKind,
		targetId: input.targetId,
		subject: input.subject?.trim() || null,
		body: input.body?.trim() || null,
		dueAt: input.dueAt?.trim() || null,
	});
}

function hashRequest(input: Record<string, unknown>): string {
	return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function assertActionRequestMatches(
	existingHash: string | null,
	requestHash: string,
): void {
	if (existingHash !== requestHash) {
		throw new Error("That agent action call was already used for other input.");
	}
}
