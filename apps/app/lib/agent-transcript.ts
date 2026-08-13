import type { MessageStreamEvent } from "eve/client";
import {
	defaultMessageReducer,
	type EveMessage,
	type EveMessageInputRequest,
	type EveMessagePart,
} from "eve/react";

export type TranscriptItem =
	| { kind: "said"; id: string; mine: boolean; text: string }
	| {
			kind: "attached";
			id: string;
			mine: boolean;
			url: string | null;
			mediaType: string;
			filename: string | null;
	  }
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
			input: Record<string, unknown> | null;
			output: unknown;
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

type AgentStreamEvent = {
	type: string;
	data?: unknown;
};

const VERBS: Record<string, string> = {
	list_segments: "Listed the marketing segments",
	read_segment: "Read a segment's rules",
	preview_segment: "Counted who those rules match",
	write_segment: "Saved the segment",
	list_templates: "Listed the email templates",
	read_template: "Read an email template",
	read_shell: "Read the header and footer",
	write_shell: "Rewrote the header or footer",
	write_template: "Wrote the email",
	create_campaign: "Created a campaign as a draft",
	read_campaign: "Read the campaign and how each touch is doing",
	write_campaign_graph: "Built the campaign's flow",
	update_node: "Changed one step in the campaign",
	schedule_campaign: "Staged the campaign for you to approve",
	review_email: "Looked at the email as a reader would",
	send_email: "Sent the email",
	enrol_contact: "Put them into the campaign",
	campaign_stats: "Checked how the campaign is delivering",
	read_engagement: "Read what marketing email they have had",
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
		const turnId = stringOf(
			recordOf("data" in event ? event.data : undefined).turnId,
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
				turnTimes.get(stringOf(recordOf(message.metadata).turnId) ?? "") ??
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

				if (part.type === "file") {
					return [
						{
							kind: "attached",
							id,
							mine: message.role === "user",
							url: part.url ?? null,
							mediaType: part.mediaType,
							filename: part.filename ?? null,
						},
					];
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
	const callId =
		"toolCallId" in part && typeof part.toolCallId === "string"
			? part.toolCallId
			: null;

	return callId ? `${messageId}:${callId}` : `${messageId}:${index}`;
}

export function toolName(part: EveMessagePart): string {
	if (part.type === "dynamic-tool" && "toolName" in part) {
		return String(part.toolName);
	}
	return part.type.replace(/^tool-/, "");
}

export const TOOL_VERBS = VERBS;

export function describe(part: EveMessagePart): string {
	const tool = toolName(part);
	const verb = VERBS[tool] ?? humanise(tool);
	const reason = output(part)?.reason;

	return typeof reason === "string" ? `${verb} — ${reason}` : verb;
}

export function outcomeTone(part: EveMessagePart): Tone {
	if ("state" in part && part.state === "output-error") return "warning";

	const result = output(part);
	if (!result) return "neutral";

	if (result.applied === true || result.written === true) return "success";
	if (result.stored === false || result.written === false) return "warning";

	return "neutral";
}

export function sourcesOf(part: EveMessagePart): Source[] {
	const result = output(part);
	if (!result) return [];

	const urls = new Set<string>();
	for (const key of ["sourceUrl", "profileUrl", "url"]) {
		const value = result[key];
		if (typeof value === "string" && /^https?:\/\//.test(value)) {
			urls.add(value);
		}
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
	events: readonly AgentStreamEvent[],
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

		const data = recordOf(event.data);
		const message = typeof data.message === "string" ? data.message : "";
		const code = typeof data.code === "string" ? data.code : "AGENT_FAILED";

		return {
			code,
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

function output(part: EveMessagePart): Record<string, unknown> | null {
	return "output" in part && part.output && typeof part.output === "object"
		? (part.output as Record<string, unknown>)
		: null;
}

function input(part: EveMessagePart): Record<string, unknown> | null {
	return "input" in part && part.input && typeof part.input === "object"
		? (part.input as Record<string, unknown>)
		: null;
}

function errorTextOf(part: EveMessagePart): string | null {
	if (!("errorText" in part)) return null;
	const text = part.errorText;
	return typeof text === "string" && text.trim() ? text : null;
}

function recordOf(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function stringOf(value: unknown): string | null {
	return typeof value === "string" && value ? value : null;
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

export function dealListResultOf(value: unknown): DealListResult | null {
	const result = recordOf(value);
	const asOf = stringOf(result.asOf);
	const criteria = recordOf(result.criteria);
	const status = stringOf(criteria.status);
	const inactiveForDays = nullableNumberOf(criteria.inactiveForDays);
	const companyId = nullableStringOf(criteria.companyId);
	const ownerId = nullableStringOf(criteria.ownerId);
	const rows = Array.isArray(result.deals) ? result.deals : null;

	if (
		!asOf ||
		!status ||
		inactiveForDays === undefined ||
		companyId === undefined ||
		ownerId === undefined ||
		!rows
	)
		return null;

	const deals = rows.map(dealListItemOf);
	if (deals.some((deal) => deal === null)) return null;

	return {
		asOf,
		criteria: { status, inactiveForDays, companyId, ownerId },
		deals: deals as DealListItem[],
		hasMore: result.hasMore === true,
	};
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

export function splitMarkdownTable(markdown: string): {
	after: string;
	before: string;
	found: boolean;
} {
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

function dealListItemOf(value: unknown): DealListItem | null {
	const deal = recordOf(value);
	const company = recordOf(deal.company);
	const owner = deal.owner === null ? null : recordOf(deal.owner);
	const id = stringOf(deal.id);
	const name = stringOf(deal.name);
	const stage = stringOf(deal.stage);
	const currency = stringOf(deal.currency);
	const companyId = stringOf(company.id);
	const companyName = stringOf(company.name);
	const daysSinceLastActivity = numberOf(deal.daysSinceLastActivity);
	const amount = nullableNumberOf(deal.amount);
	const expectedCloseDate = nullableStringOf(deal.expectedCloseDate);

	if (
		!id ||
		!name ||
		!stage ||
		!currency ||
		!companyId ||
		!companyName ||
		daysSinceLastActivity === null ||
		amount === undefined ||
		expectedCloseDate === undefined
	) {
		return null;
	}

	const parsedOwner = owner
		? {
				id: stringOf(owner.id),
				name: stringOf(owner.name),
				email: stringOf(owner.email),
				image: nullableStringOf(owner.image) ?? null,
			}
		: null;
	if (
		parsedOwner &&
		(!parsedOwner.id || !parsedOwner.name || !parsedOwner.email)
	) {
		return null;
	}

	return {
		id,
		name,
		stage,
		amount,
		currency,
		company: {
			id: companyId,
			name: companyName,
			domain: nullableStringOf(company.domain) ?? null,
			iconUrl: nullableStringOf(company.iconUrl) ?? null,
			iconDarkUrl: nullableStringOf(company.iconDarkUrl) ?? null,
			iconTone: nullableStringOf(company.iconTone) ?? null,
			logoUrl: nullableStringOf(company.logoUrl) ?? null,
		},
		owner: parsedOwner as DealListItem["owner"],
		daysSinceLastActivity,
		neverActive: deal.neverActive === true,
		expectedCloseDate,
	};
}

function numberOf(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableNumberOf(value: unknown): number | null | undefined {
	return value === null ? null : (numberOf(value) ?? undefined);
}

function nullableStringOf(value: unknown): string | null | undefined {
	return value === null ? null : (stringOf(value) ?? undefined);
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

export function resolveThread<T extends { id: string }>({
	conversations,
	fromUrl,
	landedOn,
}: {
	conversations: readonly T[];
	fromUrl: string | null;
	landedOn: string | null;
}): { openId: string | null; current: T | null } {
	const openId = fromUrl ?? landedOn;

	if (!openId || openId === NEW_THREAD) return { openId, current: null };

	return {
		openId,
		current: conversations.find((row) => row.id === openId) ?? null,
	};
}
