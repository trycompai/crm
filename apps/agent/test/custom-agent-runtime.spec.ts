import { describe, expect, it } from "bun:test";
import { builderTaskMarkdown } from "../agent/instructions/task";
import { recordBuilderDelegation } from "../agent/lib/builder-delegation";
import {
	builderCommandType,
	builderDeliveryMessage,
	builderIdFromToken,
	builderToken,
	runIdFromToken,
	runToken,
} from "../agent/lib/custom-agent-dispatch";
import { allowedHistorySources } from "../agent/lib/run-runtime";
import {
	assertResearchPurpose,
	attribute,
	purposeOf,
	requireBuilderAttribute,
	requireTeamAgentAttribute,
} from "../agent/lib/session-purpose";
import {
	builderDraftToolInput,
	draftInputFromTool,
} from "../agent/subagents/agent_builder/lib/draft-input";
import {
	finishBuilderDraftSave,
	recordBuilderActions,
} from "../agent/subagents/agent_builder/lib/execution-state";

const context = (purpose?: string, commandType?: string) => ({
	session: {
		auth: {
			current: purpose
				? {
						attributes: {
							purpose,
							conversationId: "chat-1",
							commandType,
						},
					}
				: { attributes: {} },
			initiator: { attributes: { userId: "user-1" } },
		},
	},
});

describe("custom agent continuation tokens", () => {
	it("round-trips a builder conversation through the channel token", () => {
		expect(builderIdFromToken(builderToken("chat-1"))).toBe("chat-1");
		expect(builderIdFromToken(`crm:${builderToken("chat-1")}`)).toBe("chat-1");
	});

	it("round-trips a team agent run without accepting another token kind", () => {
		expect(runIdFromToken(runToken("run-1"))).toBe("run-1");
		expect(runIdFromToken(builderToken("chat-1"))).toBeNull();
	});
});

describe("builder delivery messages", () => {
	it("keeps clarification answers in agent-creation mode", () => {
		expect(
			builderCommandType("CHAT", {
				inputResponse: { requestId: "question-1", answer: "crm-task" },
			}),
		).toBe("CREATE_AGENT");
		expect(builderCommandType("CHAT", { text: "Research this company" })).toBe(
			"CHAT",
		);
	});

	it("delivers a question response without submission wrapper text", () => {
		expect(
			builderDeliveryMessage("submission-1", {
				text: "Use a CRM task instead",
				inputResponse: {
					requestId: "question-1",
					answer: "crm-task",
				},
			}),
		).toBe("crm-task");
	});

	it("delivers persisted attachment bytes with model-visible metadata", () => {
		const content = Buffer.from("quarterly plan");
		const message = builderDeliveryMessage(
			"submission-2",
			{ text: "Summarize this file", resources: [], attachments: [] },
			[
				{
					name: "plan.txt",
					mediaType: "text/plain",
					content,
				},
			],
		);

		expect(message).toEqual([
			{
				type: "text",
				text: "Submission id: submission-2\n\nSummarize this file",
			},
			{
				type: "file",
				data: content,
				mediaType: "text/plain",
				filename: "plan.txt",
			},
		]);
	});
});

describe("session purpose boundaries", () => {
	it("reads current-turn attributes before initiator attributes", () => {
		expect(attribute(context("builder"), "conversationId")).toBe("chat-1");
		expect(attribute(context("builder"), "userId")).toBe("user-1");
	});

	it("defaults ordinary CRM sessions to research", () => {
		expect(purposeOf(context())).toBe("research");
		expect(() => assertResearchPurpose(context())).not.toThrow();
	});

	it("rejects research writes from builder and team-agent sessions", () => {
		expect(() => assertResearchPurpose(context("builder"))).toThrow();
		expect(() => assertResearchPurpose(context("team-agent"))).toThrow();
	});

	it("binds specialist tools to their explicit session purpose", () => {
		expect(
			requireBuilderAttribute(
				context("builder", "CREATE_AGENT"),
				"conversationId",
			),
		).toBe("chat-1");
		expect(() =>
			requireBuilderAttribute(context("builder", "CHAT"), "conversationId"),
		).toThrow();
		expect(() =>
			requireTeamAgentAttribute(context("builder"), "runId"),
		).toThrow();
	});
});

describe("deployed agent data sources", () => {
	it("enables only integrations stored in the approved manifest", () => {
		expect(allowedHistorySources([])).toEqual({
			gmail: false,
			calendar: false,
		});
		expect(
			allowedHistorySources([
				{ kind: "integration", id: "google:gmail", label: "Gmail" },
			]),
		).toEqual({ gmail: true, calendar: false });
	});
});

describe("builder command routing", () => {
	it("delegates only the explicit creation command to the agent builder", () => {
		const creation = builderTaskMarkdown("CREATE_AGENT");
		expect(creation).toContain("Call agent_builder exactly once");
		expect(creation).toContain("Never retry agent_builder in the same turn");
		expect(creation).toContain("asks any essential clarification directly");
		const chat = builderTaskMarkdown("CHAT");
		expect(chat).toContain("Do not call agent_builder");
		expect(chat).toContain("call ask_question");
		expect(chat).toContain("one focused follow-up");
		expect(chat).toContain(
			"Do not restate or enumerate individual deal rows in prose, bullets, or tables",
		);
		expect(builderTaskMarkdown(null)).toContain("private CRM assistant chat");
	});

	it("requires the configured model to title only a new builder chat", () => {
		const untitled = builderTaskMarkdown("CHAT", true);
		expect(untitled).toContain("call set_chat_title once");
		expect(untitled).toContain("three to seven words");
		expect(builderTaskMarkdown("CHAT", false)).not.toContain("set_chat_title");
	});
});

describe("builder delegation guard", () => {
	it("allows one idempotent builder delegation per turn", () => {
		const first = recordBuilderDelegation(
			{ turnId: null, callIds: [] },
			"turn-1",
			[
				{
					kind: "subagent-call",
					callId: "call-1",
					subagentName: "agent_builder",
				},
			],
		);

		expect(
			recordBuilderDelegation(first, "turn-1", [
				{
					kind: "subagent-call",
					callId: "call-1",
					subagentName: "agent_builder",
				},
			]),
		).toEqual(first);
		expect(() =>
			recordBuilderDelegation(first, "turn-1", [
				{
					kind: "subagent-call",
					callId: "call-2",
					subagentName: "agent_builder",
				},
			]),
		).toThrow("only once");
		expect(
			recordBuilderDelegation(first, "turn-2", [
				{
					kind: "subagent-call",
					callId: "call-2",
					subagentName: "agent_builder",
				},
			]),
		).toEqual({ turnId: "turn-2", callIds: ["call-2"] });
	});
});

describe("agent builder execution guard", () => {
	it("bounds save attempts and permits only final output after saving", () => {
		const initial = {
			turnId: null,
			stepIndex: null,
			callIds: [],
			stepCallIds: [],
			saveCallIds: [],
			savePending: false,
			saved: false,
		};
		const first = recordBuilderActions(initial, "turn-1", 0, [
			{
				kind: "tool-call",
				callId: "save-1",
				toolName: "save_agent_draft",
			},
		]);
		const second = recordBuilderActions(
			finishBuilderDraftSave(first, false),
			"turn-1",
			1,
			[
				{
					kind: "tool-call",
					callId: "save-2",
					toolName: "save_agent_draft",
				},
			],
		);

		expect(() =>
			recordBuilderActions(finishBuilderDraftSave(second, false), "turn-1", 2, [
				{
					kind: "tool-call",
					callId: "save-3",
					toolName: "save_agent_draft",
				},
			]),
		).toThrow("draft-save budget");

		const saved = finishBuilderDraftSave(first, true);
		expect(() =>
			recordBuilderActions(saved, "turn-2", 0, [
				{
					kind: "tool-call",
					callId: "write-1",
					toolName: "write_agent_file",
				},
			]),
		).toThrow("already saved");
		expect(() =>
			recordBuilderActions(saved, "turn-2", 0, [
				{
					kind: "tool-call",
					callId: "final-1",
					toolName: "final_output",
				},
			]),
		).not.toThrow();
	});

	it("requires draft saving to run by itself", () => {
		const initial = {
			turnId: null,
			stepIndex: null,
			callIds: [],
			stepCallIds: [],
			saveCallIds: [],
			savePending: false,
			saved: false,
		};

		expect(() =>
			recordBuilderActions(initial, "turn-1", 0, [
				{
					kind: "tool-call",
					callId: "save-1",
					toolName: "save_agent_draft",
				},
				{
					kind: "tool-call",
					callId: "write-1",
					toolName: "write_agent_file",
				},
			]),
		).toThrow("Wait for save_agent_draft");
		expect(() =>
			recordBuilderActions(initial, "turn-1", 0, [
				{
					kind: "tool-call",
					callId: "write-1",
					toolName: "write_agent_file",
				},
				{
					kind: "tool-call",
					callId: "save-1",
					toolName: "save_agent_draft",
				},
			]),
		).toThrow("by itself");
	});
});

describe("agent builder draft input", () => {
	it("separates canonical integrations from exact CRM resources", () => {
		const parsed = builderDraftToolInput.parse({
			name: "Renewal prep",
			description: "Prepare a renewal call brief.",
			instructions:
				"Run manually. Read the selected deal and summarize renewal risks for review.",
			trigger: {
				type: "MANUAL",
				name: "Prepare renewal brief",
				summary: "Run before a renewal call",
			},
			recordScope: "SELECTED",
			resources: [{ kind: "deal", id: "deal-1", label: "Acme renewal" }],
			integrations: ["gmail", "calendar"],
			actions: [
				{
					type: "run.summary",
					provider: "crm",
					summary: "Write a reviewable renewal brief",
				},
			],
		});

		expect(draftInputFromTool(parsed)).toMatchObject({
			resources: [
				{ kind: "deal", id: "deal-1", label: "Acme renewal" },
				{ kind: "integration", id: "google:gmail", label: "Gmail" },
				{
					kind: "integration",
					id: "google:calendar",
					label: "Google Calendar",
				},
			],
			access: [
				"Read selected CRM records",
				"Read connected Gmail messages",
				"Read connected Google Calendar events",
			],
		});
	});

	it("rejects guessed integration resource objects", () => {
		const result = builderDraftToolInput.safeParse({
			name: "Renewal prep",
			description: "Prepare a renewal call brief.",
			instructions:
				"Run manually. Read the selected deal and summarize renewal risks for review.",
			trigger: {
				type: "MANUAL",
				name: "Prepare renewal brief",
				summary: "Run before a renewal call",
			},
			recordScope: "SELECTED",
			resources: [{ kind: "integration", id: "gmail", label: "gmail" }],
			integrations: [],
			actions: [
				{
					type: "run.summary",
					provider: "crm",
					summary: "Write a reviewable renewal brief",
				},
			],
		});

		expect(result.success).toBe(false);
		expect(
			builderDraftToolInput.safeParse({
				name: "Renewal prep",
				description: "Prepare a renewal call brief.",
				instructions:
					"Run manually. Read workspace deals and summarize renewal risks for review.",
				trigger: {
					type: "MANUAL",
					name: "Prepare renewal brief",
					summary: "Run before a renewal call",
				},
				recordScope: "WORKSPACE",
				resources: [],
				integrations: ["crm"],
				actions: [
					{
						type: "run.summary",
						provider: "crm",
						summary: "Write a reviewable renewal brief",
					},
				],
			}).success,
		).toBe(false);
	});

	it("trims trigger metadata and rejects blank text", () => {
		const base = {
			name: "Renewal prep",
			description: "Prepare a renewal call brief.",
			instructions:
				"Run manually. Read workspace deals and summarize renewal risks for review.",
			recordScope: "WORKSPACE" as const,
			resources: [],
			integrations: [],
			actions: [
				{
					type: "run.summary" as const,
					provider: "crm" as const,
					summary: "  Write a reviewable renewal brief  ",
				},
			],
		};

		expect(
			builderDraftToolInput.safeParse({
				...base,
				trigger: {
					type: "MANUAL",
					name: "   ",
					summary: "Run before a renewal call",
				},
			}).success,
		).toBe(false);

		const parsed = builderDraftToolInput.parse({
			...base,
			trigger: {
				type: "MANUAL",
				name: "  Prepare renewal brief  ",
				summary: "  Run before a renewal call  ",
			},
		});
		expect(parsed.trigger.name).toBe("Prepare renewal brief");
		expect(parsed.trigger.summary).toBe("Run before a renewal call");
		expect(parsed.actions[0]?.summary).toBe("Write a reviewable renewal brief");
	});
});
