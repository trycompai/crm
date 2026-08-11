import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import type { SendFn } from "eve/channels";
import audit from "../agent/hooks/audit";
import {
	builderToken,
	dispatchAgentRun,
	dispatchBuilderSubmission,
	failRun,
	pendingAgentRunIds,
	pendingBuilderSubmissionIds,
	queueDueAgentRuns,
	queueEventAgentRuns,
} from "../agent/lib/custom-agent-dispatch";
import {
	createRunActivity,
	finishRun,
	stageRunResult,
} from "../agent/lib/run-runtime";

const suffix = crypto.randomUUID();
const userId = `durable-runtime-user-${suffix}`;
const domain = `durable-${suffix}.example.test`;
let agentId = "";
let versionId = "";
let companyId = "";
let otherCompanyId = "";
let triggerId = "";
const builderConversationIds: string[] = [];

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "Durable Runtime Test",
			email: `${userId}@example.test`,
		},
	});
	const [company, otherCompany] = await Promise.all([
		db.company.create({
			data: { name: "Durable Runtime Company", domain },
			select: { id: true },
		}),
		db.company.create({
			data: { name: "Out of Scope Company", domain: `other-${domain}` },
			select: { id: true },
		}),
	]);
	companyId = company.id;
	otherCompanyId = otherCompany.id;

	const agent = await db.agentDefinition.create({
		data: {
			name: "Durable runtime",
			status: "LIVE",
			createdById: userId,
		},
		select: { id: true },
	});
	agentId = agent.id;
	const version = await db.agentVersion.create({
		data: {
			agentId,
			number: 1,
			status: "DEPLOYED",
			instructions: "Create one approved CRM activity.",
			manifest: {
				triggers: [
					{
						type: "SCHEDULE",
						name: "Every hour",
						summary: "Run every hour",
						config: {
							nextRunAt: new Date().toISOString(),
							intervalMinutes: 60,
						},
					},
				],
				dataScope: {
					mode: "SELECTED",
					summary: "Only the selected durable runtime company",
					resources: [
						{
							kind: "company",
							id: companyId,
							label: "Durable Runtime Company",
						},
					],
				},
				actions: [
					{
						type: "crm.activity.create",
						provider: "crm",
						summary: "Create a CRM note",
						activityTypes: ["NOTE"],
					},
					{
						type: "run.summary",
						provider: "crm",
						summary: "Summarize the run",
					},
				],
			},
			modelId: "test/model",
			sandboxPolicy: {},
			createdById: userId,
			approvedAt: new Date(),
			deployedAt: new Date(),
		},
		select: { id: true },
	});
	versionId = version.id;
	await db.agentDefinition.update({
		where: { id: agentId },
		data: { currentVersionId: versionId },
	});
	const trigger = await db.agentTrigger.create({
		data: {
			agentId,
			versionId,
			type: "SCHEDULE",
			name: "Every hour",
			config: { intervalMinutes: 60 },
			createdById: userId,
			enabled: true,
			nextRunAt: new Date(Date.now() - 60_000),
		},
		select: { id: true },
	});
	triggerId = trigger.id;
});

afterEach(async () => {
	if (!agentId) return;
	await db.agentRun.updateMany({
		where: {
			agentId,
			status: { in: ["QUEUED", "RUNNING", "WAITING_FOR_APPROVAL"] },
		},
		data: {
			status: "CANCELLED",
			errorCode: "TEST_CLEANUP",
			errorMessage: "Settled between tests.",
			finishedAt: new Date(),
		},
	});
});

afterAll(async () => {
	if (builderConversationIds.length > 0) {
		await db.agentConversation.deleteMany({
			where: { id: { in: builderConversationIds } },
		});
	}
	if (agentId) {
		await db.agentEvent.deleteMany({
			where: { sessionId: { startsWith: `durable-session-${suffix}` } },
		});
		await db.agentRunEvent.deleteMany({ where: { run: { agentId } } });
		await db.agentAction.deleteMany({ where: { agentId } });
		await db.activity.deleteMany({
			where: { meta: { path: ["agentId"], equals: agentId } },
		});
		await db.agentAuditEvent.deleteMany({ where: { agentId } });
		await db.agentRun.deleteMany({ where: { agentId } });
		await db.agentTrigger.deleteMany({ where: { agentId } });
		await db.agentDefinition.updateMany({
			where: { id: agentId },
			data: { currentVersionId: null },
		});
		await db.agentVersion.deleteMany({ where: { agentId } });
		await db.agentDefinition.deleteMany({ where: { id: agentId } });
	}
	await db.company.deleteMany({
		where: { id: { in: [companyId, otherCompanyId] } },
	});
	await db.user.deleteMany({ where: { id: userId } });
});

async function createRun(
	status: "QUEUED" | "RUNNING" = "RUNNING",
	startedAt: Date | null = new Date(),
	sessionId: string | null = null,
	triggerType: "MANUAL" | "EVENT" = "MANUAL",
) {
	return db.agentRun.create({
		data: {
			agentId,
			versionId,
			triggerType,
			status,
			startedAt,
			sessionId,
			idempotencyKey: `durable-run-${crypto.randomUUID()}`,
			correlationId: crypto.randomUUID(),
			events: { create: { sequence: 0, type: "run.queued", data: {} } },
		},
		select: { id: true },
	});
}

async function satisfyRequiredActivity(runId: string, callId: string) {
	return createRunActivity(runId, callId, {
		type: "NOTE",
		targetKind: "company",
		targetId: companyId,
		subject: "Runtime test",
		body: "Completed the required action.",
	});
}

describe("durable custom-agent runtime", () => {
	it("queues one run per matching event trigger and event occurrence", async () => {
		const trigger = await db.agentTrigger.create({
			data: {
				agentId,
				versionId,
				type: "EVENT",
				name: "When a deal closes",
				config: { event: "deal.closed" },
				createdById: userId,
				enabled: true,
			},
			select: { id: true },
		});
		const occurredAt = new Date().toISOString();
		const task = {
			id: `event-task-${suffix}`,
			contactId: null,
			companyId: null,
			dealId: `event-deal-${suffix}`,
			payload: {
				type: "deal.closed",
				record: { kind: "deal", id: `event-deal-${suffix}` },
				occurredAt,
				data: { from: "NEGOTIATION", to: "CLOSED_WON" },
			},
		};

		await Promise.all([
			queueEventAgentRuns(task),
			queueEventAgentRuns(task),
			queueEventAgentRuns(task),
		]);

		const runs = await db.agentRun.findMany({
			where: { triggerId: trigger.id },
			select: { triggerType: true, status: true, input: true },
		});
		expect(runs).toEqual([
			{
				triggerType: "EVENT",
				status: "QUEUED",
				input: {
					event: {
						type: "deal.closed",
						occurredAt,
						data: { from: "NEGOTIATION", to: "CLOSED_WON" },
					},
					record: { kind: "deal", id: `event-deal-${suffix}` },
				},
			},
		]);
	});

	it("advances a due trigger only when its run is committed", async () => {
		const now = new Date();
		const results = await Promise.all(
			Array.from({ length: 4 }, () => queueDueAgentRuns(now)),
		);

		expect(results.reduce((total, count) => total + count, 0)).toBe(1);
		const [trigger, scheduledRuns] = await Promise.all([
			db.agentTrigger.findUniqueOrThrow({ where: { id: triggerId } }),
			db.agentRun.findMany({
				where: { triggerId },
				select: { id: true, status: true, input: true },
			}),
		]);
		expect(trigger.lastRunAt).not.toBeNull();
		expect(trigger.nextRunAt?.getTime()).toBeGreaterThan(now.getTime());
		expect(scheduledRuns).toHaveLength(1);
		expect(scheduledRuns[0]?.status).toBe("QUEUED");
	});

	it("recovers only sessionless runs with an expired delivery lease", async () => {
		const stale = new Date(Date.now() - 10 * 60_000);
		const [recoverable, active] = await Promise.all([
			createRun("RUNNING", stale),
			createRun("RUNNING", stale, `durable-session-${suffix}-already-started`),
		]);

		const pending = await pendingAgentRunIds();
		const [recovered, untouched] = await Promise.all([
			db.agentRun.findUniqueOrThrow({ where: { id: recoverable.id } }),
			db.agentRun.findUniqueOrThrow({ where: { id: active.id } }),
		]);
		expect(pending).not.toContain(recoverable.id);
		expect(recovered).toMatchObject({ status: "QUEUED", startedAt: null });
		expect(
			await db.agentRunEvent.count({
				where: { runId: recoverable.id, type: "run.delivery_recovered" },
			}),
		).toBe(1);
		expect(untouched.status).toBe("RUNNING");
	});

	it("claims one live run delivery and persists its Eve session", async () => {
		const run = await createRun("QUEUED", null);
		let deliveries = 0;
		const sessionId = `durable-session-${suffix}-agent-dispatch`;
		const send = (async () => {
			deliveries += 1;
			return { id: sessionId };
		}) as unknown as SendFn;

		const attempts = await Promise.allSettled([
			dispatchAgentRun(run.id, send),
			dispatchAgentRun(run.id, send),
		]);
		const persisted = await db.agentRun.findUniqueOrThrow({
			where: { id: run.id },
		});
		expect(
			attempts.filter((attempt) => attempt.status === "fulfilled"),
		).toHaveLength(1);
		expect(deliveries).toBe(1);
		expect(persisted).toMatchObject({
			status: "RUNNING",
			sessionId,
			modelId: "test/model",
		});
	});

	it("runs only one turn per agent while leaving later work queued", async () => {
		const [first, second] = await Promise.all([
			createRun("QUEUED", null),
			createRun("QUEUED", null),
		]);
		const deliveries: string[] = [];
		const send = (async (message: string) => {
			deliveries.push(message);
			return { id: `durable-session-${suffix}-serialized` };
		}) as unknown as SendFn;

		const results = await Promise.allSettled([
			dispatchAgentRun(first.id, send),
			dispatchAgentRun(second.id, send),
		]);

		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			results.filter((result) => result.status === "rejected"),
		).toHaveLength(1);
		expect(deliveries).toHaveLength(1);
		expect(
			(
				await db.agentRun.findMany({
					where: { id: { in: [first.id, second.id] } },
					select: { status: true },
				})
			)
				.map((run) => run.status)
				.sort(),
		).toEqual(["QUEUED", "RUNNING"]);
	});

	it("restores a builder continuation when a delivery lease expires", async () => {
		const conversation = await db.agentConversation.create({
			data: {
				kind: "BUILDER",
				userId,
				sessionId: `durable-session-${suffix}-builder`,
				continuationToken: null,
				submissions: {
					create: {
						submittedById: userId,
						clientRequestId: crypto.randomUUID(),
						message: { text: "Continue building" },
						status: "SENDING",
						attemptCount: 1,
						sentAt: new Date(Date.now() - 10 * 60_000),
					},
				},
			},
			select: { id: true, submissions: { select: { id: true } } },
		});
		builderConversationIds.push(conversation.id);

		await pendingBuilderSubmissionIds();
		const [submission, restored] = await Promise.all([
			db.agentConversationSubmission.findUniqueOrThrow({
				where: { id: conversation.submissions[0]?.id },
			}),
			db.agentConversation.findUniqueOrThrow({
				where: { id: conversation.id },
			}),
		]);
		expect(submission.status).toBe("PENDING");
		expect(restored.continuationToken).toBe(builderToken(conversation.id));
	});

	it("keeps concurrent builder dispatches in conversation order", async () => {
		const conversation = await db.agentConversation.create({
			data: { kind: "BUILDER", userId },
			select: { id: true },
		});
		builderConversationIds.push(conversation.id);
		const firstCreatedAt = new Date();
		const [first, second] = await Promise.all([
			db.agentConversationSubmission.create({
				data: {
					conversationId: conversation.id,
					submittedById: userId,
					clientRequestId: crypto.randomUUID(),
					message: { text: "First" },
					createdAt: firstCreatedAt,
				},
				select: { id: true },
			}),
			db.agentConversationSubmission.create({
				data: {
					conversationId: conversation.id,
					submittedById: userId,
					clientRequestId: crypto.randomUUID(),
					message: { text: "Second" },
					createdAt: new Date(firstCreatedAt.getTime() + 1),
				},
				select: { id: true },
			}),
		]);
		const started = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		let deliveries = 0;
		const send = (async () => {
			deliveries += 1;
			started.resolve();
			await release.promise;
			return { id: `durable-session-${suffix}-builder-dispatch` };
		}) as unknown as SendFn;

		const firstDispatch = dispatchBuilderSubmission(first.id, send);
		await started.promise;
		let secondError: Error | null = null;
		try {
			await dispatchBuilderSubmission(second.id, send);
		} catch (error) {
			secondError = error as Error;
		}
		release.resolve();
		await firstDispatch;

		const submissions = await db.agentConversationSubmission.findMany({
			where: { id: { in: [first.id, second.id] } },
			orderBy: [{ createdAt: "asc" }, { id: "asc" }],
			select: { id: true, status: true },
		});
		expect(deliveries).toBe(1);
		expect(secondError?.message).toContain(
			"already claimed or is out of order",
		);
		expect(submissions).toEqual([
			{ id: first.id, status: "ACCEPTED" },
			{ id: second.id, status: "PENDING" },
		]);
	});

	it("loads persisted attachment bytes into the Eve builder turn", async () => {
		const content = Buffer.from("durable attachment");
		const conversation = await db.agentConversation.create({
			data: {
				kind: "BUILDER",
				userId,
				submissions: {
					create: {
						submittedById: userId,
						clientRequestId: crypto.randomUUID(),
						message: {
							text: "Read the attachment",
							resources: [],
							attachments: [
								{
									name: "brief.txt",
									type: "text/plain",
									size: content.byteLength,
								},
							],
						},
						attachments: {
							create: {
								position: 0,
								name: "brief.txt",
								mediaType: "text/plain",
								size: content.byteLength,
								content,
							},
						},
					},
				},
			},
			select: { id: true, submissions: { select: { id: true } } },
		});
		builderConversationIds.push(conversation.id);
		let delivered: unknown;
		const send = (async (input: unknown) => {
			delivered = input;
			return { id: `durable-session-${suffix}-attachment` };
		}) as unknown as SendFn;

		await dispatchBuilderSubmission(
			conversation.submissions[0]?.id ?? "",
			send,
		);
		const parts = Array.isArray(delivered) ? delivered : [];
		expect(parts).toHaveLength(2);
		expect(parts[1]).toMatchObject({
			type: "file",
			mediaType: "text/plain",
			filename: "brief.txt",
		});
		expect(Buffer.from(recordOf(parts[1]).data as Uint8Array)).toEqual(content);
	});

	it("ingests a replayed Eve event and its usage exactly once", async () => {
		const run = await createRun();
		const eventId = `evt_${suffix}_usage`;
		type AuditHandler = (
			event: {
				type: string;
				data: object;
				meta: { id: string; at: string };
			},
			ctx: {
				session: {
					id: string;
					auth: {
						current: { attributes: Record<string, unknown> };
						initiator: null;
					};
				};
			},
		) => Promise<void>;
		const handler = audit.events["*"] as unknown as AuditHandler;
		const event = {
			type: "step.completed",
			data: { usage: { inputTokens: 5, outputTokens: 3, costUsd: 0.01 } },
			meta: { id: eventId, at: new Date().toISOString() },
		};
		const context = {
			session: {
				id: `durable-session-${suffix}-usage`,
				auth: {
					current: {
						attributes: { purpose: "team-agent", runId: run.id },
					},
					initiator: null,
				},
			},
		};

		await handler(event, context);
		await handler(event, context);

		const persisted = await db.agentRun.findUniqueOrThrow({
			where: { id: run.id },
		});
		expect(persisted).toMatchObject({
			inputTokens: 5,
			outputTokens: 3,
			nextEventSequence: 1,
		});
		expect(Number(persisted.costUsd)).toBe(0.01);
		expect(await db.agentRunEvent.count({ where: { id: eventId } })).toBe(1);
		expect(await db.agentEvent.count({ where: { id: eventId } })).toBe(1);
	});

	it("keeps a nested subagent session from replacing the root run session", async () => {
		const rootSessionId = `durable-session-${suffix}-root`;
		const run = await createRun("RUNNING", new Date(), rootSessionId);
		type AuditHandler = (
			event: {
				type: string;
				data: object;
				meta: { id: string; at: string };
			},
			ctx: {
				session: {
					id: string;
					parent?: unknown;
					auth: {
						current: { attributes: Record<string, unknown> };
						initiator: null;
					};
				};
			},
		) => Promise<void>;
		const handler = audit.events["*"] as unknown as AuditHandler;

		await handler(
			{
				type: "session.started",
				data: {},
				meta: {
					id: `evt_${suffix}_nested_started`,
					at: new Date().toISOString(),
				},
			},
			{
				session: {
					id: `durable-session-${suffix}-nested`,
					parent: { id: rootSessionId },
					auth: {
						current: {
							attributes: { purpose: "team-agent", runId: run.id },
						},
						initiator: null,
					},
				},
			},
		);

		expect(
			await db.agentRun.findUniqueOrThrow({ where: { id: run.id } }),
		).toMatchObject({ sessionId: rootSessionId });
	});

	it("lets the first terminal state win without duplicate terminal logs", async () => {
		const [completed, failed] = await Promise.all([createRun(), createRun()]);
		await satisfyRequiredActivity(completed.id, "terminal-success");
		await finishRun(completed.id, { summary: "Completed safely" });
		await failRun(completed.id, "LATE_FAILURE", "This arrived late");
		await failRun(failed.id, "FIRST_FAILURE", "Failed safely");
		let lateCompletionError: Error | null = null;
		try {
			await finishRun(failed.id, {
				summary: "This must not overwrite failure",
			});
		} catch (error) {
			lateCompletionError = error as Error;
		}
		await failRun(failed.id, "SECOND_FAILURE", "This arrived late");

		const [completedRow, failedRow] = await Promise.all([
			db.agentRun.findUniqueOrThrow({ where: { id: completed.id } }),
			db.agentRun.findUniqueOrThrow({ where: { id: failed.id } }),
		]);
		expect(completedRow).toMatchObject({
			status: "SUCCEEDED",
			summary: "Completed safely",
		});
		expect(failedRow).toMatchObject({
			status: "FAILED",
			errorCode: "FIRST_FAILURE",
			errorMessage: "Failed safely",
		});
		expect(lateCompletionError?.message).toContain("already ended with FAILED");
		expect(
			await db.agentRunEvent.count({
				where: {
					runId: { in: [completed.id, failed.id] },
					type: { in: ["run.completed", "run.failed"] },
				},
			}),
		).toBe(2);
	});

	it("stages tool output before the session owns terminal completion", async () => {
		const run = await createRun();
		await stageRunResult(run.id, {
			summary: "Staged safely",
			result: { noted: 2 },
		});
		const staged = await db.agentRun.findUniqueOrThrow({
			where: { id: run.id },
		});
		expect(staged).toMatchObject({
			status: "RUNNING",
			summary: "Staged safely",
			result: { noted: 2 },
		});
		expect(
			await db.agentRunEvent.count({
				where: { runId: run.id, type: "run.completed" },
			}),
		).toBe(0);

		await satisfyRequiredActivity(run.id, "staged-success");
		await finishRun(run.id, {
			summary: staged.summary ?? "Staged safely",
			result: staged.result as Record<string, unknown>,
		});
		expect(
			await db.agentRun.findUniqueOrThrow({ where: { id: run.id } }),
		).toMatchObject({ status: "SUCCEEDED", summary: "Staged safely" });
	});

	it("fails a run that never performs its declared external action", async () => {
		const run = await createRun();
		const finished = await finishRun(run.id, {
			summary: "Claimed completion without acting",
		});

		expect(finished).toEqual({ id: run.id, status: "FAILED" });
		expect(
			await db.agentRun.findUniqueOrThrow({ where: { id: run.id } }),
		).toMatchObject({
			status: "FAILED",
			errorCode: "ACTION_NOT_PERFORMED",
		});
		expect(
			await db.agentAction.findUniqueOrThrow({
				where: {
					idempotencyKey: `run:${run.id}:required:crm.activity.create`,
				},
			}),
		).toMatchObject({
			status: "FAILED",
			errorCode: "ACTION_NOT_PERFORMED",
		});
	});

	it("refuses a self-reported no-action ending on a manual run", async () => {
		const run = await createRun();
		let stageError: Error | null = null;
		try {
			await stageRunResult(run.id, {
				summary: "Nothing to do",
				noActionNeeded: { reason: "The condition was not met." },
			});
		} catch (error) {
			stageError = error as Error;
		}
		expect(stageError?.message).toContain(
			"manual run cannot end with no action needed",
		);

		const finished = await finishRun(run.id, {
			summary: "Nothing to do",
			result: { noActionNeeded: "The condition was not met." },
		});
		expect(finished).toEqual({ id: run.id, status: "FAILED" });
		expect(
			await db.agentRun.findUniqueOrThrow({ where: { id: run.id } }),
		).toMatchObject({ status: "FAILED", errorCode: "ACTION_NOT_PERFORMED" });
		expect(
			await db.agentRunEvent.count({
				where: { runId: run.id, type: "run.completed" },
			}),
		).toBe(0);
	});

	it("accepts a no-action ending on an event run whose condition was not met", async () => {
		const run = await createRun("RUNNING", new Date(), null, "EVENT");
		await stageRunResult(run.id, {
			summary: "The deal was already closed",
			noActionNeeded: { reason: "The condition was not met." },
		});
		const staged = await db.agentRun.findUniqueOrThrow({
			where: { id: run.id },
		});
		expect(staged.result).toMatchObject({
			noActionNeeded: "The condition was not met.",
		});

		const finished = await finishRun(run.id, {
			summary: staged.summary ?? "The deal was already closed",
			result: staged.result as Record<string, unknown>,
		});
		expect(finished).toEqual({ id: run.id, status: "SUCCEEDED" });
		expect(await db.agentAction.count({ where: { runId: run.id } })).toBe(0);
	});

	it("claims an approved CRM action once and rejects scope before target access", async () => {
		const run = await createRun();
		const input = {
			type: "NOTE" as const,
			targetKind: "company" as const,
			targetId: companyId,
			subject: "Durable note",
			body: "Created exactly once.",
		};
		const attempts = await Promise.allSettled(
			Array.from({ length: 4 }, () =>
				createRunActivity(run.id, "shared-call", input),
			),
		);
		expect(
			attempts.filter((attempt) => attempt.status === "fulfilled").length,
		).toBeGreaterThanOrEqual(1);
		const replay = await createRunActivity(run.id, "shared-call", input);
		expect(replay.replayed).toBe(true);
		let reusedCallError: Error | null = null;
		try {
			await createRunActivity(run.id, "shared-call", {
				...input,
				body: "Different input must not replay the earlier action.",
			});
		} catch (error) {
			reusedCallError = error as Error;
		}
		expect(reusedCallError?.message).toContain("already used for other input");
		expect(
			await db.agentAction.count({
				where: { runId: run.id, idempotencyKey: `${run.id}:shared-call` },
			}),
		).toBe(1);
		expect(
			await db.activity.count({
				where: { meta: { path: ["runId"], equals: run.id } },
			}),
		).toBe(1);

		let scopeError: Error | null = null;
		try {
			await createRunActivity(run.id, "out-of-scope", {
				...input,
				targetId: otherCompanyId,
			});
		} catch (error) {
			scopeError = error as Error;
		}
		expect(scopeError?.message).toContain("outside this agent version");
		expect(
			await db.agentAction.count({
				where: { idempotencyKey: `${run.id}:out-of-scope` },
			}),
		).toBe(0);

		let activityTypeError: Error | null = null;
		try {
			await createRunActivity(run.id, "unapproved-task", {
				...input,
				type: "TASK",
				subject: "This type was not approved",
			});
		} catch (error) {
			activityTypeError = error as Error;
		}
		expect(activityTypeError?.message).toContain(
			"does not allow CRM task activities",
		);
		expect(
			await db.agentAction.count({
				where: { idempotencyKey: `${run.id}:unapproved-task` },
			}),
		).toBe(0);
	});
});

function recordOf(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
