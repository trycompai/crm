import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import type { EveMessage } from "eve/react";
import {
	conversationTimeline,
	dealListResultOf,
	describe as describeStep,
	eventStreamSettled,
	latestTurnFailure,
	mergeDealListResultPages,
	NEW_THREAD,
	outcomeTone,
	pendingQuestion,
	resolveThread,
	sourcesOf,
	splitMarkdownTable,
	TOOL_VERBS,
	toTranscript,
} from "../lib/agent-transcript";

const message = (
	parts: unknown[],
	role: "user" | "assistant" = "assistant",
	id = "m1",
	turnId?: string,
) =>
	({
		id,
		role,
		parts,
		metadata: turnId ? { turnId } : undefined,
	}) as unknown as EveMessage;

const tool = (
	toolName: string,
	extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
	type: "dynamic-tool",
	toolName,
	state: "output-available",
	...extra,
});

describe("toTranscript", () => {
	it("keeps a rep's question as the words they typed", () => {
		const [first] = toTranscript([
			message([{ type: "text", text: "Hey!" }], "user"),
		]);

		expect(first?.mine).toBe(true);
		expect(first?.items[0]).toMatchObject({ kind: "said", text: "Hey!" });
	});

	it("keeps a pasted image as an attachment on the rep's message", () => {
		const [first] = toTranscript([
			message(
				[
					{ type: "text", text: "Match this style." },
					{
						type: "file",
						mediaType: "image/png",
						filename: "brand.png",
						url: "data:image/png;base64,QQ==",
					},
				],
				"user",
			),
		]);

		expect(first?.items[0]).toMatchObject({
			kind: "said",
			text: "Match this style.",
		});
		expect(first?.items[1]).toMatchObject({
			kind: "attached",
			mine: true,
			mediaType: "image/png",
			filename: "brand.png",
			url: "data:image/png;base64,QQ==",
		});
	});

	it("keeps an attachment even when eve returns no browser url", () => {
		const [first] = toTranscript([
			message([{ type: "file", mediaType: "image/jpeg" }], "user"),
		]);

		expect(first?.items[0]).toMatchObject({
			kind: "attached",
			mine: true,
			mediaType: "image/jpeg",
			filename: null,
			url: null,
		});
	});

	it("keeps one message's parts in one row", () => {
		const grouped = toTranscript([
			message([
				{ type: "text", text: "Looking now." },
				tool("read_crm_history", { output: {} }),
			]),
		]);

		expect(grouped).toHaveLength(1);
		expect(grouped[0]?.items.map((item) => item.kind)).toEqual(["said", "did"]);
	});

	it("keeps emitted model reasoning as a first-class part", () => {
		const grouped = toTranscript([
			message([
				{
					type: "reasoning",
					state: "streaming",
					text: "I need to inspect the pipeline.",
				},
			]),
		]);

		expect(grouped[0]?.items[0]).toMatchObject({
			kind: "reasoned",
			streaming: true,
			text: "I need to inspect the pipeline.",
		});
	});

	it("gives a tool call the same id across its streaming states", () => {
		const streaming = toTranscript([
			message([
				tool("get_linkedin_profile", {
					state: "input-available",
					toolCallId: "call_1",
				}),
			]),
		]);
		const settled = toTranscript([
			message([
				{ type: "text", text: "Checking." },
				tool("get_linkedin_profile", {
					state: "output-available",
					toolCallId: "call_1",
					output: { found: true },
				}),
			]),
		]);

		const before = streaming[0]?.items[0]?.id;
		const after = settled[0]?.items.find((item) => item.kind === "did")?.id;

		expect(after).toBe(before as string);
	});

	it("drops a message whose only text was empty", () => {
		expect(toTranscript([message([{ type: "text", text: "   " }])])).toEqual(
			[],
		);
	});

	it("marks a tool that has not returned as pending", () => {
		const grouped = toTranscript([
			message([tool("get_linkedin_profile", { state: "input-available" })]),
		]);

		expect(grouped[0]?.items[0]).toMatchObject({ kind: "did", pending: true });
	});

	it("keeps a tool name and structured output for dedicated result UI", () => {
		const grouped = toTranscript([
			message([
				tool("list_deals", {
					output: { deals: [] },
				}),
			]),
		]);

		expect(grouped[0]?.items[0]).toMatchObject({
			kind: "did",
			tool: "list_deals",
			output: { deals: [] },
		});
	});

	it("keeps an ask_question tool as a first-class follow-up", () => {
		const request = {
			requestId: "req_1",
			kind: "question",
			prompt: "Which account should I use?",
			options: [{ id: "primary", label: "Primary account" }],
		};
		const grouped = toTranscript([
			message([
				{
					type: "dynamic-tool",
					toolName: "ask_question",
					state: "approval-requested",
					toolMetadata: { eve: { inputRequest: request } },
				},
			]),
		]);

		expect(grouped[0]?.items[0]).toMatchObject({
			kind: "asked",
			question: { requestId: "req_1", prompt: "Which account should I use?" },
		});
	});
});

describe("deal list presentation", () => {
	const output = {
		asOf: "2026-08-06T01:14:05.025Z",
		criteria: {
			status: "open",
			inactiveForDays: 14,
			companyId: null,
			ownerId: null,
		},
		deals: [
			{
				id: "deal-1",
				name: "Notion — expansion",
				stage: "CONTRACT_SENT",
				amount: 14_000,
				currency: "USD",
				company: {
					id: "company-1",
					name: "Notion",
					domain: "notion.so",
					iconUrl: "https://cdn.example.test/notion.png",
					iconDarkUrl: null,
					iconTone: "opaque",
					logoUrl: "https://cdn.example.test/notion.svg",
				},
				owner: {
					id: "user-1",
					name: "Priya Raman",
					email: "priya@example.com",
					image: "https://cdn.example.test/priya.png",
				},
				daysSinceLastActivity: 201,
				neverActive: true,
				expectedCloseDate: "2026-09-03T19:50:06.111Z",
			},
		],
		hasMore: false,
	};

	it("parses structured list_deals output", () => {
		expect(dealListResultOf(output)).toMatchObject({
			criteria: { status: "open", inactiveForDays: 14 },
			deals: [
				{
					id: "deal-1",
					daysSinceLastActivity: 201,
					company: {
						iconUrl: "https://cdn.example.test/notion.png",
					},
					owner: { image: "https://cdn.example.test/priya.png" },
				},
			],
		});
		expect(dealListResultOf({ deals: [] })).toBeNull();
	});

	it("merges paginated deal results without duplicate rows", () => {
		const first = dealListResultOf({ ...output, hasMore: true });
		const second = dealListResultOf({
			...output,
			asOf: "2026-08-06T01:15:00.000Z",
			deals: [
				output.deals[0],
				{ ...output.deals[0], id: "deal-2", name: "Linear — Comp AI" },
			],
		});
		if (!first || !second) throw new Error("Expected valid deal list results");

		expect(mergeDealListResultPages([first, second])).toMatchObject([
			{
				asOf: "2026-08-06T01:15:00.000Z",
				hasMore: false,
				deals: [{ id: "deal-1" }, { id: "deal-2" }],
			},
		]);
	});

	it("keeps different deal query scopes in separate result groups", () => {
		const open = dealListResultOf(output);
		const company = dealListResultOf({
			...output,
			criteria: { ...output.criteria, companyId: "company-1" },
		});
		if (!open || !company) throw new Error("Expected valid deal list results");

		expect(mergeDealListResultPages([open, company])).toMatchObject([
			{ criteria: { companyId: null }, deals: [{ id: "deal-1" }] },
			{ criteria: { companyId: "company-1" }, deals: [{ id: "deal-1" }] },
		]);
	});

	it("removes model-authored Markdown tables while keeping its analysis", () => {
		const markdown = [
			"I found two stale deals.",
			"",
			"| Deal | Idle |",
			"|---|---|",
			"| Notion | 201 days |",
			"| Linear | 134 days |",
			"",
			"### What stands out",
			"Follow up on Notion first.",
		].join("\n");

		expect(splitMarkdownTable(markdown)).toEqual({
			before: "I found two stale deals.",
			after: "### What stands out\nFollow up on Notion first.",
			found: true,
		});
	});
});

describe("conversationTimeline", () => {
	it("renders each follow-up before the answer submitted for it", () => {
		const submissions = [
			{ id: "opening", createdAt: "2026-08-05T10:00:00.000Z" },
			{ id: "answer", createdAt: "2026-08-05T10:02:00.000Z" },
		];
		const messages = [
			message(
				[{ type: "text", text: "Which one?" }],
				"assistant",
				"a1",
				"turn-1",
			),
			message([{ type: "text", text: "Got it." }], "assistant", "a2", "turn-2"),
		];
		const events = [
			{
				type: "turn.started",
				data: { turnId: "turn-1" },
				meta: { id: "event-1", at: "2026-08-05T10:01:00.000Z" },
			},
			{
				type: "turn.started",
				data: { turnId: "turn-2" },
				meta: { id: "event-2", at: "2026-08-05T10:03:00.000Z" },
			},
		] as never;

		const timeline = conversationTimeline(submissions, events, messages);

		expect(timeline.map((item) => item.kind)).toEqual([
			"submission",
			"assistant",
			"submission",
			"assistant",
		]);
		expect(timeline.map((item) => item.id)).toEqual([
			"submission:opening",
			"assistant:a1",
			"submission:answer",
			"assistant:a2",
		]);
	});
});

describe("eventStreamSettled", () => {
	it("keeps fetching after a tool step until the terminal event arrives", () => {
		expect(
			eventStreamSettled([
				{ type: "message.completed" },
				{ type: "tool.completed" },
			]),
		).toBe(false);
		expect(
			eventStreamSettled([
				{ type: "message.completed" },
				{ type: "session.waiting" },
			]),
		).toBe(true);
	});
});

describe("describe", () => {
	it("says what happened in a rep's words, not the tool's", () => {
		expect(describeStep(tool("read_crm_history") as never)).toBe(
			"Read our emails and meetings with them",
		);
	});

	it("carries the reason a write did not happen", () => {
		const step = tool("set_contact_socials", {
			output: { written: false, reason: "the account is named somebody else" },
		});

		expect(describeStep(step as never)).toContain("named somebody else");
	});

	it("falls back to a readable form of an unknown tool", () => {
		expect(describeStep(tool("some_new_tool") as never)).toBe("Some new tool");
	});
});

describe("outcomeTone", () => {
	it("reads a write as success", () => {
		expect(
			outcomeTone(tool("record_fact", { output: { applied: true } }) as never),
		).toBe("success");
	});

	it("reads a refusal as a warning, because that is the interesting half", () => {
		expect(
			outcomeTone(tool("record_fact", { output: { stored: false } }) as never),
		).toBe("warning");
		expect(
			outcomeTone(tool("write_brief", { output: { written: false } }) as never),
		).toBe("warning");
	});

	it("reads a failed call as a warning", () => {
		expect(
			outcomeTone(tool("research_person", { state: "output-error" }) as never),
		).toBe("warning");
	});

	it("leaves a plain read neutral", () => {
		expect(
			outcomeTone(
				tool("read_crm_history", { output: { found: true } }) as never,
			),
		).toBe("neutral");
	});
});

describe("sourcesOf", () => {
	it("offers the page behind a step, labelled by host", () => {
		const sources = sourcesOf(
			tool("get_linkedin_profile", {
				output: { sourceUrl: "https://www.linkedin.com/in/someone" },
			}) as never,
		);

		expect(sources).toEqual([
			{
				url: "https://www.linkedin.com/in/someone",
				title: "linkedin.com",
				network: "linkedin",
			},
		]);
	});

	it("does not offer the same page twice", () => {
		const sources = sourcesOf(
			tool("set_contact_socials", {
				output: {
					url: "https://github.com/someone",
					sourceUrl: "https://github.com/someone",
				},
			}) as never,
		);

		expect(sources).toHaveLength(1);
		expect(sources[0]?.network).toBe("github");
	});

	it("ignores anything that is not a link", () => {
		const sources = sourcesOf(
			tool("record_fact", {
				output: { sourceUrl: "not-a-url", url: 42 },
			}) as never,
		);

		expect(sources).toEqual([]);
	});
});

describe("pendingQuestion", () => {
	const request = {
		requestId: "req_1",
		kind: "question",
		prompt: "Which one?",
		options: [{ id: "a", label: "The first" }],
	};

	it("finds a question the agent is parked on", () => {
		const found = pendingQuestion([
			message([
				{
					type: "dynamic-tool",
					toolName: "ask_question",
					state: "approval-requested",
					toolMetadata: { eve: { inputRequest: request } },
				},
			]),
		]);

		expect(found?.requestId).toBe("req_1");
	});

	it("ignores a question from an earlier message that has moved on", () => {
		const asked = message([
			{
				type: "dynamic-tool",
				toolName: "ask_question",
				state: "approval-requested",
				toolMetadata: { eve: { inputRequest: request } },
			},
		]);
		const answered = message([{ type: "text", text: "Thanks." }]);

		expect(pendingQuestion([asked, answered])).toBeNull();
	});

	it("ignores a question that already has a response", () => {
		expect(
			pendingQuestion([
				message([
					{
						type: "dynamic-tool",
						toolName: "ask_question",
						state: "approval-responded",
						toolMetadata: { eve: { inputRequest: request } },
					},
				]),
			]),
		).toBeNull();
	});

	it("finds nothing in an empty transcript", () => {
		expect(pendingQuestion([])).toBeNull();
	});
});

describe("latestTurnFailure", () => {
	it("recognizes the Vercel Gateway free-tier rate limit", () => {
		expect(
			latestTurnFailure([
				{
					type: "turn.failed",
					data: {
						code: "MODEL_CALL_FAILED",
						message:
							"GatewayRateLimitError: Free tier requests on this model are rate-limited.",
					},
				},
			]),
		).toEqual({ code: "MODEL_CALL_FAILED", kind: "rate-limit" });
	});

	it("does not keep an earlier failure after a later turn completes", () => {
		expect(
			latestTurnFailure([
				{ type: "turn.failed", data: { message: "Provider unavailable" } },
				{ type: "turn.completed", data: {} },
				{ type: "session.waiting", data: {} },
			]),
		).toBeNull();
	});

	it("clears an earlier failure when a retry starts", () => {
		expect(
			latestTurnFailure([
				{ type: "turn.failed", data: { message: "Provider unavailable" } },
				{ type: "turn.started", data: {} },
			]),
		).toBeNull();
	});

	it("recognizes a model restricted to paid Gateway credits", () => {
		expect(
			latestTurnFailure([
				{
					type: "session.failed",
					data: {
						code: "MODEL_CALL_FAILED",
						message: "Free tier users do not have access to this model.",
					},
				},
			]),
		).toEqual({ code: "MODEL_CALL_FAILED", kind: "restricted" });
	});

	it("keeps provider details out of the display contract", () => {
		expect(
			latestTurnFailure([
				{
					type: "session.failed",
					data: { message: "Internal provider stack and request body" },
				},
			]),
		).toEqual({ code: "AGENT_FAILED", kind: "unknown" });
	});
});

describe("resolveThread", () => {
	const rows = [
		{ id: "c2", title: "Thursday" },
		{ id: "c1", title: "Monday" },
	];

	it("lands on the most recent conversation when the URL says nothing", () => {
		const { current } = resolveThread({
			conversations: rows,
			fromUrl: null,
			landedOn: "c2",
		});

		expect(current?.title).toBe("Thursday");
	});

	it("opens the thread named in the URL, so a link is a conversation", () => {
		const { current } = resolveThread({
			conversations: rows,
			fromUrl: "c1",
			landedOn: "c2",
		});

		expect(current?.title).toBe("Monday");
	});

	it("shows nothing for a deliberately new thread", () => {
		const { openId, current } = resolveThread({
			conversations: rows,
			fromUrl: NEW_THREAD,
			landedOn: "c2",
		});

		expect(openId).toBe(NEW_THREAD);
		expect(current).toBeNull();
	});

	it("does not move the open thread when the list grows underneath it", () => {
		const before = resolveThread({
			conversations: rows,
			fromUrl: null,
			landedOn: "c2",
		});
		const after = resolveThread({
			conversations: [{ id: "c3", title: "Just now" }, ...rows],
			fromUrl: null,
			landedOn: "c2",
		});

		expect(after.openId).toBe(before.openId);
		expect(after.current?.title).toBe("Thursday");
	});

	it("holds its place while the list is still loading", () => {
		const { openId, current } = resolveThread({
			conversations: [],
			fromUrl: null,
			landedOn: null,
		});

		expect(openId).toBeNull();
		expect(current).toBeNull();
	});

	it("survives a thread that has been deleted from under it", () => {
		const { openId, current } = resolveThread({
			conversations: rows,
			fromUrl: "gone",
			landedOn: "c2",
		});

		expect(openId).toBe("gone");
		expect(current).toBeNull();
	});
});

describe("every tool has a line of English", () => {
	const BUILT_INS = [
		"load_skill",
		"web_search",
		"web_fetch",
		"todo",
		"ask_question",
		"agent",
		"connection_search",
		"bash",
		"read_file",
		"write_file",
		"glob",
		"grep",
	];

	const authored = readdirSync(
		new URL("../../agent/agent/tools", import.meta.url),
	)
		.filter((file) => file.endsWith(".ts"))
		.map((file) => file.replace(/\.ts$/, ""));

	it("covers every tool the agent ships with", () => {
		expect(authored.length).toBeGreaterThan(0);

		for (const tool of [...authored, ...BUILT_INS]) {
			expect(TOOL_VERBS[tool]).toBeString();
		}
	});

	it("writes them as sentences, not as slugs", () => {
		for (const [tool, verb] of Object.entries(TOOL_VERBS)) {
			expect(verb, tool).not.toContain("_");
			expect(verb[0], tool).toBe(verb[0]?.toUpperCase() ?? "");
		}
	});
});

describe("tool call details", () => {
	it("keeps the tool input so the label can describe the work", () => {
		const [row] = toTranscript([
			message([
				tool("write_agent_file", {
					input: { path: "agent/manifest.json" },
					output: {},
				}),
			]),
		]);

		expect(row?.items[0]).toMatchObject({
			kind: "did",
			input: { path: "agent/manifest.json" },
		});
	});

	it("surfaces the failure text instead of dropping it", () => {
		const [row] = toTranscript([
			message([
				tool("write_agent_file", {
					state: "output-error",
					errorText: "Draft is closed.",
				}),
			]),
		]);

		expect(row?.items[0]).toMatchObject({
			kind: "did",
			errorText: "Draft is closed.",
		});
	});

	it("leaves errorText null when the call succeeded", () => {
		const [row] = toTranscript([
			message([tool("write_agent_file", { output: {} })]),
		]);

		expect(row?.items[0]).toMatchObject({ kind: "did", errorText: null });
	});

	it("keeps text, tools and text in the order they happened", () => {
		const [row] = toTranscript([
			message([
				{ type: "text", text: "Looking." },
				tool("write_agent_file", { input: { path: "a" }, output: {} }),
				{ type: "text", text: "Done." },
			]),
		]);

		expect(row?.items.map((item) => item.kind)).toEqual([
			"said",
			"did",
			"said",
		]);
	});
});
