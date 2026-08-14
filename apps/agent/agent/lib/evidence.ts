import { FactBand } from "@crm/db";

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
		label: "they attended a meeting on our calendar",
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

export type Evidence = {
	kind: EvidenceKind;
	detail: string;
	sourceUrl?: string;
};

export type Scored = {
	score: number;
	band: FactBand | null;
	hasPrimary: boolean;
	rationale: string;
};

const CEILING = 0.99;

const CONTRADICTED = 0.45;

export const BAND_FLOOR = { VERIFIED: 0.85, PROBABLE: 0.55, POSSIBLE: 0.3 };

export function scoreEvidence(evidence: Evidence[]): Scored {
	if (evidence.length === 0) {
		return {
			score: 0,
			band: null,
			hasPrimary: false,
			rationale: "No evidence.",
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
