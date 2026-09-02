import { timingSafeEqual } from "node:crypto";
import { EnrichmentStatus, Prisma } from "@crm/db";
import { MAX_ATTEMPTS } from "@crm/db/agent-tasks";
import { schemas } from "@crm/validation";
import { eveTurnFailure } from "@crm/validation/eve-stream";
import { defineChannel, GET, POST } from "eve/channels";
import { z } from "zod";
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
import { finishRun, runResultOf } from "../lib/run-runtime";
import { attribute } from "../lib/session-purpose";
import {
	dispatchSlackEvent,
	drainSlackEvents,
	SlackEventNotResumed,
} from "../lib/slack-events";
import { createSlackChannel } from "../lib/slack-membership";
import { reconcileStaleTasks } from "../lib/stale-tasks";
import { completeTask, taskSubject } from "../lib/tasks";

const TASK_MARKER = "task:";
const STALE_QUEUE_MS = DISPATCH.sweep.staleQueueMs;

type InternalDispatchPrincipal = {
	readonly authenticator: string;
	readonly principalId: string;
	readonly principalType: string;
} | null;

const identifier = z.string().trim().min(1).nullable().catch(null);

const cancelRunRequest = z.object({ runId: identifier }).catch({ runId: null });

const verifyKeyRequest = z
	.object({ apiKey: identifier })
	.catch({ apiKey: null });

const receiveTarget = z
	.object({
		builderSubmissionId: z.string().nullable().catch(null),
		runId: z.string().nullable().catch(null),
		slackEventId: z.string().nullable().catch(null),
		taskId: z.string().nullable().catch(null),
	})
	.catch({
		builderSubmissionId: null,
		runId: null,
		slackEventId: null,
		taskId: null,
	});

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

export function taskToken(taskId: string): string {
	return `${TASK_MARKER}${taskId}`;
}

export function taskFromToken(token: string | undefined): string | null {
	if (!token) return null;

	const marker = token.lastIndexOf(TASK_MARKER);
	if (marker === -1) return null;

	const id = token.slice(marker + TASK_MARKER.length);
	return id.length > 0 ? id : null;
}

export async function closeTask(
	token: string | undefined,
	outcome: string,
	status: EnrichmentStatus = EnrichmentStatus.COMPLETE,
): Promise<boolean> {
	const taskId = taskFromToken(token);
	if (!taskId) return false;

	const subject =
		(await completeTask(taskId, outcome)) ?? (await taskSubject(taskId));
	if (subject) await settle(subject, status);

	return true;
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
					await reconcileStaleTasks();
					await drainAll((task) =>
						send(brief(task), {
							auth: taskAuth(task),
							continuationToken: taskToken(task.id),
						}),
					);
					await drainAgentRuns(send);
					await drainSlackEvents(send);
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

			const { runId } = cancelRunRequest.parse(
				await request.json().catch(() => null),
			);
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

			const { apiKey } = verifyKeyRequest.parse(
				await request.json().catch(() => null),
			);

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
			if (await closeTask(channel.continuationToken, "ran")) return;

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
			const taskId = taskFromToken(channel.continuationToken);
			const reason =
				eveTurnFailure.parse(data).message ?? "The agent turn failed.";

			if (taskId) {
				const subject = await taskSubject(taskId);
				if (subject) await settle(subject, EnrichmentStatus.FAILED, reason);
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
			if (await closeTask(channel.continuationToken, "ran")) return;

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
					result: runResultOf(run.result),
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
			if (
				await closeTask(
					channel.continuationToken,
					"stopped",
					EnrichmentStatus.SKIPPED,
				)
			) {
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
		const target = receiveTarget.parse(input.target);
		if (target.builderSubmissionId) {
			assertInternalDispatchAuth(input.auth);
			return dispatchBuilderSubmission(target.builderSubmissionId, send);
		}

		if (target.runId) {
			assertInternalDispatchAuth(input.auth);
			return dispatchAgentRun(target.runId, send);
		}

		if (target.slackEventId) {
			assertInternalDispatchAuth(input.auth);
			const outcome = await dispatchSlackEvent(target.slackEventId, send);
			if (!outcome?.session) {
				throw new SlackEventNotResumed(
					outcome?.outcome ?? "Another drain already took this Slack event.",
				);
			}
			return outcome.session;
		}

		return send(input.message, {
			auth: input.auth,
			continuationToken: target.taskId
				? taskToken(target.taskId)
				: `crm:adhoc:${crypto.randomUUID()}`,
		});
	},
});

function assertInternalDispatchAuth(auth: InternalDispatchPrincipal): void {
	if (
		auth?.authenticator !== "app" ||
		auth.principalType !== "runtime" ||
		auth.principalId !== "eve:app"
	) {
		throw new Error("Internal agent dispatch requires Eve app authentication.");
	}
}
