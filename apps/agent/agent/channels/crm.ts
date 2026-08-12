import { timingSafeEqual } from "node:crypto";
import { EnrichmentStatus, Prisma } from "@crm/db";
import { MAX_ATTEMPTS } from "@crm/db/agent-tasks";
import { schemas } from "@crm/validation";
import { defineChannel, GET, POST } from "eve/channels";
import { persistBuilderInputRequest } from "../lib/builder-input";
import { verifyKey } from "../lib/context-dev";
import {
	builderIdFromToken,
	builderToken,
	cancelRun,
	dispatchAgentRun,
	dispatchBuilderSubmission,
	drainAgentRuns,
	drainBuilder,
	failRun,
	runIdFromToken,
	runToken,
} from "../lib/custom-agent-dispatch";
import {
	brief,
	DRAIN_TIMEOUT_MS,
	dispatchHealth,
	drainAll,
	taskAuth,
} from "../lib/dispatch";
import { DISPATCH } from "../lib/dispatch-config";
import { settle } from "../lib/enrichment";
import { ensureInboundSyncTasks } from "../lib/inbound-sync";
import { finishRun } from "../lib/run-runtime";
import { attribute } from "../lib/session-purpose";
import { createSlackChannel } from "../lib/slack-membership";
import { completeTask, releaseTaskForRetry, taskSubject } from "../lib/tasks";

const TASK_MARKER = "task:";
const STALE_QUEUE_MS = DISPATCH.sweep.staleQueueMs;

function authorised(request: Request): boolean {
	const secret = process.env.AGENT_BRIDGE_SECRET?.trim();
	if (!secret) return false;
	const header = request.headers.get("authorization");
	if (!header?.startsWith("Bearer ")) return false;
	const candidate = Buffer.from(header.slice("Bearer ".length));
	const expected = Buffer.from(secret);
	if (candidate.length !== expected.length) return false;

	return timingSafeEqual(candidate, expected);
}

export function taskToken(taskId: string, expectedAttempt?: number): string {
	return `${TASK_MARKER}${taskId}${expectedAttempt === undefined ? "" : `@${expectedAttempt}`}`;
}

export function taskLeaseFromToken(
	token: string | undefined,
): { taskId: string; expectedAttempt: number | null } | null {
	if (!token) return null;

	const marker = token.lastIndexOf(TASK_MARKER);
	if (marker === -1) return null;

	const value = token.slice(marker + TASK_MARKER.length);
	if (value.length === 0) return null;

	const separator = value.lastIndexOf("@");
	if (separator === -1) {
		return { taskId: value, expectedAttempt: null };
	}

	const taskId = value.slice(0, separator);
	const attempt = Number(value.slice(separator + 1));
	if (!taskId || !Number.isSafeInteger(attempt) || attempt < 1) return null;

	return { taskId, expectedAttempt: attempt };
}

export function taskFromToken(token: string | undefined): string | null {
	return taskLeaseFromToken(token)?.taskId ?? null;
}

export default defineChannel({
	routes: [
		GET("/internal/crm/dispatch-health", async (request) => {
			if (!authorised(request)) {
				return new Response("Unauthorized", { status: 401 });
			}

			const health = dispatchHealth();
			const { db } = await import("@crm/db");
			const now = new Date();
			const overdue = await db.agentTask.count({
				where: {
					finishedAt: null,
					dueAt: { lte: new Date(now.getTime() - STALE_QUEUE_MS) },
					attempts: { lt: MAX_ATTEMPTS },
					OR: [{ leasedUntil: null }, { leasedUntil: { lt: now } }],
				},
			});

			const wedged = health.stalledMs > DRAIN_TIMEOUT_MS;
			return Response.json(
				{
					ok: !wedged && overdue === 0,
					wedged,
					overdueTasks: overdue,
					...health,
				},
				{ status: wedged || overdue > 0 ? 503 : 200 },
			);
		}),

		POST("/internal/crm/dispatch", async (request, { send, waitUntil }) => {
			if (!authorised(request)) {
				return new Response("Unauthorized", { status: 401 });
			}

			waitUntil(
				(async () => {
					await ensureInboundSyncTasks();
					await drainAll((task) =>
						send(brief(task), {
							auth: taskAuth(task),
							continuationToken: taskToken(task.id, task.attempts),
						}),
					);
					await drainAgentRuns(send);
				})(),
			);

			return new Response(null, { status: 202 });
		}),

		POST(
			"/internal/crm/builder-dispatch",
			async (request, { send, waitUntil }) => {
				if (!authorised(request)) {
					return new Response("Unauthorized", { status: 401 });
				}

				waitUntil(drainBuilder(send));
				return new Response(null, { status: 202 });
			},
		),

		POST(
			"/internal/crm/agent-dispatch",
			async (request, { send, waitUntil }) => {
				if (!authorised(request)) {
					return new Response("Unauthorized", { status: 401 });
				}

				waitUntil(drainAgentRuns(send));
				return new Response(null, { status: 202 });
			},
		),

		POST("/internal/crm/cancel-run", async (request, { cancel }) => {
			if (!authorised(request)) {
				return new Response("Unauthorized", { status: 401 });
			}

			const body = (await request.json().catch(() => null)) as {
				runId?: unknown;
			} | null;
			const runId = typeof body?.runId === "string" ? body.runId.trim() : null;
			if (!runId) {
				return Response.json({ error: "No run id was sent." }, { status: 400 });
			}

			return Response.json(
				await cancel({ continuationToken: runToken(runId) }),
			);
		}),

		POST("/internal/crm/slack/create-channel", async (request) => {
			if (!authorised(request)) {
				return new Response("Unauthorized", { status: 401 });
			}

			const parsed = schemas.slack.createPayload.safeParse(
				await request.json().catch(() => null),
			);

			if (!parsed.success) {
				return Response.json(
					{ error: "That channel name is not usable." },
					{ status: 400 },
				);
			}

			const outcome = await createSlackChannel(
				parsed.data.channelName,
				parsed.data.isPrivate,
			);

			return "error" in outcome
				? Response.json({ error: outcome.error }, { status: 422 })
				: Response.json({ channel: outcome });
		}),

		POST("/internal/crm/verify-key", async (request) => {
			if (!authorised(request)) {
				return new Response("Unauthorized", { status: 401 });
			}

			const body = (await request.json().catch(() => null)) as {
				apiKey?: unknown;
			} | null;

			const apiKey =
				typeof body?.apiKey === "string" ? body.apiKey.trim() : null;

			if (!apiKey) {
				return Response.json(
					{ outcome: "invalid", reason: "No API key was sent." },
					{ status: 400 },
				);
			}

			return Response.json(await verifyKey(apiKey));
		}),
	],

	events: {
		async "input.requested"(data, channel, ctx) {
			await persistBuilderInputRequest(
				data,
				channel.continuationToken,
				attribute(ctx, "conversationId"),
			);
		},

		async "message.completed"(data, channel) {
			const conversationId = builderIdFromToken(channel.continuationToken);
			if (!conversationId || !data.message?.trim()) return;

			await import("@crm/db").then(({ db }) =>
				db.agentConversation.updateMany({
					where: { id: conversationId, kind: "BUILDER" },
					data: {
						lastAssistantAt: new Date(),
						lastMessageAt: new Date(),
						messageCount: { increment: 1 },
					},
				}),
			);
		},

		async "session.waiting"(_data, channel) {
			const lease = taskLeaseFromToken(channel.continuationToken);
			if (lease?.expectedAttempt) {
				const { taskId, expectedAttempt } = lease;
				const subject = await taskSubject(taskId);
				if (!subject) return;
				if (subject.kind === "lead-discovery") {
					const count = await import("@crm/db").then(({ db }) =>
						db.prospect.count({ where: { sourceBatch: `agent:${taskId}` } }),
					);
					if (count > 0) {
						await completeTask(
							taskId,
							expectedAttempt,
							`Created ${count} fresh candidates and queued full research.`,
						);
					} else {
						await releaseTaskForRetry(taskId, expectedAttempt);
					}
					return;
				}
				if (subject.kind === "outreach-compose" && subject.prospectId) {
					const count = await import("@crm/db").then(({ db }) =>
						db.emailDraft.count({
							where: {
								prospectId: subject.prospectId as string,
								status: "PENDING_APPROVAL",
							},
						}),
					);
					if (count === 3) {
						await completeTask(
							taskId,
							expectedAttempt,
							"Three-step outreach sequence prepared for review.",
						);
					} else {
						await releaseTaskForRetry(taskId, expectedAttempt);
					}
					return;
				}
				if (subject.kind === "customer-onboarding-plan" && subject.dealId) {
					const planned = await import("@crm/db").then(({ db }) =>
						db.customerOnboarding.findUnique({
							where: { dealId: subject.dealId as string },
							select: { agentPlannedAt: true },
						}),
					);
					if (planned?.agentPlannedAt) {
						await completeTask(
							taskId,
							expectedAttempt,
							"Customer systems and data onboarding plan recorded.",
						);
					} else {
						await releaseTaskForRetry(taskId, expectedAttempt);
					}
					return;
				}
				if (subject.kind === "prospect-research" && subject.prospectId) {
					const prospect = await import("@crm/db").then(({ db }) =>
						db.prospect.findUnique({
							where: { id: subject.prospectId as string },
							select: { enrichmentStatus: true, lastResearchedAt: true },
						}),
					);
					if (
						prospect?.enrichmentStatus === EnrichmentStatus.COMPLETE &&
						prospect.lastResearchedAt
					) {
						await completeTask(
							taskId,
							expectedAttempt,
							"Prospect research recorded.",
						);
					} else {
						const released = await releaseTaskForRetry(taskId, expectedAttempt);
						if (released) {
							await settle(
								released,
								EnrichmentStatus.FAILED,
								"The agent finished without recording prospect research.",
							);
						}
					}
					return;
				}

				const completed = await completeTask(taskId, expectedAttempt, "ran");
				if (completed) await settle(completed, EnrichmentStatus.COMPLETE);
				return;
			}

			const conversationId = builderIdFromToken(channel.continuationToken);
			if (!conversationId) return;

			await import("@crm/db").then(({ db }) =>
				db.agentConversation.updateMany({
					where: { id: conversationId, kind: "BUILDER" },
					data: { continuationToken: builderToken(conversationId) },
				}),
			);
		},

		async "turn.failed"(data, channel) {
			const lease = taskLeaseFromToken(channel.continuationToken);
			const reason =
				typeof data === "object" && data && "message" in data
					? String((data as { message: unknown }).message)
					: "The agent turn failed.";

			if (lease?.expectedAttempt) {
				const { taskId, expectedAttempt } = lease;
				const released = await releaseTaskForRetry(taskId, expectedAttempt);
				if (released) {
					await settle(released, EnrichmentStatus.FAILED, reason);
				}
				return;
			}

			const conversationId = builderIdFromToken(channel.continuationToken);
			if (conversationId) {
				const { db } = await import("@crm/db");
				await db.agentConversation.updateMany({
					where: { id: conversationId, kind: "BUILDER" },
					data: {
						continuationToken: builderToken(conversationId),
						pendingInputRequest: Prisma.DbNull,
					},
				});
				return;
			}

			const runId = runIdFromToken(channel.continuationToken);
			if (runId) await failRun(runId, "TURN_FAILED", reason);
		},

		async "session.completed"(_data, channel) {
			const conversationId = builderIdFromToken(channel.continuationToken);
			if (conversationId) {
				const { db } = await import("@crm/db");
				await db.agentConversation.updateMany({
					where: { id: conversationId, kind: "BUILDER" },
					data: { pendingInputRequest: Prisma.DbNull },
				});
				return;
			}

			const runId = runIdFromToken(channel.continuationToken);
			if (!runId) return;

			const { db } = await import("@crm/db");
			const run = await db.agentRun.findUnique({
				where: { id: runId },
				select: { status: true, summary: true, result: true },
			});
			if (run?.status !== "RUNNING") return;

			try {
				await finishRun(runId, {
					summary: run.summary ?? "The agent run completed.",
					result: recordOf(run.result),
				});
			} catch (error) {
				await failRun(
					runId,
					"NEVER_SETTLED",
					error instanceof Error ? error.message : String(error),
				).catch(() => {});
			}
		},

		async "turn.cancelled"(_data, channel) {
			const conversationId = builderIdFromToken(channel.continuationToken);
			if (conversationId) {
				const { db } = await import("@crm/db");
				await db.agentConversation.updateMany({
					where: { id: conversationId, kind: "BUILDER" },
					data: {
						continuationToken: builderToken(conversationId),
						pendingInputRequest: Prisma.DbNull,
					},
				});
				return;
			}

			const runId = runIdFromToken(channel.continuationToken);
			if (runId) {
				await cancelRun(
					runId,
					"CANCELLED",
					"The run was stopped before it finished.",
				);
			}
		},

		async "session.failed"(data, channel) {
			const conversationId = builderIdFromToken(channel.continuationToken);
			if (conversationId) {
				const { db } = await import("@crm/db");
				await db.agentConversation.updateMany({
					where: { id: conversationId, kind: "BUILDER" },
					data: {
						continuationToken: builderToken(conversationId),
						pendingInputRequest: Prisma.DbNull,
						lastAssistantAt: new Date(),
						lastMessageAt: new Date(),
					},
				});
				return;
			}

			const runId = runIdFromToken(channel.continuationToken);
			if (runId) await failRun(runId, data.code, data.message);
		},
	},

	async receive(input, { send }) {
		const builderSubmissionId =
			typeof input.target?.builderSubmissionId === "string"
				? input.target.builderSubmissionId
				: null;
		if (builderSubmissionId) {
			assertInternalDispatchAuth(input.auth);
			return dispatchBuilderSubmission(builderSubmissionId, send);
		}

		const runId =
			typeof input.target?.runId === "string" ? input.target.runId : null;
		if (runId) {
			assertInternalDispatchAuth(input.auth);
			return dispatchAgentRun(runId, send);
		}

		const taskId =
			typeof input.target?.taskId === "string" ? input.target.taskId : null;
		const taskAttempt =
			typeof input.target?.taskAttempt === "number" &&
			Number.isSafeInteger(input.target.taskAttempt) &&
			input.target.taskAttempt > 0
				? input.target.taskAttempt
				: null;

		return send(input.message, {
			auth: input.auth,
			continuationToken:
				taskId && taskAttempt
					? taskToken(taskId, taskAttempt)
					: `crm:adhoc:${crypto.randomUUID()}`,
		});
	},
});

function assertInternalDispatchAuth(value: unknown): void {
	const auth = recordOf(value);
	if (
		auth.authenticator !== "app" ||
		auth.principalType !== "runtime" ||
		auth.principalId !== "eve:app"
	) {
		throw new Error("Internal agent dispatch requires Eve app authentication.");
	}
}

function recordOf(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
