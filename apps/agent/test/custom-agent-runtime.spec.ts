import { describe, expect, it } from "bun:test";
import { builderTaskMarkdown } from "../agent/instructions/task";
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
		expect(creation).toContain("call ask_question");
		expect(creation).toContain("exactly one decision at a time");
		expect(creation).toContain(
			"Do not interrupt a sufficiently specific request",
		);
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
