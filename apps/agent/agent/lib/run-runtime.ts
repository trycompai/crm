import { createHash, randomUUID } from "node:crypto";
import { ActivityType, db, type Prisma } from "@crm/db";
import type { AgentActionStatus, AgentTriggerType } from "@crm/db/enums";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import {
	type AgentActionResult,
	parseAgentActionResult,
	readAgentActionResult,
} from "@crm/validation/agent-action";
import {
	AGENT_ACTION_TYPES,
	type AgentManifestResource,
	parseAgentManifest,
	SLACK_WORKSPACE_RESOURCE_ID,
} from "@crm/validation/agent-manifest";
import { z } from "zod";
import { readCompanyHistory, readDealHistory } from "./accounts";
import {
	AGENT_ACTION_EXECUTORS,
	actionDependency,
	isAgentActionType,
} from "./agent-actions";
import { readCrmHistory } from "./crm";
import { DISPATCH } from "./dispatch-config";
import { searchCrm } from "./lookup";
import {
	channelOfRun,
	claimSlackChannel,
	runWatchesSlackChannel,
} from "./run-resume";
import {
	type LockedAgentRun,
	lockAgentRun,
	runTerminalEventId,
} from "./run-state";
import { toChannelName } from "./slack-channel-name";
import { slackAccessToken } from "./slack-connection";
import { type InviteOutcome, inviteToSlackChannel } from "./slack-invite";
import { createSlackChannel } from "./slack-membership";
import { addDealOwner } from "./slack-owner";

const ACTION_LEASE_MS = DISPATCH.run.actionLeaseMs;
const NO_ACTION_TRIGGER_TYPES = new Set<AgentTriggerType>(
	DISPATCH.run.noActionTriggerTypes,
);

type RunRecordScope = "SELECTED" | "WORKSPACE";

const json = z.json();

type Json = z.infer<typeof json>;

const runResult = z.record(z.string(), json);

export type RunResult = z.infer<typeof runResult>;

const storedRunResult = runResult.catch({});

export type SlackRunDestination = {
	kind: "channel" | "user";
	id: string;
	label: string;
};

type RunDataScope = {
	mode: RunRecordScope;
	resources: AgentManifestResource[];
};

export type RunHistorySources = {
	gmail: boolean;
	calendar: boolean;
};

type SlackRequestBody = Record<string, Json>;

type HashableRequest = Record<string, string | boolean | null>;

const optionalText = z.string().nullable().catch(null);

const slackActionMetadata = z
	.object({ clientMessageId: z.string().min(1).nullable().catch(null) })
	.catch({ clientMessageId: null });

const slackEnvelope = z
	.object({ ok: z.boolean().nullable().catch(null), error: optionalText })
	.catch({ ok: null, error: null });

const slackOpenedConversation = z
	.object({
		channel: z
			.object({ id: z.string().min(1).nullable().catch(null) })
			.nullable()
			.catch(null),
	})
	.catch({ channel: null });

const slackPostedMessage = z
	.object({ channel: optionalText, ts: optionalText })
	.catch({ channel: null, ts: null });

const noActionResult = z
	.object({ noActionNeeded: optionalText })
	.catch({ noActionNeeded: null });

type RunActionRow = {
	id: string;
	type: string;
	status: AgentActionStatus;
	externalId: string | null;
	requestHash: string | null;
	metadata: Prisma.JsonValue;
	result: Prisma.JsonValue | null;
};

type RunActionClaim =
	| {
			claimed: false;
			actionId: string;
			externalId: string | null;
			result: AgentActionResult | null;
	  }
	| {
			claimed: true;
			actionId: string;
			claimedAt: Date;
			metadata: Prisma.JsonValue;
	  };

const RUN_ACTION_FIELDS = {
	id: true,
	type: true,
	status: true,
	externalId: true,
	requestHash: true,
	metadata: true,
	result: true,
} as const;

function storedActionResult(result: AgentActionResult): Prisma.InputJsonValue {
	return parseAgentActionResult(
		JSON.parse(JSON.stringify(result)),
	) as Prisma.InputJsonValue;
}

function slackInviteResult(channelId: string, outcomes: InviteOutcome[]) {
	const invited: Extract<InviteOutcome, { invited: true }>[] = [];
	for (const outcome of outcomes) {
		if (outcome.invited) invited.push(outcome);
	}
	const chosen = invited.find((outcome) => outcome.invite_id) ?? invited[0];
	if (!chosen) {
		throw new Error("Slack didn't send an invite we could save.");
	}
	return {
		externalId: chosen.invite_id ?? channelId,
		result: parseAgentActionResult({
			type: AGENT_ACTION_TYPES.SLACK_CHANNEL_INVITE,
			email: chosen.email,
			kind: chosen.kind,
			invite_id: chosen.invite_id,
			url: chosen.url,
		}),
	};
}

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
	const existing = await findRunAction(idempotencyKey, requestHash);
	if (existing?.status === "SUCCEEDED") {
		return {
			actionId: existing.id,
			activityId: existing.externalId,
			result: readAgentActionResult(existing.type, existing.result),
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

	const claim = await claimRunAction(existing, idempotencyKey, requestHash, {
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
	});
	if (!claim.claimed) {
		return {
			actionId: claim.actionId,
			activityId: claim.externalId,
			result: claim.result,
			replayed: true,
		};
	}

	try {
		const activityId = `agent-action-${claim.actionId}`;
		const now = new Date();
		const result = parseAgentActionResult({
			type: AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE,
			activityId,
		});

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
						actionId: claim.actionId,
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
				where: { id: claim.actionId },
				data: {
					status: "SUCCEEDED",
					externalId: activityId,
					result: storedActionResult(result),
					completedAt: now,
				},
			});
		});

		return {
			actionId: claim.actionId,
			activityId,
			result,
			replayed: false,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await failRunAction(claim, "ACTION_REJECTED", message);
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
	const existing = await findRunAction(idempotencyKey, requestHash);
	if (existing?.status === "SUCCEEDED") {
		return {
			actionId: existing.id,
			messageId: existing.externalId,
			destination: destination.label,
			result: readAgentActionResult(existing.type, existing.result),
			replayed: true,
		};
	}
	if (run.status !== "RUNNING") {
		throw new Error("This agent run is not active.");
	}

	const claim = await claimRunAction(existing, idempotencyKey, requestHash, {
		agentId: run.agentId,
		runId,
		type: "slack.message.post",
		provider: "slack",
		targetType: destination.kind,
		targetId: destination.id,
		targetLabel: destination.label,
		summary: `Post a message to ${destination.label}`,
		metadata: { clientMessageId: randomUUID() },
	});
	if (!claim.claimed) {
		return {
			actionId: claim.actionId,
			messageId: claim.externalId,
			destination: destination.label,
			result: claim.result,
			replayed: true,
		};
	}

	const { actionId, claimedAt } = claim;
	try {
		await assertRunActive(runId);
		const { clientMessageId } = slackActionMetadata.parse(claim.metadata);
		if (!clientMessageId) {
			throw new Error("This Slack action is missing its replay key.");
		}
		const accessToken = await slackAccessToken();
		if (!accessToken) throw new Error("Slack is not connected.");

		const posted = await sendSlackMessage(
			accessToken,
			destination,
			text,
			clientMessageId,
			{
				abortSignal,
				beforePost: () => holdRunActionClaim(runId, actionId, claimedAt),
			},
		);
		const result = parseAgentActionResult({
			type: AGENT_ACTION_TYPES.SLACK_MESSAGE_POST,
			channel: posted.channel,
			ts: posted.ts,
		});
		const messageId = `${posted.channel}:${posted.ts}`;
		const completed = await db.agentAction.updateMany({
			where: { id: actionId, status: "RUNNING", startedAt: claimedAt },
			data: {
				status: "SUCCEEDED",
				externalId: messageId,
				result: storedActionResult(result),
				completedAt: new Date(),
			},
		});
		if (completed.count === 0) {
			await recordDeliveryOutsideClaim(actionId, messageId, result);
			throw new Error(
				"This agent run stopped while Slack was accepting the message.",
			);
		}

		return {
			actionId,
			messageId,
			destination: destination.label,
			result,
			replayed: false,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await failRunAction(claim, slackActionErrorCode(message), message);
		throw error;
	}
}

async function findRunAction(
	idempotencyKey: string,
	requestHash: string,
): Promise<RunActionRow | null> {
	const existing = await db.agentAction.findUnique({
		where: { idempotencyKey },
		select: RUN_ACTION_FIELDS,
	});
	if (existing) assertActionRequestMatches(existing.requestHash, requestHash);
	return existing;
}

async function claimRunAction(
	existing: RunActionRow | null,
	idempotencyKey: string,
	requestHash: string,
	data: Omit<
		Prisma.AgentActionUncheckedCreateInput,
		"idempotencyKey" | "requestHash"
	>,
): Promise<RunActionClaim> {
	const action =
		existing ??
		(await db.$transaction(async (tx) => {
			await lockIdempotencyKey(tx, idempotencyKey);
			const winner = await tx.agentAction.findUnique({
				where: { idempotencyKey },
				select: RUN_ACTION_FIELDS,
			});
			if (winner) {
				assertActionRequestMatches(winner.requestHash, requestHash);
				return winner;
			}

			return tx.agentAction.create({
				data: { ...data, idempotencyKey, requestHash },
				select: RUN_ACTION_FIELDS,
			});
		}));
	if (action.status === "SUCCEEDED") {
		return {
			claimed: false,
			actionId: action.id,
			externalId: action.externalId,
			result: readAgentActionResult(action.type, action.result),
		};
	}

	const claimedAt = new Date();
	const claimed = await db.agentAction.updateMany({
		where: {
			id: action.id,
			OR: [
				{ status: { in: ["PLANNED", "FAILED"] } },
				{
					status: "RUNNING",
					startedAt: { lt: new Date(claimedAt.getTime() - ACTION_LEASE_MS) },
				},
			],
		},
		data: {
			status: "RUNNING",
			startedAt: claimedAt,
			completedAt: null,
			attemptCount: { increment: 1 },
			errorCode: null,
			errorMessage: null,
		},
	});
	if (claimed.count === 0) {
		const current = await db.agentAction.findUnique({
			where: { id: action.id },
			select: { status: true, externalId: true, result: true },
		});
		if (current?.status === "SUCCEEDED") {
			return {
				claimed: false,
				actionId: action.id,
				externalId: current.externalId,
				result: readAgentActionResult(action.type, current.result),
			};
		}
		throw new Error("This agent action is already in progress.");
	}

	return {
		claimed: true,
		actionId: action.id,
		claimedAt,
		metadata: action.metadata,
	};
}

async function failRunAction(
	claim: Extract<RunActionClaim, { claimed: true }>,
	code: string,
	message: string,
): Promise<void> {
	await db.agentAction.updateMany({
		where: {
			id: claim.actionId,
			status: "RUNNING",
			startedAt: claim.claimedAt,
		},
		data: {
			status: "FAILED",
			errorCode: code,
			errorMessage: message,
			completedAt: new Date(),
		},
	});
}

export async function sendSlackMessage(
	accessToken: string,
	destination: SlackRunDestination,
	text: string,
	clientMessageId: string,
	options: {
		fetcher?: typeof fetch;
		abortSignal?: AbortSignal;
		beforePost?: () => Promise<void>;
	} = {},
): Promise<{ channel: string; ts: string }> {
	const { fetcher = fetch, abortSignal, beforePost } = options;
	let channel = destination.id;
	if (destination.kind === "user") {
		const opened = slackOpenedConversation.parse(
			await slackApiRequest(
				fetcher,
				accessToken,
				"conversations.open",
				{ users: destination.id, return_im: true },
				abortSignal,
			),
		);
		if (!opened.channel?.id) {
			throw new Error("Slack did not return a direct-message channel.");
		}
		channel = opened.channel.id;
	}
	await beforePost?.();

	const posted = slackPostedMessage.parse(
		await slackApiRequest(
			fetcher,
			accessToken,
			"chat.postMessage",
			{
				channel,
				text,
				client_msg_id: clientMessageId,
			},
			abortSignal,
		),
	);
	if (posted.channel === null || posted.ts === null) {
		throw new Error("Slack returned an incomplete message receipt.");
	}

	return { channel: posted.channel, ts: posted.ts };
}

async function assertRunActive(runId: string): Promise<void> {
	const run = await db.agentRun.findUnique({
		where: { id: runId },
		select: { status: true },
	});
	if (run?.status !== "RUNNING") {
		throw new Error("This agent run is not active.");
	}
}

async function holdRunActionClaim(
	runId: string,
	actionId: string,
	claimedAt: Date,
): Promise<void> {
	await db.$transaction(async (tx) => {
		const run = await lockAgentRun(tx, runId);
		if (run.status !== "RUNNING") {
			throw new Error("This agent run is not active.");
		}
		const held = await tx.agentAction.count({
			where: { id: actionId, status: "RUNNING", startedAt: claimedAt },
		});
		if (held === 0) {
			throw new Error("This agent action is no longer held by this run.");
		}
	});
}

async function recordDeliveryOutsideClaim(
	actionId: string,
	externalId: string,
	result: AgentActionResult,
): Promise<void> {
	const delivered =
		"Slack accepted this message before the run stopped, and it cannot be withdrawn.";
	const current = await db.agentAction.findUnique({
		where: { id: actionId },
		select: { status: true, externalId: true, errorMessage: true },
	});
	if (!current || current.status === "SUCCEEDED" || current.externalId) return;

	await db.agentAction.updateMany({
		where: { id: actionId, status: { not: "SUCCEEDED" }, externalId: null },
		data: {
			externalId,
			result: storedActionResult(result),
			errorMessage: current.errorMessage
				? `${current.errorMessage} ${delivered}`
				: delivered,
		},
	});
}

async function slackApiRequest(
	fetcher: typeof fetch,
	accessToken: string,
	method: string,
	body: SlackRequestBody,
	abortSignal?: AbortSignal,
): Promise<Json> {
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

	const data = json.catch(null).parse(await response.json());
	const envelope = slackEnvelope.parse(data);
	if (envelope.ok !== true) {
		const reason = envelope.error ?? "rejected";
		if (reason === "not_in_channel") {
			throw new Error(
				"Comp AI isn't in that channel. Invite it there, then try again.",
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
	input: {
		summary: string;
		result?: RunResult | null;
		noActionNeeded?: { reason: string } | null;
	},
) {
	return db.$transaction(async (tx) => {
		const run = await lockAgentRun(tx, runId);
		if (run.status !== "RUNNING") {
			throw new Error(`This agent run already ended with ${run.status}.`);
		}
		if (input.noActionNeeded) {
			const refusal = await noActionNeededRefusal(tx, run);
			if (refusal) throw new Error(refusal);
		}

		const result: RunResult = { ...(input.result ?? {}) };
		if (input.noActionNeeded) {
			result.noActionNeeded = input.noActionNeeded.reason;
		}

		await tx.agentRun.update({
			where: { id: runId },
			data: {
				summary: input.summary,
				result: result as Prisma.InputJsonValue,
			},
		});

		return { id: run.id, status: "RUNNING" as const };
	});
}

export function runResultOf(value: Prisma.JsonValue): RunResult {
	return storedRunResult.parse(value);
}

export function runReportedNoActionNeeded(
	result: RunResult | null | undefined,
): boolean {
	return noActionResult.parse(result).noActionNeeded !== null;
}

export async function finishRun(
	runId: string,
	input: { summary: string; result?: RunResult | null },
) {
	return db.$transaction(async (tx) => {
		const run = await lockAgentRun(tx, runId);
		if (run.status === "SUCCEEDED") {
			return { id: run.id, status: "SUCCEEDED" as const };
		}
		if (run.status !== "RUNNING") {
			throw new Error(`This agent run already ended with ${run.status}.`);
		}
		const noActionAccepted =
			runReportedNoActionNeeded(input.result) &&
			(await noActionNeededRefusal(tx, run)) === null;
		const actionFailure = noActionAccepted
			? null
			: await requiredActionFailure(tx, run);
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

async function noActionNeededRefusal(
	tx: Prisma.TransactionClient,
	run: LockedAgentRun,
): Promise<string | null> {
	const { triggerType } = await tx.agentRun.findUniqueOrThrow({
		where: { id: run.id },
		select: { triggerType: true },
	});
	if (NO_ACTION_TRIGGER_TYPES.has(triggerType)) return null;

	const version = await tx.agentVersion.findUniqueOrThrow({
		where: { id: run.versionId },
		select: { manifest: true },
	});
	if (externalManifestActions(version.manifest).length === 0) return null;

	return `This ${triggerType.toLowerCase()} run cannot end with no action needed, because its agent declares an action. Perform the declared action, or report why it failed.`;
}

async function requiredActionFailure(
	tx: Prisma.TransactionClient,
	run: LockedAgentRun,
): Promise<{ code: string; message: string } | null> {
	const version = await tx.agentVersion.findUniqueOrThrow({
		where: { id: run.versionId },
		select: { manifest: true },
	});
	const external = externalManifestActions(version.manifest);
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
		const type = action.type;
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
						(isAgentActionType(type) && actionDependency(type)?.id) || "crm",
					summary: action.summary,
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

function manifestDataScope(value: Prisma.JsonValue): RunDataScope {
	const scope = parseAgentManifest(value).dataScope;
	const resources = scope.resources;
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

function manifestActions(value: Prisma.JsonValue) {
	return parseAgentManifest(value).actions;
}

function externalManifestActions(value: Prisma.JsonValue) {
	return manifestActions(value).filter(
		(action) => action.type !== AGENT_ACTION_TYPES.RUN_SUMMARY,
	);
}

function assertActivityAllowed(
	manifest: Prisma.JsonValue,
	activityType: "NOTE" | "TASK",
) {
	const allowed = manifestActions(manifest).some(
		(action) =>
			action.type === AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE &&
			action.activityTypes.includes(activityType),
	);
	if (!allowed) {
		throw new Error(
			`Agent version does not allow CRM ${activityType.toLowerCase()} activities.`,
		);
	}
}

function assertSlackActionApproved(
	manifest: Prisma.JsonValue,
	type: (typeof AGENT_ACTION_TYPES)[keyof typeof AGENT_ACTION_TYPES],
): void {
	if (!manifestActions(manifest).some((action) => action.type === type)) {
		throw new Error(`Agent version does not allow ${type}.`);
	}
}

export async function openRunSlackChannel(
	runId: string,
	callId: string,
	input: { name: string; isPrivate: boolean },
) {
	const run = await activeRunForSlack(
		runId,
		AGENT_ACTION_TYPES.SLACK_CHANNEL_OPEN,
	);

	const channelName = toChannelName(input.name);
	if (!channelName) {
		throw new Error("That name has no letters or numbers Slack accepts.");
	}

	const idempotencyKey = `${runId}:${callId}`;
	const requestHash = hashRequest({ channelName, isPrivate: input.isPrivate });
	const existing = await findRunAction(idempotencyKey, requestHash);
	if (existing?.status === "SUCCEEDED") {
		return {
			actionId: existing.id,
			channelId: existing.externalId,
			channelName,
			watching: await runWatchesSlackChannel(runId, existing.externalId),
			result: readAgentActionResult(existing.type, existing.result),
			replayed: true,
		};
	}

	const claim = await claimRunAction(existing, idempotencyKey, requestHash, {
		agentId: run.agentId,
		runId,
		type: AGENT_ACTION_TYPES.SLACK_CHANNEL_OPEN,
		provider: "slack",
		targetType: "channel",
		targetId: channelName,
		targetLabel: `#${channelName}`,
		summary: `Open #${channelName}`,
	});
	if (!claim.claimed) {
		return {
			actionId: claim.actionId,
			channelId: claim.externalId,
			channelName,
			watching: await runWatchesSlackChannel(runId, claim.externalId),
			result: claim.result,
			replayed: true,
		};
	}

	try {
		await assertRunActive(runId);
		const outcome = await createSlackChannel(channelName, input.isPrivate);
		if ("error" in outcome) throw new Error(outcome.error);

		await claimSlackChannel(runId, outcome.id);
		const watching = await runWatchesSlackChannel(runId, outcome.id);
		const owner = await addDealOwner(runId, outcome.id).catch((error) => ({
			added: false as const,
			reason: error instanceof Error ? error.message : String(error),
		}));
		const result = parseAgentActionResult({
			type: AGENT_ACTION_TYPES.SLACK_CHANNEL_OPEN,
			channelId: outcome.id,
		});
		await settleRunAction(claim, outcome.id, result);

		return {
			actionId: claim.actionId,
			channelId: outcome.id,
			channelName: outcome.name,
			watching,
			owner,
			result,
			replayed: false,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await failRunAction(claim, slackActionErrorCode(message), message);
		throw error;
	}
}

export async function inviteToRunSlackChannel(
	runId: string,
	callId: string,
	input: { emails: string[] },
) {
	const run = await activeRunForSlack(
		runId,
		AGENT_ACTION_TYPES.SLACK_CHANNEL_INVITE,
	);

	const channelId = await channelOfRun(runId);
	if (!channelId) {
		throw new Error(
			"This run has no Slack channel yet. Open one with open_slack_channel first.",
		);
	}

	const emails = [...new Set(input.emails.map((email) => email.trim()))].sort();
	const idempotencyKey = `${runId}:${callId}`;
	const requestHash = hashRequest({ channelId, emails: emails.join(",") });
	const existing = await findRunAction(idempotencyKey, requestHash);
	if (existing?.status === "SUCCEEDED") {
		return {
			actionId: existing.id,
			channelId,
			result: readAgentActionResult(existing.type, existing.result),
			replayed: true,
		};
	}

	const claim = await claimRunAction(existing, idempotencyKey, requestHash, {
		agentId: run.agentId,
		runId,
		type: AGENT_ACTION_TYPES.SLACK_CHANNEL_INVITE,
		provider: "slack",
		targetType: "channel",
		targetId: channelId,
		targetLabel: channelId,
		summary:
			emails.length === 1
				? "Invited 1 person"
				: `Invited ${emails.length} people`,
	});
	if (!claim.claimed) {
		return {
			actionId: claim.actionId,
			channelId,
			result: claim.result,
			replayed: true,
		};
	}

	try {
		await assertRunActive(runId);
		const outcomes = [];
		for (const email of emails) {
			outcomes.push(await inviteToSlackChannel(channelId, email));
		}

		const invited = outcomes.filter((outcome) => outcome.invited);
		const refused = outcomes.filter((outcome) => !outcome.invited);
		if (invited.length === 0) {
			throw new Error(
				refused.map((outcome) => outcome.reason).join(" ") ||
					"Slack refused every invitation.",
			);
		}

		const stored = slackInviteResult(channelId, outcomes);
		await settleRunAction(claim, stored.externalId, stored.result);

		return {
			actionId: claim.actionId,
			channelId,
			result: stored.result,
			invited,
			refused,
			replayed: false,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await failRunAction(claim, slackActionErrorCode(message), message);
		throw error;
	}
}

async function activeRunForSlack(
	runId: string,
	type: (typeof AGENT_ACTION_TYPES)[keyof typeof AGENT_ACTION_TYPES],
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
	if (run.status !== "RUNNING") {
		throw new Error("This agent run is not active.");
	}

	assertSlackWorkspaceApproved(run.version.manifest);
	assertSlackActionApproved(run.version.manifest, type);

	return run;
}

async function settleRunAction(
	claim: Extract<RunActionClaim, { claimed: true }>,
	externalId: string,
	result: AgentActionResult,
): Promise<void> {
	const completed = await db.agentAction.updateMany({
		where: {
			id: claim.actionId,
			status: "RUNNING",
			startedAt: claim.claimedAt,
		},
		data: {
			status: "SUCCEEDED",
			externalId,
			result: storedActionResult(result),
			completedAt: new Date(),
		},
	});
	if (completed.count === 0) {
		await recordDeliveryOutsideClaim(claim.actionId, externalId, result);
		throw new Error("This agent run stopped while Slack was still working.");
	}
}

export function approvedSlackDestination(
	manifest: Prisma.JsonValue,
): SlackRunDestination {
	assertSlackWorkspaceApproved(manifest);

	const destinations = manifestActions(manifest).flatMap((action) =>
		action.type === AGENT_ACTION_TYPES.SLACK_MESSAGE_POST
			? [
					{
						kind: action.destination.kind,
						id: action.destination.id,
						label: action.destination.label,
					},
				]
			: [],
	);
	const [destination] = destinations;
	if (!destination || destinations.length !== 1) {
		throw new Error(
			"Agent version needs exactly one approved Slack destination.",
		);
	}

	return destination;
}

function assertSlackWorkspaceApproved(manifest: Prisma.JsonValue): void {
	const scope = manifestDataScope(manifest);
	if (
		!scope.resources.some(
			(resource) =>
				resource.kind === "integration" &&
				resource.id === SLACK_WORKSPACE_RESOURCE_ID,
		)
	) {
		throw new Error("Agent version does not allow Slack.");
	}
}

function assertResourceAllowed(
	mode: RunRecordScope,
	resources: AgentManifestResource[],
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

export function allowedHistorySources(
	resources: AgentManifestResource[],
): RunHistorySources {
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

function hashRequest(input: HashableRequest): string {
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
