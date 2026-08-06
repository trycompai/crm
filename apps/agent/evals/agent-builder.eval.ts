import { db } from "@crm/db";
import { defineEval } from "eve/evals";
import { equals, satisfies } from "eve/evals/expect";

export default defineEval({
	description:
		"Turn a short outcome request into a safe, review-only team agent through the durable CRM channel.",
	tags: ["builder", "integration"],
	timeoutMs: 180_000,
	async test(t) {
		const secret = process.env.AGENT_BRIDGE_SECRET?.trim();
		if (
			!process.env.DATABASE_URL ||
			!secret ||
			(!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN)
		) {
			t.skip(
				"Requires DATABASE_URL, AGENT_BRIDGE_SECRET, and an AI Gateway credential.",
			);
			return;
		}

		const suffix = crypto.randomUUID();
		const userId = `builder-eval-user-${suffix}`;
		let conversationId: string | null = null;
		let sessionId: string | null = null;

		try {
			await db.user.create({
				data: {
					id: userId,
					name: "Agent Builder Eval",
					email: `${userId}@example.test`,
				},
			});
			const conversation = await db.agentConversation.create({
				data: {
					kind: "BUILDER",
					userId,
					submissions: {
						create: {
							submittedById: userId,
							clientRequestId: crypto.randomUUID(),
							commandType: "CREATE_AGENT",
							message: {
								text: "Build me an agent that gives me a snapshot of our CRM accounts.",
								resources: [],
							},
						},
					},
				},
				select: { id: true },
			});
			conversationId = conversation.id;

			const response = await t.target.fetch("/internal/crm/builder-dispatch", {
				method: "POST",
				headers: { authorization: `Bearer ${secret}` },
			});
			await t.require(response.status, equals(202));

			sessionId = await waitForBuilderSession(conversation.id, t.signal);
			await t.require(
				sessionId,
				satisfies(
					(value) => typeof value === "string",
					"builder session started",
				),
			);
			const session = await t.target.attachSession(sessionId as string);
			session.succeeded();
			session.calledSubagent("agent_builder", { count: 1 });
			session.notCalledTool("record_fact");
			session.notCalledTool("record_job_change");

			const saved = await db.agentConversation.findUniqueOrThrow({
				where: { id: conversation.id },
				select: {
					agent: {
						select: {
							status: true,
							versions: {
								orderBy: { number: "desc" },
								take: 1,
								select: { status: true, manifest: true },
							},
						},
					},
					builderArtifacts: {
						where: { status: "READY" },
						select: { path: true },
					},
				},
			});
			t.check(saved.agent?.status, equals("DRAFT"));
			t.check(saved.agent?.versions[0]?.status, equals("READY"));
			t.check(saved.builderArtifacts.length, equals(3));
			t.check(
				saved.agent?.versions[0]?.manifest,
				satisfies((value) => {
					const manifest = recordOf(value);
					const scope = recordOf(manifest.dataScope);
					const actions = Array.isArray(manifest.actions)
						? manifest.actions.map(recordOf)
						: [];
					return (
						scope.mode === "WORKSPACE" &&
						actions.length === 1 &&
						actions[0]?.type === "run.summary"
					);
				}, "saved manifest is workspace-scoped and side-effect-free"),
			);
		} finally {
			await cleanupBuilderEval(userId, conversationId, sessionId);
		}
	},
});

async function waitForBuilderSession(
	conversationId: string,
	signal: AbortSignal,
): Promise<string | null> {
	for (let attempt = 0; attempt < 600; attempt += 1) {
		if (signal.aborted) return null;
		const conversation = await db.agentConversation.findUnique({
			where: { id: conversationId },
			select: { sessionId: true },
		});
		if (conversation?.sessionId) return conversation.sessionId;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	return null;
}

async function cleanupBuilderEval(
	userId: string,
	conversationId: string | null,
	sessionId: string | null,
) {
	const agents = await db.agentDefinition.findMany({
		where: { createdById: userId },
		select: { id: true },
	});
	const agentIds = agents.map((agent) => agent.id);
	if (sessionId) await db.agentEvent.deleteMany({ where: { sessionId } });
	if (conversationId) {
		await db.agentBuilderArtifact.deleteMany({ where: { conversationId } });
	}
	if (agentIds.length > 0) {
		await db.agentBuilderArtifact.deleteMany({
			where: { version: { agentId: { in: agentIds } } },
		});
		await db.agentAuditEvent.deleteMany({
			where: { agentId: { in: agentIds } },
		});
		await db.agentTrigger.deleteMany({ where: { agentId: { in: agentIds } } });
		await db.agentDefinition.updateMany({
			where: { id: { in: agentIds } },
			data: { currentVersionId: null },
		});
		await db.agentVersion.deleteMany({ where: { agentId: { in: agentIds } } });
		await db.agentDefinition.deleteMany({ where: { id: { in: agentIds } } });
	}
	if (conversationId) {
		await db.agentConversation.deleteMany({ where: { id: conversationId } });
	}
	await db.user.deleteMany({ where: { id: userId } });
}

function recordOf(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
