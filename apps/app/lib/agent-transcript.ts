import type { EveMessage, EveMessagePart } from "eve/react";

export type TranscriptItem =
	| { kind: "said"; id: string; mine: boolean; text: string }
	| {
			kind: "did";
			id: string;
			label: string;
			tone: Tone;
			pending: boolean;
			sources: Source[];
	  };

export type Tone = "neutral" | "success" | "warning";

export type Source = {
	url: string;
	title: string;
	network: "linkedin" | "github" | "web";
};

const VERBS: Record<string, string> = {
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

export function toTranscript(
	messages: readonly EveMessage[],
): TranscriptMessage[] {
	return messages
		.map((message) => ({
			id: message.id,
			mine: message.role === "user",
			items: message.parts.flatMap((part, index): TranscriptItem[] => {
				const id = partId(message.id, part, index);

				if (part.type === "text") {
					const text = part.text.trim();
					if (!text) return [];
					return [{ kind: "said", id, mine: message.role === "user", text }];
				}

				if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
					const state = "state" in part ? part.state : undefined;

					return [
						{
							kind: "did",
							id,
							label: describe(part),
							tone: outcomeTone(part),
							pending:
								state === "input-streaming" || state === "input-available",
							sources: sourcesOf(part),
						},
					];
				}

				return [];
			}),
		}))
		.filter((message) => message.items.length > 0);
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
		if (part.type !== "dynamic-tool") continue;

		const request = part.toolMetadata?.eve?.inputRequest;
		if (request) return request;
	}

	return null;
}

function output(part: EveMessagePart): Record<string, unknown> | null {
	return "output" in part && part.output && typeof part.output === "object"
		? (part.output as Record<string, unknown>)
		: null;
}

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
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
