import { db, FactBand } from "@crm/db";
import { z } from "zod";
import { emailTitleEvidence } from "./email-title";

export type EvidenceKind =
	| "profile.email-match"
	| "linkedin.employer-and-name"
	| "crm.thread-reply"
	| "crm.signature-block"
	| "github.account-identity"
	| "crm.meeting-attendance"
	| "web.cited-claim"
	| "handle.name-form"
	| "search.cites-profile"
	| "employer-only"
	| "contradiction";

type Weighting = {
	weight: number;
	primary: boolean;
	label: string;
};

export const WEIGHTS = {
	"profile.email-match": {
		weight: 0.95,
		primary: true,
		label: "their email address is on the profile",
	},
	"linkedin.employer-and-name": {
		weight: 0.85,
		primary: true,
		label: "LinkedIn: employer and name both match",
	},
	"crm.thread-reply": {
		weight: 0.85,
		primary: true,
		label: "they replied on a thread we have",
	},
	"crm.signature-block": {
		weight: 0.8,
		primary: true,
		label: "their own email signature says so",
	},
	"github.account-identity": {
		weight: 0.8,
		primary: true,
		label: "the GitHub account names them or their employer",
	},
	"crm.meeting-attendance": {
		weight: 0.7,
		primary: true,
		label: "they accepted a past meeting on our calendar",
	},
	"web.cited-claim": {
		weight: 0.4,
		primary: false,
		label: "a cited web source states it",
	},
	"handle.name-form": {
		weight: 0.35,
		primary: false,
		label: "the handle is a form of their name",
	},
	"search.cites-profile": {
		weight: 0.35,
		primary: false,
		label: "a search for them cites this profile",
	},
	"employer-only": {
		weight: 0.2,
		primary: false,
		label: "the employer matches, the name does not",
	},
	contradiction: {
		weight: 0,
		primary: false,
		label: "another source disagrees",
	},
} satisfies Record<EvidenceKind, Weighting>;

export const evidenceInput = z.object({
	kind: z
		.enum(Object.keys(WEIGHTS) as [EvidenceKind, ...EvidenceKind[]])
		.describe("What you observed. Use contradiction when sources disagree."),
	detail: z.string().describe("What the source actually said."),
	sourceId: z
		.string()
		.optional()
		.describe(
			"For CRM email or meeting evidence, copy the message id or meeting id from read_crm_history. Reuse the message id for a reply and its signature.",
		),
	sourceUrl: z.string().optional(),
});

export type Evidence = z.infer<typeof evidenceInput>;

export type Scored = {
	score: number;
	band: FactBand | null;
	hasPrimary: boolean;
	rationale: string;
	evidence: Evidence[];
};

type EvidenceSources = {
	email: ReadonlySet<string>;
	meeting: ReadonlySet<string>;
};

const NO_SOURCES: EvidenceSources = { email: new Set(), meeting: new Set() };

const CEILING = 0.99;

const CONTRADICTED = 0.45;

export const BAND_FLOOR = { VERIFIED: 0.85, PROBABLE: 0.55, POSSIBLE: 0.3 };

export function isPastMeeting(
	meeting: { startsAt: Date; endsAt: Date; status: string },
	now: Date,
): boolean {
	return (
		meeting.status !== "cancelled" &&
		meeting.startsAt <= now &&
		meeting.endsAt <= now
	);
}

function isEmailEvidence(kind: EvidenceKind): boolean {
	return kind === "crm.thread-reply" || kind === "crm.signature-block";
}

export async function scoreContactEvidence(
	contactId: string,
	evidence: Evidence[],
	title?: string,
): Promise<Scored> {
	const emailIds = new Set<string>();
	const meetingIds = new Set<string>();
	for (const { kind, sourceId } of evidence) {
		if (!sourceId) continue;
		if (isEmailEvidence(kind)) emailIds.add(sourceId);
		if (kind === "crm.meeting-attendance") meetingIds.add(sourceId);
	}

	const [messages, meetings] = await Promise.all([
		emailIds.size
			? db.emailMessage.findMany({
					where: {
						id: { in: [...emailIds] },
						direction: "INBOUND",
						thread: { contactId },
					},
					select: {
						id: true,
						threadId: true,
						fromEmail: true,
						fromName: title !== undefined,
						body: title !== undefined,
						thread: { select: { contact: { select: { email: true } } } },
					},
				})
			: [],
		meetingIds.size
			? db.calendarEvent.findMany({
					where: {
						id: { in: [...meetingIds] },
						attendees: { some: { contactId, responseStatus: "accepted" } },
					},
					select: { id: true, startsAt: true, endsAt: true, status: true },
				})
			: [],
	]);

	const validMessages = messages.filter(
		(message) =>
			message.fromEmail.toLowerCase() ===
			message.thread.contact?.email?.toLowerCase(),
	);
	const observations =
		title === undefined
			? evidence
			: await groundTitle(contactId, evidence, validMessages, title);
	const email = new Set(
		title === undefined
			? validMessages.map(({ id }) => id)
			: observations.flatMap(({ kind, sourceId }) =>
					isEmailEvidence(kind) && sourceId ? [sourceId] : [],
				),
	);
	const now = new Date();
	return scoreEvidence(observations, {
		email,
		meeting: new Set(
			meetings
				.filter((meeting) => isPastMeeting(meeting, now))
				.map(({ id }) => id),
		),
	});
}

async function groundTitle(
	contactId: string,
	evidence: Evidence[],
	messages: {
		id: string;
		threadId: string;
		fromEmail: string;
		body: string | null;
		fromName: string | null;
	}[],
	title: string,
): Promise<Evidence[]> {
	const claims = new Map(
		messages.map((message) => [message.id, emailTitleEvidence(message, title)]),
	);

	const grounded = evidence.flatMap((item): Evidence[] => {
		if (!isEmailEvidence(item.kind)) return [item];
		const proof = claims.get(item.sourceId ?? "");
		if (!proof) return [];
		if (proof.reply) {
			return [{ ...item, kind: "crm.thread-reply", detail: proof.reply }];
		}
		return proof.signature
			? [{ ...item, kind: "crm.signature-block", detail: proof.signature }]
			: [];
	});

	const senderEmail = messages[0]?.fromEmail.toLowerCase();
	if (senderEmail === undefined) return grounded;

	const siblings = await db.emailMessage.findMany({
		where: {
			id: { notIn: messages.map(({ id }) => id) },
			direction: "INBOUND",
			threadId: { in: [...new Set(messages.map(({ threadId }) => threadId))] },
			thread: { contactId },
			body: { not: null },
		},
		select: { id: true, body: true, fromEmail: true, fromName: true },
		orderBy: [{ sentAt: "asc" }, { id: "asc" }],
	});
	for (const sibling of siblings) {
		if (sibling.fromEmail.toLowerCase() !== senderEmail) continue;

		const { reply } = emailTitleEvidence(sibling, title);
		if (reply) {
			grounded.push({
				kind: "crm.thread-reply",
				sourceId: sibling.id,
				detail: reply,
			});
		}
	}
	return grounded;
}

function strongestPerSource(
	evidence: Evidence[],
	sources: EvidenceSources,
): Evidence[] {
	const counted = new Map<string | number, Evidence>();
	for (const [index, item] of evidence.entries()) {
		const { kind, sourceId } = item;
		let key: string | number = index;
		if (isEmailEvidence(kind)) {
			if (sourceId ? !sources.email.has(sourceId) : sources.email.size > 0) {
				continue;
			}
			key = `email:${sourceId ?? ""}`;
		} else if (kind === "crm.meeting-attendance") {
			if (!sourceId || !sources.meeting.has(sourceId)) continue;
			key = `meeting:${sourceId}`;
		}
		const previous = counted.get(key);
		if (!previous || WEIGHTS[kind].weight > WEIGHTS[previous.kind].weight) {
			counted.set(key, item);
		}
	}
	return [...counted.values()];
}

export function scoreEvidence(
	observations: Evidence[],
	sources: EvidenceSources = NO_SOURCES,
): Scored {
	const evidence = strongestPerSource(observations, sources);
	if (evidence.length === 0) {
		return {
			score: 0,
			band: null,
			hasPrimary: false,
			rationale: "No evidence.",
			evidence,
		};
	}

	const contradicted = evidence.some((item) => item.kind === "contradiction");
	const hasPrimary = evidence.some((item) => WEIGHTS[item.kind].primary);

	const combined = evidence.reduce(
		(remaining, item) => remaining * (1 - WEIGHTS[item.kind].weight),
		1,
	);

	let score = Math.min(CEILING, 1 - combined);
	if (contradicted) score = Math.min(score, CONTRADICTED);

	return {
		score,
		band: bandFor(score, hasPrimary),
		hasPrimary,
		rationale: rationaleFor(evidence, contradicted, hasPrimary),
		evidence,
	};
}

export function bandFor(score: number, hasPrimary: boolean): FactBand | null {
	if (score >= BAND_FLOOR.VERIFIED && hasPrimary) return FactBand.VERIFIED;
	if (score >= BAND_FLOOR.PROBABLE) return FactBand.PROBABLE;
	if (score >= BAND_FLOOR.POSSIBLE) return FactBand.POSSIBLE;
	return null;
}

function rationaleFor(
	evidence: Evidence[],
	contradicted: boolean,
	hasPrimary: boolean,
): string {
	const reasons = evidence
		.filter((item) => item.kind !== "contradiction")
		.map((item) => WEIGHTS[item.kind].label);

	if (contradicted) {
		const clash = evidence.find((item) => item.kind === "contradiction");
		return `Held: ${clash?.detail ?? "sources disagree"}.`;
	}

	if (reasons.length === 0) return "No supporting evidence.";

	const list = joinWords(reasons);
	return hasPrimary
		? capitalise(list)
		: `${capitalise(list)} — but nothing that identifies them directly.`;
}

function joinWords(words: string[]): string {
	if (words.length === 1) return words[0] as string;
	return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

function capitalise(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}
