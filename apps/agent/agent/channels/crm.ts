import { timingSafeEqual } from "node:crypto";
import { EnrichmentStatus } from "@crm/db";
import { defineChannel, POST } from "eve/channels";
import { verifyKey } from "../lib/context-dev";
import {
	builderIdFromToken,
	dispatchAgentRun,
	dispatchBuilderSubmission,
	drainAgentRuns,
	drainBuilder,
	failRun,
	runIdFromToken,
} from "../lib/custom-agent-dispatch";
import { brief, drainAll, taskAuth } from "../lib/dispatch";
import { settle } from "../lib/enrichment";
import { finishRun } from "../lib/run-runtime";
import { completeTask, taskSubject } from "../lib/tasks";

const TASK_MARKER = "task:";

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

export default defineChannel({
	routes: [
		POST("/internal/crm/dispatch", async (request, { send, waitUntil }) => {
			if (!authorised(request)) {
				return new Response("Unauthorized", { status: 401 });
			}

			waitUntil(
				drainAll((task) =>
					send(brief(task), {
						auth: taskAuth(task),
						continuationToken: taskToken(task.id),
					}),
				),
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
			const taskId = taskFromToken(channel.continuationToken);
			if (taskId) {
				const subject = await completeTask(taskId, "ran");
				if (subject) await settle(subject, EnrichmentStatus.COMPLETE);
				return;
			}

			const conversationId = builderIdFromToken(channel.continuationToken);
			if (!conversationId) return;

			await import("@crm/db").then(({ db }) =>
				db.agentConversation.updateMany({
					where: { id: conversationId, kind: "BUILDER" },
					data: { continuationToken: channel.continuationToken },
				}),
			);
		},

		async "turn.failed"(data, channel) {
			const taskId = taskFromToken(channel.continuationToken);
			const reason =
				typeof data === "object" && data && "message" in data
					? String((data as { message: unknown }).message)
					: "The agent turn failed.";

			if (taskId) {
				const subject = await taskSubject(taskId);
				if (subject) await settle(subject, EnrichmentStatus.FAILED, reason);
				return;
			}

			const runId = runIdFromToken(channel.continuationToken);
			if (runId) await failRun(runId, "TURN_FAILED", reason);
		},

		async "session.completed"(_data, channel) {
			const runId = runIdFromToken(channel.continuationToken);
			if (!runId) return;

			const { db } = await import("@crm/db");
			const run = await db.agentRun.findUnique({
				where: { id: runId },
				select: { status: true, summary: true, result: true },
			});
			if (run?.status === "RUNNING") {
				await finishRun(runId, {
					summary: run.summary ?? "The agent run completed.",
					result: recordOf(run.result),
				});
			}
		},

		async "session.failed"(data, channel) {
			const conversationId = builderIdFromToken(channel.continuationToken);
			if (conversationId) {
				const { db } = await import("@crm/db");
				await db.agentConversation.updateMany({
					where: { id: conversationId, kind: "BUILDER" },
					data: {
						continuationToken: channel.continuationToken,
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

		return send(input.message, {
			auth: input.auth,
			continuationToken: taskId
				? taskToken(taskId)
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
