import { db, Prisma } from "@crm/db";
import { defineHook } from "eve/hooks";
import { z } from "zod";
import { isTransportOnlyEvent } from "../lib/event-persistence";
import { currentFocus } from "../lib/focus";
import { lockAgentRun } from "../lib/run-state";
import { attribute, purposeOf } from "../lib/session-purpose";

const finiteNumber = z.number().refine(Number.isFinite).nullable().catch(null);

const stepUsage = z
	.object({
		usage: z
			.object({
				inputTokens: finiteNumber,
				outputTokens: finiteNumber,
				costUsd: finiteNumber,
			})
			.catch({ inputTokens: null, outputTokens: null, costUsd: null }),
	})
	.catch({ usage: { inputTokens: null, outputTokens: null, costUsd: null } });

const completedMessage = z
	.object({ message: z.string().nullable().catch(null) })
	.catch({ message: null });

export default defineHook({
	events: {
		async "*"(event, ctx) {
			const id = event.meta?.id;

			if (!id || isTransportOnlyEvent(event.type)) return;

			try {
				const data = (
					"data" in event ? (event.data ?? {}) : {}
				) as Prisma.InputJsonObject;
				const emittedAt = event.meta?.at ? new Date(event.meta.at) : new Date();
				const purpose = purposeOf(ctx);
				const conversationId =
					purpose === "builder" ? attribute(ctx, "conversationId") : null;
				await db.$transaction(async (tx) => {
					await tx.agentEvent.createMany({
						data: [
							{
								id,
								sessionId: ctx.session.id,
								contactId: currentFocus().contactId,
								conversationId,
								type: event.type,
								data,
								emittedAt,
							},
						],
						skipDuplicates: true,
					});

					if (purpose === "builder") {
						await persistBuilderLifecycle(tx, event, ctx.session.id, ctx);
					}
					if (purpose === "team-agent") {
						await persistRunEvent(tx, id, event.type, data, emittedAt, ctx);
					}
				});
			} catch (error) {
				console.warn("[audit] could not record event", {
					type: event.type,
					reason: error instanceof Error ? error.message : String(error),
				});
			}
		},
	},
});

async function persistBuilderLifecycle(
	tx: Prisma.TransactionClient,
	event: { type: string },
	sessionId: string,
	ctx: Parameters<typeof purposeOf>[0],
) {
	const conversationId = attribute(ctx, "conversationId");
	if (!conversationId) return;

	if (event.type === "session.started" && isRootSession(ctx)) {
		await tx.agentConversation.updateMany({
			where: { id: conversationId, kind: "BUILDER" },
			data: { sessionId, continuationToken: null },
		});
	}

	if (event.type === "message.received") {
		const submissionId = attribute(ctx, "submissionId");
		if (submissionId) {
			await tx.agentConversationSubmission.updateMany({
				where: { id: submissionId, conversationId },
				data: { status: "ACCEPTED", acceptedAt: new Date() },
			});
			await tx.agentConversation.updateMany({
				where: { id: conversationId, kind: "BUILDER" },
				data: { pendingInputRequest: Prisma.DbNull },
			});
		}
	}
}

async function persistRunEvent(
	tx: Prisma.TransactionClient,
	eventId: string,
	type: string,
	data: Prisma.InputJsonObject,
	emittedAt: Date,
	ctx: Parameters<typeof purposeOf>[0] & { session: { id: string } },
) {
	const runId = attribute(ctx, "runId");
	if (!runId) return;

	const run = await lockAgentRun(tx, runId);
	if (
		run.status === "SUCCEEDED" ||
		run.status === "FAILED" ||
		run.status === "CANCELLED"
	) {
		return;
	}
	const existing = await tx.agentRunEvent.findUnique({
		where: { id: eventId },
		select: { id: true },
	});
	if (existing) return;

	const sequence = run.nextEventSequence + 1;
	const mayStart =
		type === "session.started" &&
		isRootSession(ctx) &&
		(run.status === "QUEUED" || run.status === "RUNNING");
	await tx.agentRun.update({
		where: { id: run.id },
		data: {
			nextEventSequence: sequence,
			sessionId: mayStart ? ctx.session.id : undefined,
			status: mayStart ? "RUNNING" : undefined,
			startedAt: mayStart ? (run.startedAt ?? new Date()) : undefined,
		},
	});

	await tx.agentRunEvent.create({
		data: {
			id: eventId,
			runId,
			sequence,
			type,
			data,
			emittedAt,
		},
	});

	if (type === "step.completed") {
		const { inputTokens, outputTokens, costUsd } = stepUsage.parse(data).usage;
		const current = await tx.agentRun.findUniqueOrThrow({
			where: { id: runId },
			select: { inputTokens: true, outputTokens: true, costUsd: true },
		});
		await tx.agentRun.update({
			where: { id: runId },
			data: {
				inputTokens:
					inputTokens === null
						? undefined
						: (current.inputTokens ?? 0) + inputTokens,
				outputTokens:
					outputTokens === null
						? undefined
						: (current.outputTokens ?? 0) + outputTokens,
				costUsd:
					costUsd === null ? undefined : Number(current.costUsd ?? 0) + costUsd,
			},
		});
	}

	if (type === "message.completed") {
		const { message } = completedMessage.parse(data);
		if (message?.trim()) {
			await tx.agentRun.updateMany({
				where: { id: runId, status: "RUNNING" },
				data: { summary: message.slice(0, 1000) },
			});
		}
	}
}

function isRootSession(ctx: Parameters<typeof purposeOf>[0]): boolean {
	return !("parent" in ctx.session) || !ctx.session.parent;
}
