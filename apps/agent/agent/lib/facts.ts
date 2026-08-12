import { db, FactBand, FactStatus, type Prisma } from "@crm/db";
import { type Evidence, scoreEvidence } from "./evidence";
import { currentFocus } from "./focus";
import { isDerivedName, splitName } from "./names";

const FIELDS = {
	name: { column: null },
	title: { column: "title" },
	linkedinUrl: { column: "linkedinUrl" },
	twitterUrl: { column: "twitterUrl" },
	githubUrl: { column: "githubUrl" },
	employer: { column: null },
	seniority: { column: null },
	function: { column: null },
	location: { column: null },
	tenure: { column: null },
} as const;

export type FactField = keyof typeof FIELDS;

export const FACT_FIELDS = Object.keys(FIELDS) as FactField[];

export type FactSubject = {
	email: string | null;
	firstName: string;
	lastName: string | null;
} & Record<string, unknown>;

export function factColumn(field: FactField): string | null {
	return FIELDS[field].column;
}

export function fillsBlank(input: {
	field: FactField;
	contact: FactSubject;
	hasAgentFact: boolean;
}): boolean {
	const column = FIELDS[input.field].column;
	if (humanOwns({ ...input, column })) return false;

	return isEmpty({ ...input, column });
}

export type RecordFactInput = {
	contactId: string;
	field: FactField;
	value: string;
	evidence: Evidence[];
	method: string;
	sourceUrl?: string;
};

export type RecordFactResult = {
	stored: boolean;
	applied: boolean;
	band: FactBand | null;
	score: number;
	rationale: string;
	reason?: string;
};

export async function recordFact(
	input: RecordFactInput,
): Promise<RecordFactResult> {
	const { contactId, field, value } = input;
	const trimmed = value.trim();

	const scored = scoreEvidence(input.evidence);
	const base = {
		score: scored.score,
		band: scored.band,
		rationale: scored.rationale,
	};

	if (!trimmed) {
		return { ...base, stored: false, applied: false, reason: "Empty value." };
	}

	if (scored.band === null) {
		return {
			...base,
			stored: false,
			applied: false,
			reason:
				"Below the floor for keeping — not stored. Find a source that identifies them, or leave the field alone.",
		};
	}

	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: {
			id: true,
			email: true,
			firstName: true,
			lastName: true,
			title: true,
			linkedinUrl: true,
			twitterUrl: true,
			githubUrl: true,
		},
	});

	if (!contact) {
		return {
			...base,
			stored: false,
			applied: false,
			reason: "No such contact.",
		};
	}

	const existing = await db.contactFact.findMany({
		where: { contactId, field },
		select: { id: true, value: true, status: true },
	});

	if (
		existing.some(
			(fact) =>
				fact.status === FactStatus.DISMISSED && sameValue(fact.value, trimmed),
		)
	) {
		return {
			...base,
			stored: false,
			applied: false,
			reason:
				"A person has already dismissed this exact value. Do not offer it again.",
		};
	}

	const currentApplied = existing.find(
		(fact) => fact.status === FactStatus.APPLIED,
	);

	if (currentApplied && sameValue(currentApplied.value, trimmed)) {
		return {
			...base,
			stored: false,
			applied: false,
			reason: "Already on the record, from this same source. Nothing changed.",
		};
	}

	const column = FIELDS[field].column;
	const hasAgentFact = Boolean(currentApplied);

	if (humanOwns({ field, column, contact, hasAgentFact })) {
		return {
			...base,
			stored: false,
			applied: false,
			reason: `A person already filled in ${field}. That outranks anything found on the web.`,
		};
	}

	const applies =
		scored.band === FactBand.VERIFIED ||
		fillsBlank({ field, contact, hasAgentFact });

	if (
		!applies &&
		existing.some(
			(fact) =>
				fact.status === FactStatus.PROPOSED && sameValue(fact.value, trimmed),
		)
	) {
		return {
			...base,
			stored: false,
			applied: false,
			reason:
				"This exact value is already in front of a rep, waiting on them. Offering it twice only makes them read it twice.",
		};
	}

	const sessionId = currentFocus().sessionId;

	await db.$transaction(async (tx) => {
		if (applies) {
			await tx.contactFact.updateMany({
				where: {
					contactId,
					field,
					status: { in: [FactStatus.APPLIED, FactStatus.PROPOSED] },
				},
				data: { status: FactStatus.SUPERSEDED, supersededAt: new Date() },
			});
		}

		await tx.contactFact.create({
			data: {
				contactId,
				field,
				value: trimmed,
				score: scored.score,
				band: scored.band as FactBand,
				evidence: input.evidence as Prisma.InputJsonValue,
				method: input.method,
				sourceUrl: input.sourceUrl ?? null,
				sessionId,
				status: applies ? FactStatus.APPLIED : FactStatus.PROPOSED,
			},
		});

		if (!applies) return;

		if (column) {
			await tx.contact.update({
				where: { id: contactId },
				data: { [column]: trimmed },
			});
		}

		if (field === "name") {
			const split = splitName(trimmed);
			if (split) {
				await tx.contact.update({
					where: { id: contactId },
					data: { firstName: split.firstName, lastName: split.lastName },
				});
			}
		}
	});

	return {
		...base,
		stored: true,
		applied: applies,
		reason: applies
			? undefined
			: "The record already carries a value here, and only VERIFIED evidence may replace one, so this is kept as a proposal for a rep to accept or dismiss. This is a normal outcome, not a failure — do not try to raise the score.",
	};
}

export async function lastEmployerChange(contactId: string) {
	const [previous, current] = await Promise.all([
		db.contactFact.findFirst({
			where: { contactId, field: "employer", status: FactStatus.SUPERSEDED },
			orderBy: { supersededAt: "desc" },
			select: { value: true, supersededAt: true },
		}),
		db.contactFact.findFirst({
			where: { contactId, field: "employer", status: FactStatus.APPLIED },
			orderBy: { observedAt: "desc" },
			select: { value: true, observedAt: true, sourceUrl: true },
		}),
	]);

	if (!previous || !current || sameValue(previous.value, current.value)) {
		return null;
	}

	return {
		from: previous.value,
		to: current.value,
		observedAt: current.observedAt,
		sourceUrl: current.sourceUrl,
	};
}

export type BriefSections = {
	currentRole?: string;
	tenure?: string;
	previousRoles?: string[];
	seniority?: string;
	function?: string;
	location?: string;
};

export async function writeBrief(input: {
	contactId: string;
	narrative: string;
	sections: BriefSections;
	evidence: Evidence[];
	sourceUrl?: string;
}): Promise<{ written: boolean; score: number; reason?: string }> {
	const scored = scoreEvidence(input.evidence);

	if (scored.band === null) {
		return {
			written: false,
			score: scored.score,
			reason: "Nothing here is sourced well enough to put on the record.",
		};
	}

	const data = {
		narrative: input.narrative.trim(),
		sections: input.sections as Prisma.InputJsonValue,
		score: scored.score,
		sourceUrl: input.sourceUrl ?? null,
		sessionId: currentFocus().sessionId,
		refreshedAt: new Date(),
	};

	await db.contactBrief.upsert({
		where: { contactId: input.contactId },
		create: { contactId: input.contactId, ...data },
		update: data,
	});

	return { written: true, score: scored.score };
}

function humanOwns({
	field,
	column,
	contact,
	hasAgentFact,
}: {
	field: FactField;
	column: string | null;
	contact: {
		email: string | null;
		firstName: string;
		lastName: string | null;
	} & Record<string, unknown>;
	hasAgentFact: boolean;
}): boolean {
	if (field === "name") {
		return !isDerivedName(contact.email, contact.firstName, contact.lastName);
	}

	if (!column || hasAgentFact) return false;

	return Boolean(contact[column]);
}

function isEmpty({
	field,
	column,
	contact,
	hasAgentFact,
}: {
	field: FactField;
	column: string | null;
	contact: Record<string, unknown>;
	hasAgentFact: boolean;
}): boolean {
	if (hasAgentFact) return false;
	if (field === "name") return true;
	if (!column) return true;

	return !contact[column];
}

const HOST_ALIASES: Record<string, string> = {
	"twitter.com": "x.com",
	"mobile.twitter.com": "x.com",
};

export function sameValue(a: string, b: string): boolean {
	return canonicalValue(a) === canonicalValue(b);
}

export function canonicalValue(value: string): string {
	const text = value.trim().replace(/\s+/g, " ").toLowerCase();
	const url = asWebUrl(text);

	if (!url) return text;

	const host = url.host.replace(/^www\./, "");
	const path = url.pathname.replace(/\/+$/, "");

	return `${HOST_ALIASES[host] ?? host}${path}`;
}

function asWebUrl(value: string): URL | null {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:" ? url : null;
	} catch {
		return null;
	}
}
