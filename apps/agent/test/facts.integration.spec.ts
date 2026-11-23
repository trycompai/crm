import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { readCrmHistory } from "../agent/lib/crm";
import { type Evidence, scoreContactEvidence } from "../agent/lib/evidence";
import { recordFact, writeBrief } from "../agent/lib/facts";

const suffix = process.env.TEST_RUN_ID ?? "facts-spec";
const email = `evidence.subject.${suffix}@example.test`;

let contactId: string;

const seen = (kind: Evidence["kind"], detail = "observed"): Evidence => ({
	kind,
	detail,
});

async function storeReply(contactId: string, fromEmail: string, body: string) {
	const sentAt = new Date();
	const messageId = crypto.randomUUID();
	return db.emailThread.create({
		data: {
			rootMessageId: messageId,
			contactId,
			firstMessageAt: sentAt,
			lastMessageAt: sentAt,
			messageCount: 1,
			messages: {
				create: {
					rfcMessageId: messageId,
					fromEmail,
					direction: "INBOUND",
					sentAt,
					recipients: [],
					body,
				},
			},
		},
		include: { messages: true },
	});
}

beforeAll(async () => {
	await db.contact.deleteMany({ where: { email } });
	const contact = await db.contact.create({
		data: { firstName: "Subject", lastName: null, email },
		select: { id: true },
	});
	contactId = contact.id;
});

afterAll(async () => {
	await db.contact.deleteMany({ where: { email } });
});

describe("recordFact", () => {
	it("writes the reply weights for two messages cited only by their signatures", async () => {
		const signature = "\n\nRegards,\nSubject\nHead of Security | Example";
		const threads = await Promise.all(
			[
				"I am the Head of Security at Example.",
				"My title is Head of Security at Example.",
			].map((body) => storeReply(contactId, email, body + signature)),
		);
		try {
			const result = await recordFact({
				contactId,
				field: "title",
				value: "Head of Security",
				evidence: threads.map((thread) => ({
					...seen("crm.signature-block"),
					sourceId: thread.messages[0]?.id,
				})),
				method: "crm.thread",
			});

			expect(result.applied).toBe(true);
			expect(result.band).toBe("VERIFIED");
			expect(result.score).toBeCloseTo(0.9775, 4);

			const contact = await db.contact.findUnique({
				where: { id: contactId },
				select: { title: true },
			});
			expect(contact?.title).toBe("Head of Security");
			const fact = await db.contactFact.findFirstOrThrow({
				where: { contactId, field: "title" },
				select: { evidence: true },
			});
			expect(fact.evidence).toEqual(
				["I am the Head of Security", "My title is Head of Security"].map(
					(detail, index) => ({
						kind: "crm.thread-reply",
						sourceId: threads[index]?.messages[0]?.id,
						detail,
					}),
				),
			);
		} finally {
			await db.emailThread.deleteMany({
				where: { id: { in: threads.map(({ id }) => id) } },
			});
		}
	});

	it("fills an empty field without asking anybody", async () => {
		const result = await recordFact({
			contactId,
			field: "twitterUrl",
			value: "https://x.com/subject",
			evidence: [seen("handle.name-form"), seen("search.cites-profile")],
			method: "x.handle+citation",
		});

		expect(result.applied).toBe(true);
		expect(result.band).toBe("PROBABLE");

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: { twitterUrl: true },
		});
		expect(contact?.twitterUrl).toBe("https://x.com/subject");
	});

	it("fills a field the record keeps no column for", async () => {
		const result = await recordFact({
			contactId,
			field: "location",
			value: "Brooklyn, NY",
			evidence: [seen("web.cited-claim")],
			method: "web",
		});

		expect(result.applied).toBe(true);
		expect(result.band).toBe("POSSIBLE");
	});

	it("offers rather than replaces a value it already found", async () => {
		const result = await recordFact({
			contactId,
			field: "twitterUrl",
			value: "https://x.com/someone-else",
			evidence: [seen("handle.name-form"), seen("search.cites-profile")],
			method: "x.handle+citation",
		});

		expect(result.stored).toBe(true);
		expect(result.applied).toBe(false);
		expect(result.reason).toContain("already carries a value");

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: { twitterUrl: true },
		});
		expect(contact?.twitterUrl).toBe("https://x.com/subject");
	});

	it("puts the same suggestion in front of a rep only once", async () => {
		const result = await recordFact({
			contactId,
			field: "twitterUrl",
			value: "https://x.com/someone-else",
			evidence: [seen("web.cited-claim"), seen("search.cites-profile")],
			method: "web",
		});

		expect(result.stored).toBe(false);
		expect(result.reason).toContain("already in front of a rep");

		const offers = await db.contactFact.count({
			where: { contactId, field: "twitterUrl", status: "PROPOSED" },
		});
		expect(offers).toBe(1);
	});

	it("settles the suggestions a stronger fact has answered", async () => {
		await recordFact({
			contactId,
			field: "twitterUrl",
			value: "https://x.com/the-real-one",
			evidence: [seen("profile.email-match")],
			method: "x.profile",
		});

		const facts = await db.contactFact.findMany({
			where: { contactId, field: "twitterUrl" },
			select: { value: true, status: true },
		});

		expect(facts.filter((fact) => fact.status === "PROPOSED")).toHaveLength(0);
		expect(
			facts.find((f) => f.value === "https://x.com/the-real-one")?.status,
		).toBe("APPLIED");
	});

	it("never overwrites what a person typed", async () => {
		await db.contact.update({
			where: { id: contactId },
			data: { githubUrl: "https://github.com/typed-by-a-human" },
		});

		const result = await recordFact({
			contactId,
			field: "githubUrl",
			value: "https://github.com/found-on-the-web",
			evidence: [seen("github.account-identity")],
			method: "github.api",
		});

		expect(result.applied).toBe(false);
		expect(result.reason).toContain("A person already filled in");

		const contact = await db.contact.findUnique({
			where: { id: contactId },
			select: { githubUrl: true },
		});
		expect(contact?.githubUrl).toBe("https://github.com/typed-by-a-human");
	});

	it("never re-offers a value a person dismissed", async () => {
		const offer = await recordFact({
			contactId,
			field: "title",
			value: "Head of Trust",
			evidence: [seen("web.cited-claim"), seen("search.cites-profile")],
			method: "web",
		});
		expect(offer.applied).toBe(false);

		const proposal = await db.contactFact.findFirst({
			where: { contactId, field: "title", status: "PROPOSED" },
			select: { id: true },
		});
		await db.contactFact.update({
			where: { id: proposal?.id },
			data: { status: "DISMISSED", decidedAt: new Date() },
		});

		const result = await recordFact({
			contactId,
			field: "title",
			value: "Head of Trust",
			evidence: [seen("web.cited-claim"), seen("search.cites-profile")],
			method: "web",
		});

		expect(result.stored).toBe(false);
		expect(result.reason).toContain("dismissed");
	});

	it("supersedes rather than replaces, which is how a job change is noticed", async () => {
		await recordFact({
			contactId,
			field: "employer",
			value: "Fleetio",
			evidence: [seen("linkedin.employer-and-name")],
			method: "linkedin.profile",
		});

		await recordFact({
			contactId,
			field: "employer",
			value: "Comp AI",
			evidence: [seen("linkedin.employer-and-name")],
			method: "linkedin.profile",
		});

		const facts = await db.contactFact.findMany({
			where: { contactId, field: "employer" },
			select: { value: true, status: true },
		});

		expect(facts).toHaveLength(2);
		expect(facts.find((f) => f.value === "Fleetio")?.status).toBe("SUPERSEDED");
		expect(facts.find((f) => f.value === "Comp AI")?.status).toBe("APPLIED");
	});

	it("lets verified evidence settle the suggestion it matches", async () => {
		const offer = await recordFact({
			contactId,
			field: "employer",
			value: "Fleetio Inc",
			evidence: [seen("web.cited-claim"), seen("search.cites-profile")],
			method: "web",
		});
		expect(offer.applied).toBe(false);

		const result = await recordFact({
			contactId,
			field: "employer",
			value: "Fleetio Inc",
			evidence: [seen("linkedin.employer-and-name")],
			method: "linkedin.profile",
		});

		expect(result.stored).toBe(true);
		expect(result.applied).toBe(true);

		const facts = await db.contactFact.findMany({
			where: { contactId, field: "employer" },
			select: { value: true, status: true, score: true },
		});

		const live = facts.filter((fact) => fact.status === "APPLIED");
		expect(live).toHaveLength(1);
		expect(live[0]?.value).toBe("Fleetio Inc");
		expect(facts.filter((fact) => fact.status === "PROPOSED")).toHaveLength(0);
	});

	it("stores the evidence, so the score can be explained later", async () => {
		const fact = await db.contactFact.findFirst({
			where: { contactId, field: "title" },
			select: { evidence: true, score: true, sourceUrl: true },
		});

		expect(Array.isArray(fact?.evidence)).toBe(true);
		expect(fact?.score).toBeCloseTo(0.9775, 4);
	});
});

it("writes a signature-only title at the signature weight even if the reply is cited", async () => {
	const fromEmail = `evidence.procurement.${suffix}@example.test`;
	const contact = await db.contact.create({
		data: { firstName: "Mira", email: fromEmail },
	});
	const title = "Director of Procurement";
	const signature = `${title} | Example`;
	const thread = await storeReply(
		contact.id,
		fromEmail,
		`I lead the procurement evaluation.\n\nRegards,\nMira Vale\n${signature}`,
	);
	const sourceId = thread.messages[0]?.id;

	try {
		const reply = {
			...seen("crm.thread-reply", "I lead the procurement evaluation."),
			sourceId,
		};
		const result = await recordFact({
			contactId: contact.id,
			field: "title",
			value: title,
			evidence: [reply, { ...seen("crm.signature-block"), sourceId }],
			method: "crm.thread",
		});
		expect(result).toMatchObject({
			applied: true,
			band: "PROBABLE",
			score: 0.8,
		});
		const fact = await db.contactFact.findFirstOrThrow({
			where: { contactId: contact.id, field: "title" },
		});
		expect(fact.evidence).toEqual([
			{ kind: "crm.signature-block", detail: signature, sourceId },
		]);
		const replyOnly = await scoreContactEvidence(contact.id, [reply], title);
		expect(replyOnly.score).toBeCloseTo(0.8);
		const unsupported = await scoreContactEvidence(
			contact.id,
			[reply],
			"VP Procurement",
		);
		expect(unsupported.score).toBe(0);
		const withoutMessage = await scoreContactEvidence(
			contact.id,
			[seen("crm.thread-reply"), seen("crm.signature-block")],
			title,
		);
		expect(withoutMessage.score).toBe(0);
	} finally {
		await db.emailThread.delete({ where: { id: thread.id } });
		await db.contact.delete({ where: { id: contact.id } });
	}
});

it("adds explicit title replies from the same contact in the cited thread once per message", async () => {
	const fromEmail = `evidence.title-thread.${suffix}@example.test`;
	const contact = await db.contact.create({
		data: { firstName: "Mira", email: fromEmail },
	});
	const title = "Director of Procurement";
	const firstReply = `I am the ${title}`;
	const secondReply = `My title is ${title}`;
	const signature = `\n\nRegards,\nMira Vale\n${title} | Example`;

	try {
		const thread = await storeReply(
			contact.id,
			fromEmail.toUpperCase(),
			`${firstReply} at Example.${signature}`,
		);
		const sentAt = new Date();
		const inbound = (sender: string, body: string) => {
			const id = crypto.randomUUID();
			return {
				id,
				rfcMessageId: id,
				fromEmail: sender,
				direction: "INBOUND" as const,
				sentAt,
				recipients: [],
				body,
			};
		};
		const second = inbound(fromEmail, `${secondReply} at Example.${signature}`);
		const foreign = inbound(
			"colleague@example.test",
			`${firstReply} at Example.`,
		);
		const replies = [
			second,
			foreign,
			inbound(fromEmail, `I lead procurement evaluations.${signature}`),
			inbound(fromEmail, `I was the ${title} at Example.`),
		];
		await db.emailThread.update({
			where: { id: thread.id },
			data: {
				lastMessageAt: sentAt,
				messageCount: { increment: replies.length },
				messages: { create: replies },
			},
		});
		await storeReply(contact.id, fromEmail, `${firstReply} at Example.`);

		const untrusted = await scoreContactEvidence(
			contact.id,
			[{ ...seen("crm.thread-reply"), sourceId: foreign.id }],
			title,
		);
		expect(untrusted.evidence).toEqual([]);

		const result = await recordFact({
			contactId: contact.id,
			field: "title",
			value: title,
			evidence: [
				{ ...seen("crm.thread-reply"), sourceId: second.id },
				{ ...seen("crm.signature-block"), sourceId: second.id },
			],
			method: "crm.thread",
		});
		expect(result).toMatchObject({
			stored: true,
			applied: true,
			band: "VERIFIED",
			score: 0.9775,
		});
		const savedContact = await db.contact.findUniqueOrThrow({
			where: { id: contact.id },
			select: { title: true },
		});
		expect(savedContact.title).toBe(title);
		const fact = await db.contactFact.findFirstOrThrow({
			where: { contactId: contact.id, field: "title" },
		});
		expect(fact).toMatchObject({ status: "APPLIED", score: 0.9775 });
		expect(fact.evidence).toHaveLength(2);
		expect(fact.evidence).toEqual(
			expect.arrayContaining([
				{
					kind: "crm.thread-reply",
					sourceId: thread.messages[0]?.id,
					detail: firstReply,
				},
				{ kind: "crm.thread-reply", sourceId: second.id, detail: secondReply },
			]),
		);
	} finally {
		await db.emailThread.deleteMany({ where: { contactId: contact.id } });
		await db.contact.delete({ where: { id: contact.id } });
	}
});

it("scores one reply per message and excludes future and cancelled meetings", async () => {
	const now = Date.now();
	const thread = await storeReply(
		contactId,
		email,
		"I am based in Chengdu. Regards, Subject.",
	);
	const meetings = await Promise.all(
		[
			{ status: "confirmed", offset: 60_000 },
			{ status: "confirmed", offset: -120_000 },
			{ status: "cancelled", offset: -180_000 },
		].map(({ status, offset }) => {
			const startsAt = new Date(now + offset);
			return db.calendarEvent.create({
				data: {
					iCalUid: `facts-meeting-${contactId}-${offset}`,
					startsAt,
					originalStartTime: startsAt,
					endsAt: new Date(startsAt.getTime() + 30_000),
					status,
					contactId,
					attendees: {
						create: { email, contactId, responseStatus: "accepted" },
					},
				},
			});
		}),
	);

	try {
		const history = await readCrmHistory(contactId);
		const sourceId = history?.threads[0]?.messages[0]?.id;
		const [future, past, cancelled] = meetings;
		expect(sourceId).toBeDefined();
		expect(history?.meetings.find(({ id }) => id === future?.id)).toMatchObject(
			{
				accepted: true,
				attended: false,
			},
		);
		expect(history?.meetings.find(({ id }) => id === past?.id)?.attended).toBe(
			true,
		);
		expect(
			history?.meetings.find(({ id }) => id === cancelled?.id)?.attended,
		).toBe(false);

		const evidence: Evidence[] = [
			{ ...seen("crm.signature-block"), sourceId },
			{ ...seen("crm.thread-reply"), sourceId },
			{ ...seen("crm.meeting-attendance"), sourceId: future?.id },
			{ ...seen("crm.meeting-attendance"), sourceId: cancelled?.id },
			seen("crm.meeting-attendance"),
		];
		const result = await recordFact({
			contactId,
			field: "tenure",
			value: "Two years",
			evidence,
			method: "crm.thread",
		});
		expect(result.score).toBeCloseTo(0.85);
		expect(result.applied).toBe(true);
		const fact = await db.contactFact.findFirstOrThrow({
			where: { contactId, field: "tenure" },
		});
		expect(fact.evidence).toEqual([{ ...seen("crm.thread-reply"), sourceId }]);

		const brief = await writeBrief({
			contactId,
			narrative: "Subject is based in Chengdu.",
			sections: { location: "Chengdu" },
			evidence,
		});
		expect(brief.score).toBeCloseTo(0.85);
		const pastEvidence = await scoreContactEvidence(contactId, [
			{ ...seen("crm.meeting-attendance"), sourceId: past?.id },
		]);
		expect(pastEvidence.score).toBeCloseTo(0.7);
	} finally {
		await db.calendarEvent.deleteMany({
			where: { id: { in: meetings.map(({ id }) => id) } },
		});
		await db.emailThread.delete({ where: { id: thread.id } });
	}
});

describe("writeBrief", () => {
	it("upserts the background panel", async () => {
		await writeBrief({
			contactId,
			narrative: "Subject is Head of Security at Example.",
			sections: { currentRole: "Head of Security · Example" },
			evidence: [seen("linkedin.employer-and-name")],
			sourceUrl: "https://www.linkedin.com/in/subject",
		});

		await writeBrief({
			contactId,
			narrative: "Subject is now VP Security at Example.",
			sections: { currentRole: "VP Security · Example" },
			evidence: [seen("linkedin.employer-and-name")],
		});

		const brief = await db.contactBrief.findUnique({ where: { contactId } });
		expect(brief?.narrative).toBe("Subject is now VP Security at Example.");
	});

	it("refuses a brief nothing supports", async () => {
		const result = await writeBrief({
			contactId,
			narrative: "Subject seems like a great person to know.",
			sections: {},
			evidence: [seen("employer-only")],
		});

		expect(result.written).toBe(false);
	});
});
