import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { persistBuilderInputRequest } from "../agent/lib/builder-input";
import {
	saveBuilderDraft,
	writeBuilderArtifact,
} from "../agent/lib/builder-runtime";
import { setBuilderConversationTitle } from "../agent/lib/conversation-title";
import { builderToken } from "../agent/lib/custom-agent-dispatch";

const suffix = crypto.randomUUID();
const userId = `builder-runtime-user-${suffix}`;
let conversationId = "";
let agentId = "";
const conversationIds: string[] = [];

beforeAll(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "Builder Runtime Test",
			email: `${userId}@example.test`,
		},
	});
	const conversation = await db.agentConversation.create({
		data: {
			kind: "BUILDER",
			userId,
			sessionId: `builder-question-session-${suffix}`,
		},
		select: { id: true },
	});
	conversationId = conversation.id;
	conversationIds.push(conversation.id);
});

afterAll(async () => {
	const agentIds = (
		await db.agentDefinition.findMany({
			where: { createdById: userId },
			select: { id: true },
		})
	).map((agent) => agent.id);
	if (agentIds.length > 0) {
		await db.agentBuilderArtifact.deleteMany({
			where: {
				OR: [
					{ conversationId: { in: conversationIds } },
					{ version: { agentId: { in: agentIds } } },
				],
			},
		});
		await db.agentAuditEvent.deleteMany({
			where: { agentId: { in: agentIds } },
		});
		await db.agentTrigger.deleteMany({
			where: { agentId: { in: agentIds } },
		});
		await db.agentDefinition.updateMany({
			where: { id: { in: agentIds } },
			data: { currentVersionId: null },
		});
		await db.agentVersion.deleteMany({
			where: { agentId: { in: agentIds } },
		});
		await db.agentDefinition.deleteMany({
			where: { id: { in: agentIds } },
		});
	}
	await db.agentConversation.deleteMany({
		where: { id: { in: conversationIds } },
	});
	await db.user.deleteMany({ where: { id: userId } });
});

describe("builder persistence", () => {
	it("persists a proxied child question on its builder conversation", async () => {
		const request = {
			kind: "question",
			requestId: "question-from-child",
			prompt: "Which channel should receive this?",
			action: {
				kind: "tool-call",
				callId: "call-from-child",
				toolName: "ask_question",
				input: { prompt: "Which channel should receive this?" },
			},
			display: "select",
			options: [{ id: "C123", label: "#sales" }],
		};
		const event = {
			requests: [request],
			sequence: 1,
			stepIndex: 2,
			turnId: "child-turn",
		};

		expect(
			await persistBuilderInputRequest(event, undefined, conversationId),
		).toBe(true);
		expect(
			await db.agentConversation.findUnique({
				where: { id: conversationId },
				select: { continuationToken: true, pendingInputRequest: true },
			}),
		).toEqual({
			continuationToken: builderToken(conversationId),
			pendingInputRequest: request,
		});
		expect(
			await db.agentEvent.findUnique({
				where: {
					id: `builder-input:${conversationId}:${request.requestId}`,
				},
				select: { conversationId: true, type: true, data: true },
			}),
		).toEqual({
			conversationId,
			type: "input.requested",
			data: event,
		});

		const newer = {
			...event,
			sequence: 4,
			requests: [
				{
					...request,
					requestId: "newer-question-from-child",
					prompt: "Which deal stage should this watch?",
				},
			],
		};
		expect(
			await persistBuilderInputRequest(newer, undefined, conversationId),
		).toBe(true);

		expect(
			await persistBuilderInputRequest(event, undefined, conversationId),
		).toBe(false);
		expect(
			await persistBuilderInputRequest(
				{
					...event,
					sequence: 2,
					requests: [{ ...request, requestId: "stale-question-from-child" }],
				},
				undefined,
				conversationId,
			),
		).toBe(false);

		expect(
			await db.agentConversation.findUnique({
				where: { id: conversationId },
				select: { pendingInputRequest: true },
			}),
		).toEqual({ pendingInputRequest: newer.requests[0] });
		expect(
			await db.agentEvent.count({
				where: {
					id: `builder-input:${conversationId}:stale-question-from-child`,
				},
			}),
		).toBe(0);
	});

	it("persists a session-limit prompt, so a builder that runs out of budget asks instead of stopping", async () => {
		const conversation = await db.agentConversation.create({
			data: {
				kind: "BUILDER",
				userId,
				sessionId: `builder-session-limit-${suffix}`,
			},
			select: { id: true },
		});
		conversationIds.push(conversation.id);

		const request = {
			kind: "session-limit",
			requestId: "child-session:limit:output:10238",
			prompt: "This session has hit the output-token limit (10K) per session.",
			action: {
				kind: "tool-call",
				callId: "child-session:limit:output:10238",
				toolName: "session_limit_continuation",
				input: { kind: "output", limit: 10000, usedTokens: 10238 },
			},
			display: "confirmation",
			allowFreeform: false,
			options: [
				{ id: "continue", label: "Approve", style: "primary" },
				{ id: "stop", label: "Stop", style: "danger" },
			],
		};

		expect(
			await persistBuilderInputRequest(
				{ requests: [request], sequence: 0, stepIndex: 3, turnId: "turn_0" },
				undefined,
				conversation.id,
			),
		).toBe(true);

		expect(
			await db.agentConversation.findUnique({
				where: { id: conversation.id },
				select: { pendingInputRequest: true },
			}),
		).toEqual({ pendingInputRequest: request });
	});

	it("replaces a recorded question with a later session-limit prompt from an earlier step", async () => {
		const conversation = await db.agentConversation.create({
			data: {
				kind: "BUILDER",
				userId,
				sessionId: `builder-limit-supersedes-${suffix}`,
			},
			select: { id: true },
		});
		conversationIds.push(conversation.id);

		const question = {
			kind: "question",
			requestId: "channel-choice",
			prompt: "Which channel?",
			action: {
				kind: "tool-call",
				callId: "call-channel-choice",
				toolName: "ask_question",
				input: { prompt: "Which channel?" },
			},
			display: "select",
		};
		expect(
			await persistBuilderInputRequest(
				{ requests: [question], sequence: 0, stepIndex: 4, turnId: "turn_0" },
				undefined,
				conversation.id,
			),
		).toBe(true);

		const limit = {
			kind: "session-limit",
			requestId: "child:limit:input:114375",
			prompt: "This session has hit the input-token limit.",
			action: {
				kind: "tool-call",
				callId: "child:limit:input:114375",
				toolName: "session_limit_continuation",
				input: { kind: "input", limit: 100000, usedTokens: 114375 },
			},
			display: "confirmation",
			options: [
				{ id: "continue", label: "Approve" },
				{ id: "stop", label: "Stop" },
			],
		};
		expect(
			await persistBuilderInputRequest(
				{ requests: [limit], sequence: 0, stepIndex: 3, turnId: "turn_0" },
				undefined,
				conversation.id,
			),
		).toBe(true);

		expect(
			await db.agentConversation.findUnique({
				where: { id: conversation.id },
				select: { pendingInputRequest: true },
			}),
		).toEqual({ pendingInputRequest: limit });
	});

	it("persists a tool-approval prompt", async () => {
		const conversation = await db.agentConversation.create({
			data: {
				kind: "BUILDER",
				userId,
				sessionId: `builder-tool-approval-${suffix}`,
			},
			select: { id: true },
		});
		conversationIds.push(conversation.id);

		const request = {
			kind: "tool-approval",
			requestId: "approve-save-draft",
			prompt: "Save this agent draft?",
			action: {
				kind: "tool-call",
				callId: "call-save-draft",
				toolName: "save_agent_draft",
				input: { name: "Closed won to Slack" },
			},
			display: "confirmation",
			options: [{ id: "approve", label: "Approve", style: "primary" }],
		};

		expect(
			await persistBuilderInputRequest(
				{ requests: [request], sequence: 2, stepIndex: 1, turnId: "turn_2" },
				undefined,
				conversation.id,
			),
		).toBe(true);

		expect(
			await db.agentConversation.findUnique({
				where: { id: conversation.id },
				select: { pendingInputRequest: true },
			}),
		).toEqual({ pendingInputRequest: request });
	});

	it("ignores a delayed question from a turn the session has already left", async () => {
		const conversation = await db.agentConversation.create({
			data: {
				kind: "BUILDER",
				userId,
				sessionId: `builder-stale-turn-session-${suffix}`,
			},
			select: { id: true },
		});
		conversationIds.push(conversation.id);

		const question = (requestId: string, prompt: string) => ({
			kind: "question",
			requestId,
			prompt,
			action: {
				kind: "tool-call",
				callId: `call-${requestId}`,
				toolName: "ask_question",
				input: { prompt },
			},
			display: "text",
		});

		const current = question("current-turn-question", "Which channel?");
		expect(
			await persistBuilderInputRequest(
				{
					requests: [current],
					sequence: 5,
					stepIndex: 0,
					turnId: "turn_5",
				},
				undefined,
				conversation.id,
			),
		).toBe(true);

		expect(
			await persistBuilderInputRequest(
				{
					requests: [question("earlier-turn-question", "Which stage?")],
					sequence: 3,
					stepIndex: 7,
					turnId: "turn_3",
				},
				undefined,
				conversation.id,
			),
		).toBe(false);

		expect(
			await db.agentConversation.findUnique({
				where: { id: conversation.id },
				select: { pendingInputRequest: true },
			}),
		).toEqual({ pendingInputRequest: current });
		expect(
			await db.agentEvent.count({
				where: {
					id: `builder-input:${conversation.id}:earlier-turn-question`,
				},
			}),
		).toBe(0);
	});

	it("sets a concise model-authored title only once", async () => {
		const conversation = await db.agentConversation.create({
			data: { kind: "BUILDER", userId },
			select: { id: true },
		});
		conversationIds.push(conversation.id);

		expect(
			await setBuilderConversationTitle(
				conversation.id,
				userId,
				"  “Flag stale pipeline deals”  ",
			),
		).toEqual({ saved: true, title: "Flag stale pipeline deals" });
		expect(
			await setBuilderConversationTitle(
				conversation.id,
				userId,
				"Replace the title",
			),
		).toEqual({ saved: false, title: "Flag stale pipeline deals" });
	});

	it("serializes concurrent file writes and draft saves", async () => {
		const instructions =
			"When manually triggered, review the approved CRM scope and write a concise run summary without changing external systems.";
		const writes = await Promise.all(
			Array.from({ length: 4 }, () =>
				writeBuilderArtifact(
					conversationId,
					userId,
					"agent/instructions.md",
					`${instructions}\n`,
				),
			),
		);

		expect(new Set(writes.map((write) => write.id)).size).toBe(1);
		expect(new Set(writes.map((write) => write.revision))).toEqual(
			new Set([1]),
		);

		const input = {
			name: "Meeting prep",
			description: "Prepare a concise CRM meeting brief.",
			instructions,
			triggers: [
				{
					type: "MANUAL" as const,
					name: "Manual",
					summary: "Run when a rep requests meeting preparation.",
				},
			],
			recordScope: "WORKSPACE" as const,
			resources: [],
			actions: [
				{
					type: "run.summary" as const,
					provider: "crm" as const,
					summary: "Write a run summary.",
				},
			],
			access: ["Read CRM records in the approved scope"],
		};
		const saves = await Promise.all(
			Array.from({ length: 4 }, () =>
				saveBuilderDraft(conversationId, userId, input),
			),
		);
		const saved = saves.flatMap((save) => (save.saved ? [save] : []));

		expect(saved).toHaveLength(4);
		expect(new Set(saved.map((save) => save.agentId)).size).toBe(1);
		expect(new Set(saved.map((save) => save.versionId)).size).toBe(1);
		agentId = saved[0]?.agentId ?? "";
		expect(await db.agentDefinition.count({ where: { id: agentId } })).toBe(1);
		expect(await db.agentVersion.count({ where: { agentId } })).toBe(1);

		const artifact = await db.agentBuilderArtifact.findFirstOrThrow({
			where: { conversationId, path: "agent/instructions.md" },
			orderBy: { revision: "desc" },
			select: { revision: true, status: true, versionId: true },
		});
		expect(artifact).toEqual({
			revision: 1,
			status: "READY",
			versionId: saved[0]?.versionId,
		});
	});

	it("assigns consecutive versions to distinct concurrent drafts", async () => {
		const conversation = await db.agentConversation.create({
			data: { kind: "BUILDER", userId },
			select: { id: true },
		});
		conversationIds.push(conversation.id);
		const base = {
			description: "Prepare a distinct CRM run summary.",
			triggers: [
				{
					type: "MANUAL" as const,
					name: "Manual",
					summary: "Run when a rep requests it.",
				},
			],
			recordScope: "WORKSPACE" as const,
			resources: [],
			actions: [
				{
					type: "run.summary" as const,
					provider: "crm" as const,
					summary: "Write a run summary.",
				},
			],
			access: ["Read workspace CRM records"],
		};
		const saves = await Promise.all(
			Array.from({ length: 4 }, (_, index) =>
				saveBuilderDraft(conversation.id, userId, {
					...base,
					name: `Concurrent draft ${index + 1}`,
					instructions: `When manually triggered, prepare distinct CRM summary ${index + 1} without changing external systems.`,
				}),
			),
		);
		const saved = saves.flatMap((save) => (save.saved ? [save] : []));

		expect(saved).toHaveLength(4);
		expect(new Set(saved.map((save) => save.agentId)).size).toBe(1);
		expect(saved.map((save) => save.versionNumber).sort()).toEqual([
			1, 2, 3, 4,
		]);
		expect(
			await db.agentVersion.count({
				where: { agentId: saved[0]?.agentId },
			}),
		).toBe(4);
	});

	it("persists every event trigger on one agent version", async () => {
		const conversation = await db.agentConversation.create({
			data: { kind: "BUILDER", userId },
			select: { id: true },
		});
		conversationIds.push(conversation.id);

		const saved = await saveBuilderDraft(conversation.id, userId, {
			name: "Deal lifecycle alerts",
			description: "Report deal creation, opening, and closing.",
			instructions:
				"When a configured deal lifecycle event occurs, read the triggering deal, return one concise summary of the change, and stop without changing CRM records.",
			triggers: [
				{
					type: "EVENT",
					name: "Deal created",
					summary: "Run when a deal is created.",
					event: "deal.created",
				},
				{
					type: "EVENT",
					name: "Deal opened",
					summary: "Run when a closed deal returns to the open pipeline.",
					event: "deal.opened",
				},
				{
					type: "EVENT",
					name: "Deal closed",
					summary: "Run when an open deal enters a closed stage.",
					event: "deal.closed",
				},
			],
			recordScope: "WORKSPACE",
			resources: [],
			actions: [
				{
					type: "run.summary",
					provider: "crm",
					summary: "Write a deal lifecycle summary.",
				},
			],
			access: ["Read workspace CRM records"],
		});
		if (!saved.saved) throw new Error("Lifecycle draft was not saved");

		expect(
			await db.agentTrigger.findMany({
				where: { versionId: saved.versionId },
				orderBy: { createdAt: "asc" },
				select: { type: true, config: true },
			}),
		).toEqual([
			{ type: "EVENT", config: { event: "deal.created" } },
			{ type: "EVENT", config: { event: "deal.opened" } },
			{ type: "EVENT", config: { event: "deal.closed" } },
		]);

		const version = await db.agentVersion.findUniqueOrThrow({
			where: { id: saved.versionId },
			select: { manifest: true },
		});
		expect(version.manifest).toMatchObject({
			triggers: [
				{ config: { event: "deal.created" } },
				{ config: { event: "deal.opened" } },
				{ config: { event: "deal.closed" } },
			],
		});
	});

	it("fails closed on unsupported integrations and ambiguous record scope", async () => {
		const conversation = await db.agentConversation.create({
			data: { kind: "BUILDER", userId },
			select: { id: true },
		});
		conversationIds.push(conversation.id);
		const base = {
			name: "Safe scope",
			description: "Keep a bounded CRM summary.",
			instructions:
				"When manually triggered, read only the approved CRM scope and return a concise summary without changing CRM records.",
			triggers: [
				{
					type: "MANUAL" as const,
					name: "Manual",
					summary: "Run only when a teammate requests it.",
				},
			],
			actions: [
				{
					type: "run.summary" as const,
					provider: "crm" as const,
					summary: "Return a run summary.",
				},
			],
			access: ["Read approved CRM records"],
		};

		const unsupported = await saveBuilderDraft(conversation.id, userId, {
			...base,
			recordScope: "WORKSPACE",
			resources: [
				{ kind: "integration", id: "google:drive", label: "Google Drive" },
			],
		});
		expect(unsupported).toMatchObject({
			saved: false,
			issues: ["Google Drive is not an available integration."],
		});

		const ambiguous = await saveBuilderDraft(conversation.id, userId, {
			...base,
			recordScope: "SELECTED",
			resources: [],
		});
		expect(ambiguous).toMatchObject({
			saved: false,
			issues: ["Selected CRM scope needs at least one tagged record."],
		});

		const missingSummary = await saveBuilderDraft(conversation.id, userId, {
			...base,
			recordScope: "WORKSPACE",
			resources: [],
			actions: [
				{
					type: "crm.activity.create",
					provider: "crm",
					summary: "Write one note.",
					activityTypes: ["NOTE"],
				},
			],
		});
		expect(missingSummary).toMatchObject({
			saved: false,
			issues: ["An agent needs one run summary action."],
		});

		const duplicateActions = await saveBuilderDraft(conversation.id, userId, {
			...base,
			recordScope: "WORKSPACE",
			resources: [],
			actions: [...base.actions, ...base.actions],
		});
		expect(duplicateActions).toMatchObject({
			saved: false,
			issues: ["The run.summary action is listed more than once."],
		});
	});

	it("keeps a live definition unchanged until a revised version is deployed", async () => {
		const conversation = await db.agentConversation.create({
			data: { kind: "BUILDER", userId },
			select: { id: true },
		});
		conversationIds.push(conversation.id);

		const original = {
			name: "Workspace pulse",
			description: "Report the workspace company count.",
			instructions:
				"When manually triggered, read workspace companies and return the company count in a concise run summary without changing CRM records.",
			triggers: [
				{
					type: "MANUAL" as const,
					name: "Manual",
					summary: "Run when a teammate requests a workspace pulse.",
				},
			],
			recordScope: "WORKSPACE" as const,
			resources: [],
			actions: [
				{
					type: "run.summary" as const,
					provider: "crm" as const,
					summary: "Write a run summary.",
				},
			],
			access: ["Read workspace CRM records"],
		};
		const first = await saveBuilderDraft(conversation.id, userId, original);
		if (!first.saved) throw new Error("Initial draft was not saved");

		await db.$transaction([
			db.agentVersion.update({
				where: { id: first.versionId },
				data: { status: "DEPLOYED" },
			}),
			db.agentDefinition.update({
				where: { id: first.agentId },
				data: {
					name: "Workspace pulse",
					description: "Team-visible description",
					status: "LIVE",
					currentVersionId: first.versionId,
				},
			}),
		]);

		const revised = {
			...original,
			name: "Workspace health pulse",
			description: "Report company and open-deal counts.",
		};
		await writeBuilderArtifact(
			conversation.id,
			userId,
			"agent/README.md",
			`# ${revised.name}\n\n${revised.description}\n\n## Triggers\n\n- ${revised.triggers[0]?.summary}\n\n## Access\n\n- ${revised.access[0]}\n`,
		);
		const second = await saveBuilderDraft(conversation.id, userId, revised);
		if (!second.saved) throw new Error("Revised draft was not saved");

		const [definition, version, artifacts] = await Promise.all([
			db.agentDefinition.findUniqueOrThrow({
				where: { id: first.agentId },
				select: {
					name: true,
					description: true,
					status: true,
					currentVersionId: true,
				},
			}),
			db.agentVersion.findUniqueOrThrow({
				where: { id: second.versionId },
				select: { number: true, status: true, manifest: true },
			}),
			db.agentBuilderArtifact.findMany({
				where: { conversationId: conversation.id, versionId: second.versionId },
				select: { path: true, status: true },
			}),
		]);

		expect(second.versionId).not.toBe(first.versionId);
		expect(definition).toEqual({
			name: "Workspace pulse",
			description: "Team-visible description",
			status: "LIVE",
			currentVersionId: first.versionId,
		});
		expect(version).toMatchObject({
			number: 2,
			status: "READY",
			manifest: {
				name: revised.name,
				description: revised.description,
			},
		});
		expect(artifacts).toHaveLength(3);
		expect(artifacts.every((artifact) => artifact.status === "READY")).toBe(
			true,
		);
		expect(
			await db.agentBuilderArtifact.count({
				where: { conversationId: conversation.id, status: "WRITING" },
			}),
		).toBe(0);
	});
});
