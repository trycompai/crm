import { db, Prisma } from "@crm/db";
import { CRM_EVENT_CATALOG, isCrmEventType } from "@crm/db/crm-events";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import type { SendFn } from "eve/channels";
import { DISPATCH } from "./dispatch-config";
import { DEPENDENCY_UNAVAILABLE, runDependencyFailure } from "./run-preflight";
import {
	isTerminalRunStatus,
	lockAgentRun,
	runTerminalEventId,
} from "./run-state";
import type { LeasedTask } from "./tasks";

const BUILDER_BATCH = DISPATCH.builder.batch;
const RUN_BATCH = DISPATCH.run.batch;
const MAX_BUILDER_ATTEMPTS = DISPATCH.builder.maxAttempts;
const BUILDER_LEASE_MS = DISPATCH.builder.leaseMs;
const RUN_DELIVERY_LEASE_MS = DISPATCH.run.deliveryLeaseMs;

export async function pendingBuilderSubmissionIds(): Promise<string[]> {
	await recoverBuilderSubmissions();
	const rows = await db.agentConversationSubmission.findMany({
		where: {
			status: "PENDING",
			conversation: {
				kind: "BUILDER",
				OR: [{ sessionId: null }, { continuationToken: { not: null } }],
			},
		},
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		take: BUILDER_BATCH * 3,
		select: { id: true, conversationId: true },
	});

	const seen = new Set<string>();
	return rows
		.flatMap((row) => {
			if (seen.has(row.conversationId)) return [];
			seen.add(row.conversationId);
			return [row.id];
		})
		.slice(0, BUILDER_BATCH);
}

export async function drainBuilder(send: SendFn): Promise<number> {
	const ids = await pendingBuilderSubmissionIds();
	await Promise.all(ids.map((id) => dispatchBuilderSubmission(id, send)));
	return ids.length;
}

export async function dispatchBuilderSubmission(
	submissionId: string,
	send: SendFn,
) {
	const submission = await db.$transaction(async (tx) => {
		const seed = await tx.agentConversationSubmission.findUnique({
			where: { id: submissionId },
			select: { conversationId: true },
		});
		if (!seed) throw new Error("Builder submission is unavailable.");

		const conversation = await lockBuilderConversation(tx, seed.conversationId);
		if (conversation?.kind !== "BUILDER") {
			throw new Error("Builder submission is unavailable.");
		}
		if (conversation.sessionId && !conversation.continuationToken) {
			throw new Error("Builder conversation is still processing a message.");
		}

		const [active, firstPending] = await Promise.all([
			tx.agentConversationSubmission.findFirst({
				where: { conversationId: conversation.id, status: "SENDING" },
				select: { id: true },
			}),
			tx.agentConversationSubmission.findFirst({
				where: { conversationId: conversation.id, status: "PENDING" },
				orderBy: [{ createdAt: "asc" }, { id: "asc" }],
				select: { id: true },
			}),
		]);
		if (active || firstPending?.id !== submissionId) {
			throw new Error(
				"Builder submission was already claimed or is out of order.",
			);
		}

		await tx.agentConversationSubmission.update({
			where: { id: submissionId },
			data: {
				status: "SENDING",
				attemptCount: { increment: 1 },
				sentAt: new Date(),
				errorCode: null,
				errorMessage: null,
			},
		});
		await tx.agentConversation.update({
			where: { id: conversation.id },
			data: { continuationToken: null },
		});

		return tx.agentConversationSubmission.findUniqueOrThrow({
			where: { id: submissionId },
			select: {
				id: true,
				commandType: true,
				message: true,
				attemptCount: true,
				attachments: {
					orderBy: { position: "asc" },
					select: {
						name: true,
						mediaType: true,
						content: true,
					},
				},
				conversation: {
					select: {
						id: true,
						title: true,
						userId: true,
						kind: true,
					},
				},
			},
		});
	});
	const conversationId = submission.conversation.id;

	try {
		const session = await send(
			builderDeliveryMessage(
				submission.id,
				submission.message,
				submission.attachments,
			),
			{
				auth: {
					authenticator: "crm-builder",
					principalType: "user",
					principalId: submission.conversation.userId,
					attributes: {
						purpose: "builder",
						commandType: builderCommandType(
							submission.commandType,
							submission.message,
						),
						needsTitle: submission.conversation.title ? "false" : "true",
						conversationId,
						userId: submission.conversation.userId,
						submissionId: submission.id,
					},
				},
				continuationToken: builderToken(conversationId),
				title: submission.conversation.title ?? "Agent builder",
			},
		);

		await db.$transaction(async (tx) => {
			const conversation = await lockBuilderConversation(tx, conversationId);
			if (!conversation) return;
			await tx.agentConversationSubmission.update({
				where: { id: submission.id },
				data: { status: "ACCEPTED", acceptedAt: new Date() },
			});
			await tx.agentConversation.update({
				where: { id: conversationId },
				data: {
					sessionId: session.id,
					pendingInputRequest: Prisma.DbNull,
				},
			});
		});

		return session;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const retry = submission.attemptCount < MAX_BUILDER_ATTEMPTS;
		await db.$transaction(async (tx) => {
			const conversation = await lockBuilderConversation(tx, conversationId);
			if (!conversation) return;
			await tx.agentConversationSubmission.update({
				where: { id: submission.id },
				data: {
					status: retry ? "PENDING" : "FAILED",
					errorCode: "DELIVERY_FAILED",
					errorMessage: message,
				},
			});
			await tx.agentConversation.update({
				where: { id: conversationId },
				data: { continuationToken: builderToken(conversationId) },
			});
		});
		throw error;
	}
}

export async function queueDueAgentRuns(now = new Date()): Promise<number> {
	const triggers = await db.agentTrigger.findMany({
		where: {
			enabled: true,
			type: "SCHEDULE",
			nextRunAt: { lte: now },
			agent: { status: "LIVE" },
		},
		orderBy: [{ nextRunAt: "asc" }, { id: "asc" }],
		take: RUN_BATCH,
		select: {
			id: true,
			agentId: true,
			versionId: true,
			nextRunAt: true,
			config: true,
		},
	});

	let queued = 0;
	for (const trigger of triggers) {
		if (!trigger.nextRunAt) continue;
		const scheduledAt = trigger.nextRunAt;
		const intervalMinutes = intervalOf(trigger.config);
		const nextRunAt = advance(scheduledAt, intervalMinutes, now);
		const idempotencyKey = `${trigger.id}:${scheduledAt.toISOString()}`;
		const claimed = await db.$transaction(async (tx) => {
			const [agent] = await tx.$queryRaw<Array<{ id: string; status: string }>>`
				SELECT id, status
				FROM "agentDefinition"
				WHERE id = ${trigger.agentId}
				FOR UPDATE
			`;
			if (agent?.status !== "LIVE") return false;

			const updated = await tx.agentTrigger.updateMany({
				where: {
					id: trigger.id,
					nextRunAt: scheduledAt,
					enabled: true,
				},
				data: { nextRunAt, lastRunAt: scheduledAt },
			});
			if (updated.count === 0) return false;

			await tx.agentRun.upsert({
				where: { idempotencyKey },
				create: {
					agentId: trigger.agentId,
					versionId: trigger.versionId,
					triggerId: trigger.id,
					triggerType: "SCHEDULE",
					idempotencyKey,
					correlationId: crypto.randomUUID(),
					input: { scheduledFor: scheduledAt.toISOString() },
					events: {
						create: { sequence: 0, type: "run.queued", data: {} },
					},
				},
				update: {},
			});
			return true;
		});
		if (claimed) queued += 1;
	}

	return queued;
}

export async function queueEventAgentRuns(
	task: Pick<
		LeasedTask,
		"id" | "contactId" | "companyId" | "dealId" | "payload"
	>,
): Promise<number> {
	const payload = recordOf(task.payload);
	const eventType = payload.type;
	const record = recordOf(payload.record);
	const recordKind = textOf(record.kind);
	const recordId = textOf(record.id);
	const occurredAt = textOf(payload.occurredAt);
	const occurredAtDate = new Date(occurredAt);
	const taskRecordId =
		recordKind === "contact"
			? task.contactId
			: recordKind === "company"
				? task.companyId
				: recordKind === "deal"
					? task.dealId
					: null;
	if (
		!isCrmEventType(eventType) ||
		CRM_EVENT_CATALOG[eventType].recordKind !== recordKind ||
		!recordId ||
		taskRecordId !== recordId ||
		!occurredAt ||
		Number.isNaN(occurredAtDate.getTime())
	) {
		throw new Error("The queued agent event is invalid.");
	}

	const triggers = await db.agentTrigger.findMany({
		where: {
			enabled: true,
			type: "EVENT",
			agent: { status: "LIVE" },
		},
		orderBy: { id: "asc" },
		select: {
			id: true,
			agentId: true,
			versionId: true,
			config: true,
		},
	});

	let matched = 0;
	for (const trigger of triggers) {
		if (recordOf(trigger.config).event !== eventType) continue;
		const idempotencyKey = `event:${task.id}:trigger:${trigger.id}`;

		const queued = await db.$transaction(async (tx) => {
			await lockIdempotencyKey(tx, idempotencyKey);
			const eligible = await tx.agentTrigger.findFirst({
				where: {
					id: trigger.id,
					enabled: true,
					type: "EVENT",
					agent: { status: "LIVE" },
				},
				select: { id: true },
			});
			if (!eligible) return false;

			await tx.agentRun.upsert({
				where: { idempotencyKey },
				create: {
					agentId: trigger.agentId,
					versionId: trigger.versionId,
					triggerId: trigger.id,
					triggerType: "EVENT",
					idempotencyKey,
					correlationId: `trigger:${trigger.id}:event:${task.id}`,
					input: {
						event: {
							type: eventType,
							occurredAt,
							data: recordOf(payload.data),
						},
						record: { kind: recordKind, id: recordId },
					} as Prisma.InputJsonValue,
					events: {
						create: {
							sequence: 0,
							type: "run.queued",
							data: { eventType, taskId: task.id },
						},
					},
				},
				update: {},
			});
			await tx.agentTrigger.updateMany({
				where: { id: trigger.id, enabled: true },
				data: { lastRunAt: occurredAtDate },
			});
			return true;
		});
		if (queued) matched += 1;
	}

	return matched;
}

export async function pendingAgentRunIds(): Promise<string[]> {
	await recoverAgentRuns();
	const rows = await db.agentRun.findMany({
		where: {
			status: "QUEUED",
			agent: {
				status: "LIVE",
				runs: {
					none: { status: { in: ["RUNNING", "WAITING_FOR_APPROVAL"] } },
				},
			},
		},
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		take: RUN_BATCH * 4,
		select: { id: true, agentId: true, versionId: true },
	});

	const runnable: string[] = [];
	const selectedAgents = new Set<string>();
	for (const row of rows) {
		if (selectedAgents.has(row.agentId)) continue;
		const blocked = await runDependencyFailure(row.versionId);
		if (blocked) {
			await failRun(row.id, DEPENDENCY_UNAVAILABLE, blocked).catch(() => {});
			continue;
		}
		selectedAgents.add(row.agentId);
		runnable.push(row.id);
		if (runnable.length === RUN_BATCH) break;
	}

	return runnable;
}

export async function drainAgentRuns(send: SendFn): Promise<number> {
	await queueDueAgentRuns();

	let dispatched = 0;
	for (let pass = 0; pass < DISPATCH.run.maxPasses; pass += 1) {
		const ids = await pendingAgentRunIds();
		if (ids.length === 0) break;

		const outcomes = await Promise.all(
			ids.map((id) =>
				dispatchAgentRun(id, send).then(
					() => true,
					(error) => {
						console.error(
							`[agent] run ${id} could not be dispatched: ${
								error instanceof Error ? error.message : String(error)
							}`,
						);
						return false;
					},
				),
			),
		);
		dispatched += outcomes.filter(Boolean).length;
	}

	return dispatched;
}

export async function dispatchAgentRun(runId: string, send: SendFn) {
	const run = await db.agentRun.findUnique({
		where: { id: runId },
		select: {
			id: true,
			status: true,
			agentId: true,
			versionId: true,
			initiatedById: true,
			agent: {
				select: { name: true, createdById: true, status: true },
			},
			version: { select: { modelId: true } },
		},
	});
	if (run?.status !== "QUEUED" || run.agent.status !== "LIVE") {
		throw new Error("Agent run was already claimed or is not live.");
	}

	const claim = await db.$transaction(async (tx) => {
		const [agent] = await tx.$queryRaw<Array<{ id: string; status: string }>>`
			SELECT id, status
			FROM "agentDefinition"
			WHERE id = ${run.agentId}
			FOR UPDATE
		`;
		if (agent?.status !== "LIVE") return "unavailable" as const;

		const active = await tx.agentRun.findFirst({
			where: {
				agentId: run.agentId,
				id: { not: run.id },
				status: { in: ["RUNNING", "WAITING_FOR_APPROVAL"] },
			},
			select: { id: true },
		});
		if (active) return "deferred" as const;

		const updated = await tx.agentRun.updateMany({
			where: { id: runId, status: "QUEUED" },
			data: {
				status: "RUNNING",
				startedAt: new Date(),
				modelId: run.version.modelId,
			},
		});
		return updated.count === 1
			? ("claimed" as const)
			: ("unavailable" as const);
	});
	if (claim === "deferred") {
		throw new Error(
			"This agent already has an active run; this run remains queued.",
		);
	}
	if (claim !== "claimed")
		throw new Error("Agent run was already claimed or is not live.");

	const principalId = run.initiatedById ?? run.agent.createdById;
	try {
		const session = await send(`Execute deployed agent run ${run.id}.`, {
			auth: {
				authenticator: run.initiatedById ? "crm-user" : "crm-schedule",
				principalType: run.initiatedById ? "user" : "runtime",
				principalId,
				attributes: {
					purpose: "team-agent",
					runId: run.id,
					agentId: run.agentId,
					versionId: run.versionId,
					userId: principalId,
				},
			},
			continuationToken: runToken(run.id),
			title: `${run.agent.name} run`,
			mode: "task",
		});

		await db.agentRun.updateMany({
			where: { id: run.id, status: "RUNNING" },
			data: { sessionId: session.id },
		});
		return session;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await failRun(run.id, "DELIVERY_FAILED", message);
		throw error;
	}
}

export async function failRun(runId: string, code: string, message: string) {
	return db.$transaction(async (tx) => {
		const run = await lockAgentRun(tx, runId);
		if (run.status === "FAILED") {
			return { id: run.id, status: "FAILED" as const };
		}
		if (run.status === "SUCCEEDED" || run.status === "CANCELLED") {
			return { id: run.id, status: run.status };
		}

		const sequence = run.nextEventSequence + 1;
		const finishedAt = new Date();
		await tx.agentRun.update({
			where: { id: runId },
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
	});
}

export async function cancelRun(runId: string, code: string, message: string) {
	return db.$transaction(async (tx) => {
		const run = await lockAgentRun(tx, runId);
		if (isTerminalRunStatus(run.status)) {
			return { id: run.id, status: run.status, settled: false };
		}

		const sequence = run.nextEventSequence + 1;
		const finishedAt = new Date();
		await tx.agentRun.update({
			where: { id: runId },
			data: {
				status: "CANCELLED",
				errorCode: code,
				errorMessage: message,
				finishedAt,
				nextEventSequence: sequence,
			},
		});
		await tx.agentAction.updateMany({
			where: { runId: run.id, status: { in: ["PLANNED", "RUNNING"] } },
			data: {
				status: "CANCELLED",
				errorCode: code,
				errorMessage: message,
				completedAt: finishedAt,
			},
		});
		await tx.agentRunEvent.create({
			data: {
				id: runTerminalEventId(run.id, "cancelled"),
				runId: run.id,
				sequence,
				type: "run.cancelled",
				data: { code, message },
				emittedAt: finishedAt,
			},
		});
		await tx.agentAuditEvent.upsert({
			where: {
				agentId_type_requestId: {
					agentId: run.agentId,
					type: "run.cancelled",
					requestId: run.id,
				},
			},
			create: {
				agentId: run.agentId,
				versionId: run.versionId,
				actorType: "AGENT",
				actorId: run.id,
				type: "run.cancelled",
				summary: message,
				requestId: run.id,
			},
			update: {},
		});

		return { id: run.id, status: "CANCELLED" as const, settled: true };
	});
}

export function builderToken(conversationId: string): string {
	return `builder:${conversationId}`;
}

export function builderIdFromToken(token: string | undefined): string | null {
	return idFromToken(token, "builder:");
}

export function runToken(runId: string): string {
	return `run:${runId}`;
}

export function runIdFromToken(token: string | undefined): string | null {
	return idFromToken(token, "run:");
}

async function recoverBuilderSubmissions() {
	const stale = new Date(Date.now() - BUILDER_LEASE_MS);
	const rows = await db.agentConversationSubmission.findMany({
		where: {
			status: "SENDING",
			sentAt: { lt: stale },
		},
		orderBy: [{ sentAt: "asc" }, { id: "asc" }],
		take: BUILDER_BATCH * 3,
		select: { id: true, conversationId: true, attemptCount: true },
	});

	for (const row of rows) {
		await db.$transaction(async (tx) => {
			const conversation = await lockBuilderConversation(
				tx,
				row.conversationId,
			);
			if (conversation?.kind !== "BUILDER") return;
			const claimed = await tx.agentConversationSubmission.updateMany({
				where: { id: row.id, status: "SENDING", sentAt: { lt: stale } },
				data:
					row.attemptCount < MAX_BUILDER_ATTEMPTS
						? { status: "PENDING" }
						: {
								status: "FAILED",
								errorCode: "DELIVERY_EXHAUSTED",
								errorMessage:
									"The builder could not accept this message after three attempts.",
							},
			});
			if (claimed.count === 0) return;

			await tx.agentConversation.updateMany({
				where: { id: row.conversationId, kind: "BUILDER" },
				data: { continuationToken: builderToken(row.conversationId) },
			});
		});
	}
}

export type LockedBuilderConversation = {
	id: string;
	kind: string;
	sessionId: string | null;
	continuationToken: string | null;
};

export async function lockBuilderConversation(
	tx: Prisma.TransactionClient,
	conversationId: string,
): Promise<LockedBuilderConversation | null> {
	const [conversation] = await tx.$queryRaw<LockedBuilderConversation[]>`
		SELECT id, kind, "sessionId", "continuationToken"
		FROM "agentConversation"
		WHERE id = ${conversationId}
		FOR UPDATE
	`;
	return conversation ?? null;
}

export const RUN_TIMED_OUT = "RUN_TIMED_OUT";

async function timeOutOverrunningRuns() {
	const overrun = new Date(Date.now() - DISPATCH.run.executionTimeoutMs);
	const rows = await db.agentRun.findMany({
		where: {
			status: "RUNNING",
			sessionId: { not: null },
			startedAt: { lt: overrun },
		},
		orderBy: [{ startedAt: "asc" }, { id: "asc" }],
		take: RUN_BATCH * 3,
		select: { id: true },
	});

	const minutes = Math.round(DISPATCH.run.executionTimeoutMs / 60_000);
	for (const row of rows) {
		await failRun(
			row.id,
			RUN_TIMED_OUT,
			`This run passed ${minutes} minutes without finishing and was stopped.`,
		).catch(() => {});
	}
}

async function recoverAgentRuns() {
	await timeOutOverrunningRuns();

	const stale = new Date(Date.now() - RUN_DELIVERY_LEASE_MS);
	const rows = await db.agentRun.findMany({
		where: {
			status: "RUNNING",
			sessionId: null,
			startedAt: { lt: stale },
		},
		orderBy: [{ startedAt: "asc" }, { id: "asc" }],
		take: RUN_BATCH * 3,
		select: { id: true, agentId: true },
	});

	for (const row of rows) {
		await db.$transaction(async (tx) => {
			const [agent] = await tx.$queryRaw<Array<{ status: string }>>`
				SELECT status
				FROM "agentDefinition"
				WHERE id = ${row.agentId}
				FOR UPDATE
			`;
			const run = await lockAgentRun(tx, row.id);
			if (
				run.status !== "RUNNING" ||
				run.sessionId !== null ||
				!run.startedAt ||
				run.startedAt >= stale
			) {
				return;
			}

			const sequence = run.nextEventSequence + 1;
			const cancelled = agent?.status !== "LIVE" && agent?.status !== "PAUSED";
			await tx.agentRun.update({
				where: { id: run.id },
				data: cancelled
					? {
							status: "CANCELLED",
							errorCode: "AGENT_UNAVAILABLE",
							errorMessage:
								"The agent was unavailable when delivery recovery ran.",
							finishedAt: new Date(),
							nextEventSequence: sequence,
						}
					: {
							status: "QUEUED",
							startedAt: null,
							errorCode: null,
							errorMessage: null,
							finishedAt: null,
							nextEventSequence: sequence,
						},
			});
			await tx.agentRunEvent.create({
				data: {
					id: `run-delivery-${cancelled ? "cancelled" : "recovered"}:${run.id}:${run.startedAt.toISOString()}`,
					runId: run.id,
					sequence,
					type: cancelled ? "run.cancelled" : "run.delivery_recovered",
					data: cancelled ? { reason: "agent.unavailable" } : {},
				},
			});
		});
	}
}

export function builderDeliveryMessage(
	submissionId: string,
	value: unknown,
	attachments: readonly BuilderDeliveryAttachment[] = [],
): Parameters<SendFn>[0] {
	const message = recordOf(value);
	const inputResponse = recordOf(message.inputResponse);
	const requestId = textOf(inputResponse.requestId);
	const optionId = textOf(inputResponse.optionId);
	const responseText = textOf(inputResponse.text);
	if (requestId && (optionId || responseText)) {
		return {
			inputResponses: [
				{
					requestId,
					...(optionId ? { optionId } : { text: responseText }),
				},
			],
		};
	}

	const text = typeof message.text === "string" ? message.text : "";
	const resources = Array.isArray(message.resources) ? message.resources : [];
	const context = [
		`Submission id: ${submissionId}`,
		resources.length > 0
			? `Tagged resources: ${resources.map(resourceLabel).filter(Boolean).join(", ")}`
			: null,
	]
		.filter(Boolean)
		.join("\n");
	const parts: Array<Record<string, unknown>> = [
		{ type: "text", text: `${context}\n\n${text}` },
	];

	for (const attachment of attachments) {
		parts.push({
			type: "file",
			data: attachment.content,
			mediaType: attachment.mediaType,
			filename: attachment.name,
		});
	}

	return parts as Parameters<SendFn>[0];
}

export function builderCommandType(
	commandType: string,
	value: unknown,
): string {
	const inputResponse = recordOf(recordOf(value).inputResponse);
	return textOf(inputResponse.requestId) &&
		(textOf(inputResponse.optionId) || textOf(inputResponse.text))
		? "CREATE_AGENT"
		: commandType;
}

type BuilderDeliveryAttachment = {
	name: string;
	mediaType: string;
	content: Uint8Array;
};

function resourceLabel(value: unknown): string | null {
	const row = recordOf(value);
	return typeof row.label === "string" ? row.label : null;
}

function textOf(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function intervalOf(value: unknown): number {
	const interval = recordOf(value).intervalMinutes;
	return typeof interval === "number" &&
		Number.isFinite(interval) &&
		interval >= 1
		? Math.min(interval, 525_600)
		: 1440;
}

function advance(from: Date, intervalMinutes: number, now: Date): Date {
	const intervalMs = intervalMinutes * 60_000;
	const missed = Math.max(
		1,
		Math.floor((now.getTime() - from.getTime()) / intervalMs) + 1,
	);
	return new Date(from.getTime() + missed * intervalMs);
}

function idFromToken(token: string | undefined, marker: string): string | null {
	if (!token) return null;
	const index = token.lastIndexOf(marker);
	if (index === -1) return null;
	const id = token.slice(index + marker.length);
	return id || null;
}

function recordOf(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
