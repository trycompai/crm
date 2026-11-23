import { describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { type Evidence, scoreContactEvidence } from "../agent/lib/evidence";
import { recordFact } from "../agent/lib/facts";

const TITLE = "Director of Procurement";
const COMPANY = "Juniper Arc Demo";
const SENDER = "Mira Vale";
const SIGNATURE_TITLE = `${TITLE} | ${COMPANY}`;
const FIRST_DECLARATION = `I am the ${TITLE}`;
const SECOND_DECLARATION = `My title is ${TITLE}`;
const FIRST_BODY =
	"I lead the procurement evaluation for Juniper Arc Demo and will review your security questionnaire in our next meeting. Before joining Juniper Arc Demo, I was Procurement Manager at Copper Fern Demo.";
const SECOND_BODY = "I am following up on the security questionnaire review.";
const MINUTE_MS = 60_000;

const LOCATIONS = ["none", "body", "signature", "both"] as const;
type Locations = (typeof LOCATIONS)[number];
type SourceLocation = "none" | "signature" | "body";
type EvidenceLocation = Exclude<SourceLocation, "none">;
type MessageVariant = { titleIn: Locations; cites: Locations };

const VARIANTS: MessageVariant[] = LOCATIONS.flatMap((titleIn) =>
	LOCATIONS.map((cites) => ({ titleIn, cites })),
);
const EVIDENCE_KINDS = {
	body: "crm.thread-reply",
	signature: "crm.signature-block",
} as const;
const SCORES = {
	none: { none: 0, signature: 0.8, body: 0.85 },
	signature: { none: 0.8, signature: 0.96, body: 0.97 },
	body: { none: 0.85, signature: 0.97, body: 0.9775 },
} as const;

function includesLocation(locations: Locations, location: EvidenceLocation) {
	return locations === location || locations === "both";
}

function renderMessage(titleIn: Locations, declaration: string, text: string) {
	const body = includesLocation(titleIn, "body")
		? `${declaration} at ${COMPANY}. ${text}`
		: text;
	const signature = includesLocation(titleIn, "signature")
		? SIGNATURE_TITLE
		: COMPANY;
	return `${body}\n\nRegards,\n${SENDER}\n${signature}\nChengdu, China`;
}

function submittedCitations(sourceId: string, cites: Locations): Evidence[] {
	const locations: EvidenceLocation[] = ["body", "signature"];
	return locations
		.filter((location) => includesLocation(cites, location))
		.map((location) => ({
			kind: EVIDENCE_KINDS[location],
			sourceId,
			detail: `Submitted ${location} citation.`,
		}));
}

function expectedLocation(
	variant: MessageVariant,
	threadCited: boolean,
): SourceLocation {
	if (threadCited && includesLocation(variant.titleIn, "body")) return "body";
	if (
		variant.cites !== "none" &&
		includesLocation(variant.titleIn, "signature")
	) {
		return "signature";
	}
	return "none";
}

function expectedSource(
	sourceId: string,
	location: SourceLocation,
	declaration: string,
): Evidence[] {
	if (location === "none") return [];
	return [
		{
			kind: EVIDENCE_KINDS[location],
			sourceId,
			detail: location === "body" ? declaration : SIGNATURE_TITLE,
		},
	];
}

async function createFixture(first: MessageVariant, second: MessageVariant) {
	const namespace = `title-matrix-${crypto.randomUUID()}`;
	const contactId = namespace;
	const firstMessageId = `${namespace}-first`;
	const secondMessageId = `${namespace}-second`;
	const meetingId = `${namespace}-meeting`;
	const email = `${namespace}@example.test`;
	const now = Date.now();
	const firstSentAt = new Date(now - 2 * MINUTE_MS);
	const secondSentAt = new Date(now - MINUTE_MS);
	const startsAt = new Date(now + 24 * 60 * MINUTE_MS);
	const message = (id: string, sentAt: Date, body: string) => ({
		id,
		rfcMessageId: `<${id}@example.test>`,
		fromEmail: email,
		fromName: SENDER,
		direction: "INBOUND" as const,
		recipients: [],
		sentAt,
		body,
	});

	await db.$transaction([
		db.contact.create({ data: { id: contactId, firstName: "Mira", email } }),
		db.emailThread.create({
			data: {
				contactId,
				rootMessageId: `<${firstMessageId}@example.test>`,
				firstMessageAt: firstSentAt,
				lastMessageAt: secondSentAt,
				messageCount: 2,
				messages: {
					create: [
						message(
							firstMessageId,
							firstSentAt,
							renderMessage(first.titleIn, FIRST_DECLARATION, FIRST_BODY),
						),
						message(
							secondMessageId,
							secondSentAt,
							renderMessage(second.titleIn, SECOND_DECLARATION, SECOND_BODY),
						),
					],
				},
			},
		}),
		db.calendarEvent.create({
			data: {
				id: meetingId,
				iCalUid: meetingId,
				contactId,
				startsAt,
				originalStartTime: startsAt,
				endsAt: new Date(startsAt.getTime() + 30 * MINUTE_MS),
				status: "confirmed",
				attendees: {
					create: { contactId, email, responseStatus: "accepted" },
				},
			},
		}),
	]);

	return { contactId, firstMessageId, secondMessageId, meetingId };
}

function readback(contactId: string) {
	return db.contact.findUniqueOrThrow({
		where: { id: contactId },
		select: {
			title: true,
			facts: {
				where: { field: "title" },
				select: {
					value: true,
					status: true,
					band: true,
					score: true,
					evidence: true,
				},
			},
		},
	});
}

async function verifyVariantPair(
	first: MessageVariant,
	second: MessageVariant,
) {
	const { contactId, firstMessageId, secondMessageId, meetingId } =
		await createFixture(first, second);
	try {
		const blank = { title: null, facts: [] };
		expect(await readback(contactId)).toEqual(blank);
		const evidence: Evidence[] = [
			...submittedCitations(firstMessageId, first.cites),
			...submittedCitations(secondMessageId, second.cites),
			{
				kind: "crm.meeting-attendance",
				sourceId: meetingId,
				detail: "Accepted a future meeting.",
			},
		];
		const threadCited = first.cites !== "none" || second.cites !== "none";
		const firstLocation = expectedLocation(first, threadCited);
		const secondLocation = expectedLocation(second, threadCited);
		const sources = [
			...expectedSource(firstMessageId, firstLocation, FIRST_DECLARATION),
			...expectedSource(secondMessageId, secondLocation, SECOND_DECLARATION),
		];
		const score = SCORES[firstLocation][secondLocation];
		const hasEvidence = sources.length > 0;
		const band = hasEvidence ? (score >= 0.85 ? "VERIFIED" : "PROBABLE") : null;

		const scored = await scoreContactEvidence(contactId, evidence, TITLE);
		expect(scored).toMatchObject({ score, band, hasPrimary: hasEvidence });
		expect(scored.evidence).toHaveLength(sources.length);
		expect(scored.evidence).toEqual(expect.arrayContaining(sources));

		const result = await recordFact({
			contactId,
			field: "title",
			value: TITLE,
			evidence,
			method: "crm.thread",
		});
		expect(result).toMatchObject({
			score,
			band,
			stored: hasEvidence,
			applied: hasEvidence,
		});
		const saved = await readback(contactId);
		if (hasEvidence) {
			expect(saved).toEqual({
				title: TITLE,
				facts: [
					{
						value: TITLE,
						status: "APPLIED",
						band,
						score,
						evidence: expect.arrayContaining(sources),
					},
				],
			});
			expect(saved.facts[0]?.evidence).toHaveLength(sources.length);
		} else {
			expect(saved).toEqual(blank);
		}
	} finally {
		await db.$transaction([
			db.calendarEvent.deleteMany({ where: { contactId } }),
			db.emailThread.deleteMany({ where: { contactId } }),
			db.contact.delete({ where: { id: contactId } }),
		]);
	}
}

describe("title scoring and persistence matrix", () => {
	for (const first of VARIANTS) {
		for (const second of VARIANTS) {
			it(`first (title ${first.titleIn}, cite ${first.cites}) and second (title ${second.titleIn}, cite ${second.cites})`, () =>
				verifyVariantPair(first, second));
		}
	}
});
