import { describe, expect, it } from "bun:test";
import { builderTaskMarkdown } from "../agent/instructions/task";
import { AGENT_ACTION_EXECUTORS } from "../agent/lib/agent-actions";
import { recordBuilderDelegation } from "../agent/lib/builder-delegation";
import {
	actionIntegrationIssues,
	type DraftAction,
	slackDestinationIssues,
	withheldActionIssues,
} from "../agent/lib/builder-runtime";
import {
	builderCommandType,
	builderDeliveryMessage,
	builderIdFromToken,
	builderToken,
	runIdFromToken,
	runToken,
} from "../agent/lib/custom-agent-dispatch";
import {
	allowedHistorySources,
	approvedSlackDestination,
	sendSlackMessage,
} from "../agent/lib/run-runtime";
import {
	assertResearchPurpose,
	attribute,
	purposeOf,
	requireBuilderAttribute,
	requireBuilderReadAttribute,
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
	it("keeps clarification answers in agent-creation mode without coercing chat", () => {
		expect(
			builderCommandType("CHAT", {
				inputResponse: { requestId: "question-1", optionId: "crm-task" },
			}),
		).toBe("CREATE_AGENT");
		expect(builderCommandType("CHAT", { text: "Also add a note" })).toBe(
			"CHAT",
		);
		expect(builderCommandType("CHAT", { text: "Research this company" })).toBe(
			"CHAT",
		);
	});

	it("routes a selected answer back to the parked Eve input request", () => {
		expect(
			builderDeliveryMessage("submission-1", {
				text: "Use a CRM task instead",
				inputResponse: {
					requestId: "question-1",
					optionId: "crm-task",
				},
			}),
		).toEqual({
			inputResponses: [{ requestId: "question-1", optionId: "crm-task" }],
		});
	});

	it("routes a written answer back to the parked Eve input request", () => {
		expect(
			builderDeliveryMessage("submission-1", {
				text: "Use the private renewals channel",
				inputResponse: {
					requestId: "question-2",
					text: "Use the private renewals channel",
				},
			}),
		).toEqual({
			inputResponses: [
				{
					requestId: "question-2",
					text: "Use the private renewals channel",
				},
			],
		});
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

	it("leaves the read-only deal list open to the assistant chat that is told to use it", async () => {
		const source = await Bun.file(
			new URL("../agent/tools/list_deals.ts", import.meta.url),
		).text();

		expect(source).not.toContain("assertResearchPurpose");
		expect(builderTaskMarkdown(null)).toContain("list_deals");
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

	it("lets the builder read its context on a chat turn, but not save a draft", () => {
		expect(
			requireBuilderReadAttribute(context("builder", "CHAT"), "conversationId"),
		).toBe("chat-1");
		expect(() =>
			requireBuilderAttribute(context("builder", "CHAT"), "conversationId"),
		).toThrow("Agent creation requires an explicit request");
	});

	it("keeps every builder tool out of a session that is not the builder", () => {
		expect(() =>
			requireBuilderReadAttribute(context("research"), "conversationId"),
		).toThrow("unavailable for this session");
		expect(() =>
			requireBuilderAttribute(context("research"), "conversationId"),
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

describe("deployed Slack actions", () => {
	const manifest = {
		triggers: [
			{
				type: "MANUAL",
				name: "Run now",
				summary: "Run on demand",
				config: {},
			},
		],
		dataScope: {
			mode: "WORKSPACE",
			summary: "Workspace CRM records",
			resources: [
				{ kind: "integration", id: "slack:workspace", label: "Slack" },
			],
		},
		actions: [
			{
				type: "slack.message.post",
				provider: "slack",
				summary: "Direct message the deal owner",
				destination: {
					kind: "user",
					resolution: "chosen",
					id: "U123",
					label: "@grim",
				},
			},
			{
				type: "run.summary",
				provider: "crm",
				summary: "Summarize the Slack delivery",
			},
		],
	};

	it("derives the destination from the deployed manifest", () => {
		expect(approvedSlackDestination(manifest)).toEqual({
			kind: "user",
			id: "U123",
			label: "@grim",
		});
		expect(() =>
			approvedSlackDestination({
				...manifest,
				dataScope: { ...manifest.dataScope, resources: [] },
			}),
		).toThrow("does not allow Slack");
	});

	it("posts with a stable Slack replay id", async () => {
		const requests: Array<{ url: string; body: unknown }> = [];
		const order: string[] = [];
		const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
			order.push(String(input));
			requests.push({
				url: String(input),
				body: JSON.parse(String(init?.body)),
			});
			return requests.length === 1
				? Response.json({ ok: true, channel: { id: "D123" } })
				: Response.json({ ok: true, channel: "D123", ts: "123.456" });
		}) as typeof fetch;

		expect(
			await sendSlackMessage(
				"xoxb-test",
				{ kind: "user", id: "U123", label: "@grim" },
				"A deal just closed.",
				"7d3e8854-79f9-48dd-a933-8cfb5994f99e",
				{
					fetcher,
					beforePost: async () => {
						order.push("guard");
					},
				},
			),
		).toEqual({ channel: "D123", ts: "123.456" });
		expect(requests).toEqual([
			{
				url: "https://slack.com/api/conversations.open",
				body: { users: "U123", return_im: true },
			},
			{
				url: "https://slack.com/api/chat.postMessage",
				body: {
					channel: "D123",
					text: "A deal just closed.",
					client_msg_id: "7d3e8854-79f9-48dd-a933-8cfb5994f99e",
				},
			},
		]);
		expect(order).toEqual([
			"https://slack.com/api/conversations.open",
			"guard",
			"https://slack.com/api/chat.postMessage",
		]);
	});

	it("surfaces an actionable missing-channel error", async () => {
		const fetcher = (async () =>
			Response.json({ ok: false, error: "not_in_channel" })) as typeof fetch;

		expect(
			sendSlackMessage(
				"xoxb-test",
				{ kind: "channel", id: "C123", label: "#alerts" },
				"A deal just closed.",
				"7d3e8854-79f9-48dd-a933-8cfb5994f99e",
				{ fetcher },
			),
		).rejects.toThrow("Invite the app");
	});
});

describe("deployed action executors", () => {
	it("registers an executor for every draftable action", () => {
		const draftable = builderDraftToolInput.shape.actions.element.options.map(
			(option) => option.shape.type.value,
		);
		expect(Object.keys(AGENT_ACTION_EXECUTORS).sort()).toEqual(
			draftable.sort(),
		);
	});
});

describe("builder command routing", () => {
	it("delegates only the explicit creation command to the agent builder", () => {
		const creation = builderTaskMarkdown("CREATE_AGENT");
		expect(creation).toContain("Call agent_builder exactly once");
		expect(creation).toContain("do not ask the user a clarification yourself");
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
			triggers: [
				{
					type: "MANUAL",
					name: "Prepare renewal brief",
					summary: "Run before a renewal call",
				},
			],
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
			triggers: [
				{
					type: "MANUAL",
					name: "Prepare renewal brief",
					summary: "Run before a renewal call",
				},
			],
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
				triggers: [
					{
						type: "MANUAL",
						name: "Prepare renewal brief",
						summary: "Run before a renewal call",
					},
				],
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

	it("keeps the approved Slack destination and its resolution mode", () => {
		const parsed = builderDraftToolInput.parse({
			name: "Demo welcome",
			description: "Tell sales when a demo is booked.",
			instructions:
				"When a demo is booked, post the approved summary to the chosen sales channel and stop after one message.",
			triggers: [
				{
					type: "MANUAL",
					name: "Welcome demo",
					summary: "Run for a booked demo",
				},
			],
			recordScope: "WORKSPACE",
			resources: [],
			integrations: ["slack"],
			actions: [
				{
					type: "slack.message.post",
					provider: "slack",
					summary: "Tell sales the prospect arrived",
					destination: {
						kind: "channel",
						resolution: "chosen",
						id: "C123",
						label: "#sales",
					},
				},
			],
		});

		expect(draftInputFromTool(parsed)).toMatchObject({
			resources: [
				{ kind: "integration", id: "slack:workspace", label: "Slack" },
			],
			actions: [
				{
					type: "slack.message.post",
					destination: {
						kind: "channel",
						resolution: "chosen",
						id: "C123",
						label: "#sales",
					},
				},
			],
			access: [
				"Read workspace CRM records",
				"Post to approved Slack destinations",
			],
		});
	});

	it("keeps an approved Slack person destination", () => {
		const parsed = builderDraftToolInput.parse({
			name: "Deal alert",
			description: "Tell Grim when a deal is created.",
			instructions:
				"When a deal is created, send one direct Slack message to the approved workspace member and stop.",
			triggers: [
				{
					type: "MANUAL",
					name: "New deal alert",
					summary: "Run for every new deal",
				},
			],
			recordScope: "WORKSPACE",
			resources: [],
			integrations: ["slack"],
			actions: [
				{
					type: "slack.message.post",
					provider: "slack",
					summary: "Direct message Grim",
					destination: {
						kind: "user",
						resolution: "chosen",
						id: "U123",
						label: "@grim",
					},
				},
			],
		});

		expect(draftInputFromTool(parsed).actions[0]).toMatchObject({
			type: "slack.message.post",
			destination: {
				kind: "user",
				resolution: "chosen",
				id: "U123",
				label: "@grim",
			},
		});
	});

	it("rejects Slack destinations outside the inspected choices", () => {
		const connections = {
			slackChannels: [{ id: "C123", label: "#sales", memberCount: 8 }],
			slackPeople: [
				{
					id: "U123",
					label: "@grim",
					name: "Grim",
					email: "grim@example.com",
					slackEmail: "grim@example.com",
				},
			],
		};

		expect(
			slackDestinationIssues(
				{
					kind: "user",
					resolution: "chosen",
					id: "U999",
					label: "@invented",
				},
				connections,
			),
		).toEqual(["The Slack person is not available to this workspace."]);
		expect(
			slackDestinationIssues(
				{
					kind: "user",
					resolution: "chosen",
					id: "U123",
					label: "@wrong",
				},
				connections,
			),
		).toEqual(["The Slack person must use its exact inspected label."]);
	});

	it("requires the Slack integration for a Slack post action", () => {
		const actions: DraftAction[] = [
			{ type: "run.summary", provider: "crm", summary: "Report the run" },
			{
				type: "slack.message.post",
				provider: "slack",
				summary: "Direct message Grim",
				destination: {
					kind: "user",
					resolution: "chosen",
					id: "U123",
					label: "@grim",
				},
			},
		];

		expect(actionIntegrationIssues(actions, [])).toEqual([
			"Posting to Slack needs Slack in this agent's integrations.",
		]);
		expect(
			actionIntegrationIssues(actions, [
				{ kind: "integration", id: "slack:workspace", label: "Slack" },
			]),
		).toEqual([]);
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
				triggers: [
					{
						type: "MANUAL",
						name: "   ",
						summary: "Run before a renewal call",
					},
				],
			}).success,
		).toBe(false);

		const parsed = builderDraftToolInput.parse({
			...base,
			triggers: [
				{
					type: "MANUAL",
					name: "  Prepare renewal brief  ",
					summary: "  Run before a renewal call  ",
				},
			],
		});
		expect(parsed.triggers[0]?.name).toBe("Prepare renewal brief");
		expect(parsed.triggers[0]?.summary).toBe("Run before a renewal call");
		expect(parsed.actions[0]?.summary).toBe("Write a reviewable renewal brief");
	});

	it("accepts multiple supported CRM events without a polling schedule", () => {
		const parsed = builderDraftToolInput.parse({
			name: "Closed deal alert",
			description: "Alert the team whenever a deal closes.",
			instructions:
				"When the triggering deal closes, read that deal, prepare one concise alert, and stop after the approved action.",
			triggers: [
				{
					type: "EVENT",
					name: "When a deal is created",
					summary: "Runs when a deal is created",
					event: "deal.created",
				},
				{
					type: "EVENT",
					name: "When a deal opens",
					summary: "Runs when a closed deal returns to the open pipeline",
					event: "deal.opened",
				},
				{
					type: "EVENT",
					name: "When a deal closes",
					summary: "Runs when a deal first enters a closed stage",
					event: "deal.closed",
				},
			],
			recordScope: "WORKSPACE",
			resources: [],
			integrations: [],
			actions: [
				{
					type: "run.summary",
					provider: "crm",
					summary: "Record the closed-deal alert",
				},
			],
		});

		expect(draftInputFromTool(parsed).triggers).toHaveLength(3);
		expect(
			draftInputFromTool(parsed).triggers.map((trigger) => trigger.event),
		).toEqual(["deal.created", "deal.opened", "deal.closed"]);
	});
});

describe("agent builder draft access", () => {
	const draft = (actions: unknown[]) =>
		builderDraftToolInput.parse({
			name: "Handoff",
			description: "Hand new customers to onboarding.",
			instructions:
				"Run on demand. Read closed-won deals and record the handoff for onboarding.",
			triggers: [
				{
					type: "MANUAL",
					name: "Run handoff",
					summary: "Run for new customers",
				},
			],
			recordScope: "WORKSPACE",
			resources: [],
			integrations: [],
			actions,
		});

	it("declares the writes a draft was granted, not just its reads", () => {
		expect(
			draftInputFromTool(
				draft([
					{
						type: "crm.activity.create",
						provider: "crm",
						summary: "Log the handoff brief",
						activityTypes: ["NOTE", "TASK"],
					},
				]),
			).access,
		).toEqual([
			"Read workspace CRM records",
			"Write notes on CRM records",
			"Create tasks on CRM records",
		]);
	});

	it("only declares the activity types actually granted", () => {
		expect(
			draftInputFromTool(
				draft([
					{
						type: "crm.activity.create",
						provider: "crm",
						summary: "Log the handoff brief",
						activityTypes: ["NOTE"],
					},
				]),
			).access,
		).toEqual(["Read workspace CRM records", "Write notes on CRM records"]);
	});

	it("keeps a read-only draft read-only", () => {
		expect(
			draftInputFromTool(
				draft([
					{
						type: "run.summary",
						provider: "crm",
						summary: "Return a run summary",
					},
				]),
			).access,
		).toEqual(["Read workspace CRM records"]);
	});

	it("does not repeat an activity type granted by two actions", () => {
		expect(
			draftInputFromTool(
				draft([
					{
						type: "crm.activity.create",
						provider: "crm",
						summary: "Log the handoff brief",
						activityTypes: ["NOTE"],
					},
					{
						type: "crm.activity.create",
						provider: "crm",
						summary: "Log a follow-up",
						activityTypes: ["NOTE", "TASK"],
					},
				]),
			).access,
		).toEqual([
			"Read workspace CRM records",
			"Write notes on CRM records",
			"Create tasks on CRM records",
		]);
	});
});

describe("withheld actions", () => {
	const slackPost = {
		type: "slack.message.post",
		provider: "slack",
		summary: "Tell the channel",
		destination: {
			resolution: "chosen",
			kind: "channel",
			id: "C123",
			label: "#sales",
		},
	} satisfies DraftAction;

	it("refuses the duplicate rule that silenced the closed-won notifier", () => {
		const issues = withheldActionIssues(
			"Before posting, verify that a notification has not already been sent for this deal id. If you are unsure whether a notification was already sent, skip — it is better to skip than to double-post.",
			[slackPost],
		);

		expect(issues).toHaveLength(3);
	});

	it("accepts a stated condition that reports itself", () => {
		expect(
			withheldActionIssues(
				"Post only when the deal amount is above 10000. Otherwise skip the post and call finish_run with noActionNeeded and the reason.",
				[slackPost],
			),
		).toEqual([]);
	});

	it("refuses a withheld CRM note, an action that depends on no integration", () => {
		expect(
			withheldActionIssues(
				"Log a note on the deal unless a note has already been posted for it.",
				[
					{
						type: "crm.activity.create",
						provider: "crm",
						summary: "Log the update",
						activityTypes: ["NOTE"],
					},
				],
			),
		).toHaveLength(1);
	});

	it("leaves instructions with no external action alone", () => {
		expect(
			withheldActionIssues("If you are unsure, skip and double-post nothing.", [
				{
					type: "run.summary",
					provider: "crm",
					summary: "Say what happened",
				},
			]),
		).toEqual([]);
	});
});
