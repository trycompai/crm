import {
	type EveStreamEvent,
	eveTurnFailure,
	eveTurnReference,
} from "@crm/validation/eve-stream";
import {
	type EveToolInput,
	type EveToolOutcome,
	type EveToolOutput,
	eveToolInput,
	eveToolOutcome,
	eveToolOutput,
} from "@crm/validation/eve-tool";
import type { MessageStreamEvent } from "eve/client";
import {
	defaultMessageReducer,
	type EveMessage,
	type EveMessageInputRequest,
	type EveMessagePart,
} from "eve/react";
import { z } from "zod";

export type TranscriptItem =
	| { kind: "said"; id: string; mine: boolean; text: string }
	| { kind: "reasoned"; id: string; streaming: boolean; text: string }
	| {
			kind: "asked";
			id: string;
			question: EveMessageInputRequest;
	  }
	| {
			kind: "did";
			id: string;
			label: string;
			input: EveToolInput;
			output: EveToolOutput;
			tone: Tone;
			pending: boolean;
			sources: Source[];
			tool: string;
			errorText: string | null;
	  };

export type Tone = "neutral" | "success" | "warning";

export type Source = {
	url: string;
	title: string;
	network: "linkedin" | "github" | "web";
};

export type AgentTurnFailure = {
	code: string;
	kind: "rate-limit" | "restricted" | "credits" | "unknown";
};

type ToolVerbs = Record<string, string>;

const VERBS: ToolVerbs = {
	read_crm_history: "Read our emails and meetings with them",
	read_company_history: "Read everything we have on the company",
	read_deal_history: "Read the deal and where it has been",
	search_crm: "Looked the record up in the CRM",
	resolve_linkedin_profile: "Searched for their LinkedIn profile",
	get_linkedin_profile: "Read a LinkedIn profile",
	get_contact_work_history: "Read their work history",
	fetch_contact_photo: "Fetched their profile picture",
	find_contact_socials: "Searched for their other profiles",
	set_contact_socials: "Checked a profile against the account itself",
	identify_contact: "Put a name to the address",
	record_fact: "Recorded what it found",
	write_brief: "Wrote the background",
	write_workspace_profile: "Wrote up who we are",
	research_person: "Researched them on the web",
	research_company: "Read the company's site",
	enrich_company: "Looked up the company",
	schedule_recheck: "Decided when to look again",
	record_job_change: "Raised a job change",
	list_deals: "Reviewed the deal pipeline",
	open_slack_channel: "Opened a Slack channel",
	invite_to_slack_channel: "Invited people to the Slack channel",
	list_outstanding_work: "Looked for outstanding work",
	set_chat_title: "Named this chat",
	list_fields: "Read what this workspace tracks",
	set_field_value: "Filled in a custom field",
	manage_fields: "Changed what the CRM tracks",
	archive_field: "Asked to retire a field",

	load_skill: "Read its instructions for this",
	web_search: "Searched the web",
	web_fetch: "Read a web page",
	todo: "Updated its plan",
	ask_question: "Asked a question",
	agent: "Handed part of the job to a helper",
	connection_search: "Looked for a tool it could use",
	bash: "Ran a command",
	read_file: "Read a file",
	write_file: "Wrote a file",
	glob: "Looked for files",
	grep: "Searched inside the files",
};

function humanise(tool: string): string {
	const words = tool.replace(/_/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}

export type TranscriptMessage = {
	id: string;
	mine: boolean;
	items: TranscriptItem[];
};

export type ConversationTimelineItem<
	TSubmission extends { id: string; createdAt: string },
> =
	| { kind: "submission"; id: string; submission: TSubmission }
	| { kind: "assistant"; id: string; message: EveMessage };

export function messagesFromEvents(
	events: readonly MessageStreamEvent[],
): readonly EveMessage[] {
	const reducer = defaultMessageReducer();
	let data = reducer.initial();

	for (const event of events) data = reducer.reduce(data, event);

	return data.messages;
}

const SETTLED_EVENT_TYPES = new Set([
	"input.requested",
	"session.completed",
	"session.failed",
	"session.waiting",
	"turn.cancelled",
]);

export function eventStreamSettled(
	events: readonly { type: string }[],
): boolean {
	const last = events.at(-1);
	return Boolean(last && SETTLED_EVENT_TYPES.has(last.type));
}

export function conversationTimeline<
	TSubmission extends { id: string; createdAt: string },
>(
	submissions: readonly TSubmission[],
	events: readonly MessageStreamEvent[],
	messages: readonly EveMessage[],
): ConversationTimelineItem<TSubmission>[] {
	const turnTimes = new Map<string, number>();

	for (const event of events) {
		const { turnId } = eveTurnReference.parse(
			"data" in event ? event.data : undefined,
		);
		if (!turnId || turnTimes.has(turnId)) continue;
		turnTimes.set(turnId, timestampOf(event.meta.at));
	}

	const assistantRows: Array<{
		kind: "assistant";
		id: string;
		message: EveMessage;
		at: number;
		index: number;
	}> = [];
	for (const [index, message] of messages.entries()) {
		if (message.role !== "assistant") continue;
		assistantRows.push({
			kind: "assistant",
			id: `assistant:${message.id}`,
			message,
			at:
				turnTimes.get(message.metadata?.turnId ?? "") ??
				Number.POSITIVE_INFINITY,
			index,
		});
	}

	const rows = [
		...submissions.map((submission, index) => ({
			kind: "submission" as const,
			id: `submission:${submission.id}`,
			submission,
			at: timestampOf(submission.createdAt),
			index,
		})),
		...assistantRows,
	];

	rows.sort((a, b) =>
		a.at !== b.at
			? a.at - b.at
			: a.kind === b.kind
				? a.index - b.index
				: a.kind === "submission"
					? -1
					: 1,
	);

	return rows.map((row) =>
		row.kind === "submission"
			? { kind: row.kind, id: row.id, submission: row.submission }
			: { kind: row.kind, id: row.id, message: row.message },
	);
}

export function toTranscript(
	messages: readonly EveMessage[],
): TranscriptMessage[] {
	const transcript: TranscriptMessage[] = [];
	for (const message of messages) {
		const row = {
			id: message.id,
			mine: message.role === "user",
			items: message.parts.flatMap((part, index): TranscriptItem[] => {
				const id = partId(message.id, part, index);

				if (part.type === "text") {
					const text = part.text.trim();
					if (!text) return [];
					return [{ kind: "said", id, mine: message.role === "user", text }];
				}

				if (part.type === "reasoning") {
					const text = part.text.trim();
					if (!text) return [];
					return [
						{
							kind: "reasoned",
							id,
							streaming: part.state === "streaming",
							text,
						},
					];
				}

				if (part.type === "dynamic-tool") {
					const request = part.toolMetadata?.eve?.inputRequest;
					if (request?.kind === "question") {
						return [{ kind: "asked", id, question: request }];
					}
				}

				if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
					const state = "state" in part ? part.state : undefined;
					const tool = toolName(part);

					return [
						{
							kind: "did",
							id,
							label: describe(part),
							input: input(part),
							output: output(part),
							errorText: errorTextOf(part),
							tone: outcomeTone(part),
							pending:
								state === "input-streaming" ||
								state === "input-available" ||
								state === "approval-requested",
							sources: sourcesOf(part),
							tool,
						},
					];
				}

				return [];
			}),
		};
		if (row.items.length > 0) transcript.push(row);
	}
	return transcript;
}

function partId(
	messageId: string,
	part: EveMessagePart,
	index: number,
): string {
	const callId = "toolCallId" in part ? part.toolCallId : null;

	return callId ? `${messageId}:${callId}` : `${messageId}:${index}`;
}

export function toolName(part: EveMessagePart): string {
	if (part.type === "dynamic-tool") return part.toolName;
	return part.type.replace(/^tool-/, "");
}

export const TOOL_VERBS = VERBS;

export function describe(part: EveMessagePart): string {
	const tool = toolName(part);
	const verb = VERBS[tool] ?? humanise(tool);
	const reason = outcome(part)?.reason ?? null;

	return reason === null ? verb : `${verb} — ${reason}`;
}

export function outcomeTone(part: EveMessagePart): Tone {
	if ("state" in part && part.state === "output-error") return "warning";

	const result = outcome(part);
	if (!result) return "neutral";

	if (result.applied === true || result.written === true) return "success";
	if (result.stored === false || result.written === false) return "warning";

	return "neutral";
}

export function sourcesOf(part: EveMessagePart): Source[] {
	const result = outcome(part);
	if (!result) return [];

	const urls = new Set<string>();
	for (const link of [result.sourceUrl, result.profileUrl, result.url]) {
		if (link !== null) urls.add(link);
	}

	return [...urls].map((url) => {
		const title = hostOf(url);
		return {
			url,
			title,
			network: title.includes("linkedin")
				? ("linkedin" as const)
				: title.includes("github")
					? ("github" as const)
					: ("web" as const),
		};
	});
}

export function pendingQuestion(messages: readonly EveMessage[]) {
	for (const part of messages.at(-1)?.parts ?? []) {
		if (part.type !== "dynamic-tool" || part.state !== "approval-requested") {
			continue;
		}

		const request = part.toolMetadata?.eve?.inputRequest;
		if (request?.kind === "question") return request;
	}

	return null;
}

export function latestTurnFailure(
	events: readonly EveStreamEvent[],
): AgentTurnFailure | null {
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (!event) continue;
		if (event.type === "turn.completed" || event.type === "turn.started") {
			return null;
		}
		if (event.type !== "turn.failed" && event.type !== "session.failed") {
			continue;
		}

		const failure = eveTurnFailure.parse(event.data);
		const message = failure.message ?? "";

		return {
			code: failure.code ?? "AGENT_FAILED",
			kind: /free tier users do not have access|RestrictedModelsError/i.test(
				message,
			)
				? "restricted"
				: /GatewayRateLimitError|free tier requests.*rate-?limited/i.test(
							message,
						)
					? "rate-limit"
					: /credits?|quota|billing|usage limit/i.test(message)
						? "credits"
						: "unknown",
		};
	}

	return null;
}

function payloadOf(part: EveMessagePart) {
	return "output" in part ? part.output : undefined;
}

function output(part: EveMessagePart): EveToolOutput {
	return eveToolOutput.parse(payloadOf(part));
}

function outcome(part: EveMessagePart): EveToolOutcome {
	return eveToolOutcome.parse(payloadOf(part));
}

function input(part: EveMessagePart): EveToolInput {
	return eveToolInput.parse("input" in part ? part.input : undefined);
}

function errorTextOf(part: EveMessagePart): string | null {
	const text = "errorText" in part ? part.errorText : undefined;
	return text?.trim() ? text : null;
}

function timestampOf(value: string): number {
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

export type DealListItem = {
	id: string;
	name: string;
	stage: string;
	amount: number | null;
	currency: string;
	company: {
		id: string;
		name: string;
		domain: string | null;
		iconUrl: string | null;
		iconDarkUrl: string | null;
		iconTone: string | null;
		logoUrl: string | null;
	};
	owner: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	} | null;
	daysSinceLastActivity: number;
	neverActive: boolean;
	expectedCloseDate: string | null;
};

export type DealListResult = {
	asOf: string;
	criteria: {
		status: string;
		inactiveForDays: number | null;
		companyId: string | null;
		ownerId: string | null;
	};
	deals: DealListItem[];
	hasMore: boolean;
};

const requiredText = z.string().min(1);

const finiteNumber = z.number().refine((value) => Number.isFinite(value));

const optionalText = z.string().min(1).nullable().catch(null);

const dealListItem = z.object({
	id: requiredText,
	name: requiredText,
	stage: requiredText,
	amount: finiteNumber.nullable(),
	currency: requiredText,
	company: z.object({
		id: requiredText,
		name: requiredText,
		domain: optionalText,
		iconUrl: optionalText,
		iconDarkUrl: optionalText,
		iconTone: optionalText,
		logoUrl: optionalText,
	}),
	owner: z
		.object({
			id: requiredText,
			name: requiredText,
			email: requiredText,
			image: optionalText,
		})
		.nullable(),
	daysSinceLastActivity: finiteNumber,
	neverActive: z.boolean().catch(false),
	expectedCloseDate: requiredText.nullable(),
});

const dealListResult = z
	.object({
		asOf: requiredText,
		criteria: z.object({
			status: requiredText,
			inactiveForDays: finiteNumber.nullable(),
			companyId: requiredText.nullable(),
			ownerId: requiredText.nullable(),
		}),
		deals: z.array(dealListItem),
		hasMore: z.boolean().catch(false),
	})
	.nullable()
	.catch(null);

export function dealListResultOf(value: EveToolOutput): DealListResult | null {
	return dealListResult.parse(value);
}

export function groupDealListPages(
	pages: readonly { itemId: string; value: DealListResult }[],
): { itemId: string; value: DealListResult }[] {
	const groups = new Map<
		string,
		{ itemId: string; value: DealListResult; order: number }
	>();

	for (const [index, page] of pages.entries()) {
		const key = JSON.stringify(page.value.criteria);
		const previous = groups.get(key);
		const [merged] = mergeDealListResultPages(
			previous ? [previous.value, page.value] : [page.value],
		);
		if (!merged) continue;

		groups.set(key, {
			itemId: page.itemId,
			value: merged,
			order: previous?.order ?? index,
		});
	}

	return [...groups.values()]
		.sort((left, right) => left.order - right.order)
		.map(({ itemId, value }) => ({ itemId, value }));
}

export function mergeDealListResultPages(
	results: readonly DealListResult[],
): DealListResult[] {
	const groups = new Map<string, DealListResult>();
	for (const result of results) {
		const key = JSON.stringify(result.criteria);
		const previous = groups.get(key);
		const deals = new Map(
			previous?.deals.map((deal) => [deal.id, deal] as const),
		);
		for (const deal of result.deals) deals.set(deal.id, deal);

		groups.set(key, {
			...result,
			deals: [...deals.values()],
		});
	}

	return [...groups.values()];
}

function stripMarkdownTables(markdown: string): string {
	const lines = markdown.split("\n");
	const kept: string[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const separator = lines[index + 1] ?? "";

		if (line.includes("|") && isMarkdownTableSeparator(separator)) {
			index += 1;
			while (index + 1 < lines.length) {
				const nextLine = lines[index + 1];
				if (nextLine === undefined || !isMarkdownTableRow(nextLine)) break;
				index += 1;
			}
			if (kept.at(-1) !== "") kept.push("");
			continue;
		}

		kept.push(line);
	}

	return kept
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export type MarkdownTableSplit = {
	after: string;
	before: string;
	found: boolean;
};

export function splitMarkdownTable(markdown: string): MarkdownTableSplit {
	const lines = markdown.split("\n");

	for (let index = 0; index < lines.length - 1; index += 1) {
		const line = lines[index] ?? "";
		const separator = lines[index + 1] ?? "";
		if (!line.includes("|") || !isMarkdownTableSeparator(separator)) continue;

		let end = index + 2;
		while (end < lines.length) {
			const row = lines[end];
			if (row === undefined || !isMarkdownTableRow(row)) break;
			end += 1;
		}

		return {
			before: normaliseMarkdown(lines.slice(0, index).join("\n")),
			after: stripMarkdownTables(lines.slice(end).join("\n")),
			found: true,
		};
	}

	return { before: "", after: normaliseMarkdown(markdown), found: false };
}

function isMarkdownTableSeparator(line: string): boolean {
	return /^\s*\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|?\s*$/.test(line);
}

function isMarkdownTableRow(line: string): boolean {
	const trimmed = line.trim();
	return trimmed.includes("|") && !isMarkdownTableSeparator(trimmed);
}

function normaliseMarkdown(markdown: string): string {
	return markdown.replace(/\n{3,}/g, "\n\n").trim();
}

export const NEW_THREAD = "new";

export type ResolvedThread<T> = {
	openId: string | null;
	current: T | null;
};

export function resolveThread<T extends { id: string }>({
	conversations,
	fromUrl,
	landedOn,
}: {
	conversations: readonly T[];
	fromUrl: string | null;
	landedOn: string | null;
}): ResolvedThread<T> {
	const openId = fromUrl ?? landedOn;

	if (!openId || openId === NEW_THREAD) return { openId, current: null };

	return {
		openId,
		current: conversations.find((row) => row.id === openId) ?? null,
	};
}
