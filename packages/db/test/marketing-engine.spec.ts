import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "../src/client";
import {
	advance,
	advanceDue,
	enrolContact,
	sweepEntries,
	sweepExits,
} from "../src/marketing/drips";
import {
	claimDueSends,
	deferQuiet,
	isQuiet,
	materialise,
	nextOpen,
	pauseUnhealthy,
	settle,
	skipOverCap,
	sweepEvents,
} from "../src/marketing/queue";
import { suppress, unsubscribeByToken } from "../src/marketing/recipients";
import {
	DEFAULT_SEGMENTS,
	ensureDefaultSegments,
	filterSchema,
	segmentWhere,
} from "../src/marketing/segments";
import { MARKETING } from "../src/marketing/settings";

const TAG = `mktest${Date.now()}`;

let seq = 0;

type Seeded = {
	campaignId: string;
	touch1: string;
	touch2: string;
	contactId: string;
	address: string;
};

async function seedDrip(
	options: { maxPasses?: number; cooldown?: number | null } = {},
) {
	seq += 1;
	const suffix = `${TAG}x${seq}`;

	const contact = await db.contact.create({
		data: {
			firstName: "Dana",
			lastName: TAG,
			email: `dana.${suffix}@example.test`,
		},
		select: { id: true, email: true },
	});

	const campaign = await db.marketingCampaign.create({
		data: {
			name: `${TAG} drip ${seq}`,
			kind: "DRIP",
			status: "ACTIVE",
			entryMode: "MANUAL",
			maxPasses: options.maxPasses ?? 1,
			reentryCooldownDays: options.cooldown ?? null,
		},
		select: { id: true },
	});

	const touch1 = await db.marketingCampaignNode.create({
		data: {
			campaignId: campaign.id,
			kind: "EMAIL",
			label: "Touch 1",
			subject: "First",
			document: { version: 1, blocks: [] },
		},
		select: { id: true },
	});

	const wait = await db.marketingCampaignNode.create({
		data: { campaignId: campaign.id, kind: "WAIT", delayHours: 0 },
		select: { id: true },
	});

	const touch2 = await db.marketingCampaignNode.create({
		data: {
			campaignId: campaign.id,
			kind: "EMAIL",
			label: "Touch 2",
			subject: "Second",
			document: { version: 1, blocks: [] },
		},
		select: { id: true },
	});

	await db.marketingCampaignEdge.createMany({
		data: [
			{ campaignId: campaign.id, fromId: touch1.id, toId: wait.id },
			{ campaignId: campaign.id, fromId: wait.id, toId: touch2.id },
		],
	});

	return {
		campaignId: campaign.id,
		touch1: touch1.id,
		touch2: touch2.id,
		contactId: contact.id,
		address: contact.email as string,
	} satisfies Seeded;
}

async function seedContinuous(cooldown: number | null) {
	seq += 1;
	const suffix = `${TAG}c${seq}`;

	const contact = await db.contact.create({
		data: {
			firstName: "Cora",
			lastName: TAG,
			title: suffix,
			email: `cora.${suffix}@example.test`,
		},
		select: { id: true },
	});

	const campaign = await db.marketingCampaign.create({
		data: {
			name: `${TAG} continuous ${seq}`,
			kind: "DRIP",
			status: "ACTIVE",
			entryMode: "CONTINUOUS",
			entryDefinition: {
				facet: { facet: "contact.titleContains", value: suffix },
			},
			maxPasses: 3,
			reentryCooldownDays: cooldown,
		},
		select: { id: true },
	});

	await db.marketingCampaignNode.create({
		data: {
			campaignId: campaign.id,
			kind: "EMAIL",
			subject: "First",
			document: { version: 1, blocks: [] },
		},
	});

	return { campaignId: campaign.id, contactId: contact.id };
}

async function completeEnrolments(campaignId: string) {
	await db.marketingEnrolment.updateMany({
		where: { campaignId },
		data: { status: "COMPLETED", exitKind: "RULE", exitedAt: new Date() },
	});
}

async function cleanup() {
	await db.marketingCampaign.deleteMany({ where: { name: { contains: TAG } } });
	await db.marketingTemplate.deleteMany({ where: { name: { contains: TAG } } });
	await db.marketingSegment.deleteMany({ where: { name: { contains: TAG } } });
	await db.marketingRecipient.deleteMany({
		where: { address: { contains: TAG } },
	});
	await db.contact.deleteMany({ where: { lastName: TAG } });
}

beforeAll(cleanup);
afterAll(cleanup);

describe("a drip walks its graph", () => {
	test("sends touch one, then touch two, one send each", async () => {
		const drip = await seedDrip();

		const enrolled = await enrolContact(db, drip.campaignId, drip.contactId);
		expect(enrolled.ok).toBe(true);

		await advanceDue(db);
		await advanceDue(db);
		await advanceDue(db);

		const sends = await db.marketingSend.findMany({
			where: { campaignId: drip.campaignId },
			select: { nodeId: true, pass: true },
		});

		expect(sends).toHaveLength(2);
		expect(sends.map((send) => send.nodeId).sort()).toEqual(
			[drip.touch1, drip.touch2].sort(),
		);
		expect(sends.every((send) => send.pass === 1)).toBe(true);
	});

	test("advancing twice does not send the same touch twice", async () => {
		const drip = await seedDrip();
		await enrolContact(db, drip.campaignId, drip.contactId);

		const enrolment = await db.marketingEnrolment.findFirstOrThrow({
			where: { campaignId: drip.campaignId },
			select: { id: true },
		});

		await advance(db, enrolment.id);
		await db.marketingEnrolment.update({
			where: { id: enrolment.id },
			data: { currentNodeId: drip.touch1, nextDueAt: new Date() },
		});
		await advance(db, enrolment.id);

		const count = await db.marketingSend.count({
			where: { nodeId: drip.touch1 },
		});

		expect(count).toBe(1);
	});
});

describe("re-entry", () => {
	test("is refused while they are still walking", async () => {
		const drip = await seedDrip({ maxPasses: 3, cooldown: 0 });
		await enrolContact(db, drip.campaignId, drip.contactId);

		const second = await enrolContact(db, drip.campaignId, drip.contactId);

		expect(second.ok).toBe(false);
	});

	test("is refused once, ever, when maxPasses is one", async () => {
		const drip = await seedDrip({ maxPasses: 1 });
		await enrolContact(db, drip.campaignId, drip.contactId);

		await db.marketingEnrolment.updateMany({
			where: { campaignId: drip.campaignId },
			data: { status: "COMPLETED", exitedAt: new Date(), exitKind: "RULE" },
		});

		const again = await enrolContact(db, drip.campaignId, drip.contactId);
		expect(again.ok).toBe(false);
	});

	test("lets a second pass send the touch the first pass already sent", async () => {
		const drip = await seedDrip({ maxPasses: 2, cooldown: 0 });

		await enrolContact(db, drip.campaignId, drip.contactId);
		const first = await db.marketingEnrolment.findFirstOrThrow({
			where: { campaignId: drip.campaignId },
			select: { id: true },
		});
		await advance(db, first.id);

		await db.marketingEnrolment.update({
			where: { id: first.id },
			data: { status: "COMPLETED", exitedAt: new Date(), exitKind: "RULE" },
		});

		const second = await enrolContact(db, drip.campaignId, drip.contactId);
		expect(second.ok).toBe(true);
		if (!second.ok) return;

		await advance(db, second.enrolmentId);

		const sends = await db.marketingSend.findMany({
			where: { nodeId: drip.touch1 },
			select: { pass: true },
			orderBy: { pass: "asc" },
		});

		expect(sends.map((send) => send.pass)).toEqual([1, 2]);
	});

	test("never lets a suppressed address back in", async () => {
		const drip = await seedDrip({ maxPasses: 5, cooldown: 0 });
		await enrolContact(db, drip.campaignId, drip.contactId);

		await db.marketingEnrolment.updateMany({
			where: { campaignId: drip.campaignId },
			data: {
				status: "EXITED",
				exitKind: "SUPPRESSED",
				exitedAt: new Date(),
			},
		});

		await db.marketingRecipient.updateMany({
			where: { address: drip.address },
			data: { status: "UNSUBSCRIBED" },
		});

		const again = await enrolContact(db, drip.campaignId, drip.contactId);
		expect(again.ok).toBe(false);
	});
});

describe("the exit sweep", () => {
	test("pulls somebody out the moment their address is suppressed", async () => {
		const drip = await seedDrip();
		await enrolContact(db, drip.campaignId, drip.contactId);

		await db.marketingRecipient.updateMany({
			where: { address: drip.address },
			data: { status: "UNSUBSCRIBED" },
		});

		const exited = await sweepExits(db, drip.campaignId);
		expect(exited).toBeGreaterThan(0);

		const enrolment = await db.marketingEnrolment.findFirstOrThrow({
			where: { campaignId: drip.campaignId },
			select: { status: true, exitKind: true },
		});

		expect(enrolment.status).toBe("EXITED");
		expect(enrolment.exitKind).toBe("SUPPRESSED");
	});

	test("runs between touches, not only when the next one is due", async () => {
		const drip = await seedDrip();
		await enrolContact(db, drip.campaignId, drip.contactId);

		await db.marketingEnrolment.updateMany({
			where: { campaignId: drip.campaignId },
			data: { nextDueAt: new Date(Date.now() + 14 * 86_400_000) },
		});

		await db.marketingRecipient.updateMany({
			where: { address: drip.address },
			data: { status: "COMPLAINED" },
		});

		await sweepExits(db, drip.campaignId);

		const enrolment = await db.marketingEnrolment.findFirstOrThrow({
			where: { campaignId: drip.campaignId },
			select: { status: true },
		});

		expect(enrolment.status).toBe("EXITED");
	});
});

describe("the entry sweep", () => {
	test("does nothing for a manual drip", async () => {
		const drip = await seedDrip();
		expect(await sweepEntries(db, drip.campaignId)).toBe(0);
	});

	test("lets somebody straight back in when the cooldown is zero days", async () => {
		const drip = await seedContinuous(0);

		expect(await sweepEntries(db, drip.campaignId)).toBe(1);
		await completeEnrolments(drip.campaignId);

		expect(await sweepEntries(db, drip.campaignId)).toBe(1);
	});

	test("holds somebody out forever when the cooldown is not set", async () => {
		const drip = await seedContinuous(null);

		expect(await sweepEntries(db, drip.campaignId)).toBe(1);
		await completeEnrolments(drip.campaignId);

		expect(await sweepEntries(db, drip.campaignId)).toBe(0);
	});
});

describe("a drip email that picks a template", () => {
	async function seedTemplateDrip(node: {
		subject?: string;
		document?: unknown;
	}) {
		seq += 1;
		const suffix = `${TAG}t${seq}`;

		const contact = await db.contact.create({
			data: {
				firstName: "Theo",
				lastName: TAG,
				email: `theo.${suffix}@example.test`,
			},
			select: { id: true },
		});

		const template = await db.marketingTemplate.create({
			data: {
				name: `${TAG} template ${seq}`,
				subject: "From the template",
				document: { version: 1, blocks: [{ type: "divider" }] },
			},
			select: { id: true },
		});

		const campaign = await db.marketingCampaign.create({
			data: {
				name: `${TAG} template drip ${seq}`,
				kind: "DRIP",
				status: "ACTIVE",
				entryMode: "MANUAL",
			},
			select: { id: true },
		});

		const touch = await db.marketingCampaignNode.create({
			data: {
				campaignId: campaign.id,
				kind: "EMAIL",
				templateId: template.id,
				subject: node.subject ?? null,
				document: (node.document ?? undefined) as never,
			},
			select: { id: true },
		});

		const enrolled = await enrolContact(db, campaign.id, contact.id);
		if (!enrolled.ok) throw new Error(enrolled.reason);
		await advance(db, enrolled.enrolmentId);

		return db.marketingSend.findFirstOrThrow({
			where: { nodeId: touch.id },
			select: { subject: true, document: true },
		});
	}

	test("queues the template's subject and body, not an empty send", async () => {
		const send = await seedTemplateDrip({});

		expect(send.subject).toBe("From the template");
		expect(send.document).toEqual({
			version: 1,
			blocks: [{ type: "divider" }],
		});
	});

	test("keeps the subject and the body copy the node edits", async () => {
		const send = await seedTemplateDrip({
			subject: "From the node",
			document: { version: 1, blocks: [] },
		});

		expect(send.subject).toBe("From the node");
		expect(send.document).toEqual({ version: 1, blocks: [] });
	});
});

describe("the send queue", () => {
	test("claims a due send once, even when two drains run", async () => {
		const drip = await seedDrip();
		await enrolContact(db, drip.campaignId, drip.contactId);
		await advance(
			db,
			(
				await db.marketingEnrolment.findFirstOrThrow({
					where: { campaignId: drip.campaignId },
					select: { id: true },
				})
			).id,
		);

		const [first, second] = await Promise.all([
			claimDueSends(db, 50),
			claimDueSends(db, 50),
		]);

		const mine = [...first, ...second].filter(
			(send) => send.campaignId === drip.campaignId,
		);

		expect(mine).toHaveLength(1);
	});

	test("settles a send and stamps the recipient", async () => {
		const drip = await seedDrip();
		await enrolContact(db, drip.campaignId, drip.contactId);
		await advance(
			db,
			(
				await db.marketingEnrolment.findFirstOrThrow({
					where: { campaignId: drip.campaignId },
					select: { id: true },
				})
			).id,
		);

		const send = await db.marketingSend.findFirstOrThrow({
			where: { campaignId: drip.campaignId },
			select: { id: true },
		});

		await settle(db, send.id, { ok: true, providerId: `prov_${TAG}` });

		const settled = await db.marketingSend.findUniqueOrThrow({
			where: { id: send.id },
			select: {
				status: true,
				sentAt: true,
				recipient: { select: { lastSentAt: true } },
			},
		});

		expect(settled.status).toBe("SENT");
		expect(settled.sentAt).not.toBeNull();
		expect(settled.recipient.lastSentAt).not.toBeNull();
	});
});

describe("a blast", () => {
	test("materialises once per recipient, and twice cannot double-send", async () => {
		const contact = await db.contact.create({
			data: {
				firstName: "Blast",
				lastName: TAG,
				email: `blast.${TAG}@example.test`,
			},
			select: { id: true },
		});

		const segment = await db.marketingSegment.create({
			data: {
				name: `${TAG} segment`,
				definition: { facet: { facet: "contact.hasEmail" } },
			},
			select: { id: true },
		});

		const campaign = await db.marketingCampaign.create({
			data: {
				name: `${TAG} blast`,
				kind: "BLAST",
				status: "SCHEDULED",
				segments: { create: [{ segmentId: segment.id, mode: "INCLUDE" }] },
				scheduledAt: new Date(),
			},
			select: { id: true },
		});

		await db.marketingCampaignNode.create({
			data: {
				campaignId: campaign.id,
				kind: "EMAIL",
				subject: "One send",
				document: { version: 1, blocks: [] },
			},
		});

		const first = await materialise(db, campaign.id);
		const second = await materialise(db, campaign.id);

		expect(first.total).toBeGreaterThan(0);

		const rows = await db.marketingSend.count({
			where: { campaignId: campaign.id, contactId: contact.id },
		});

		expect(rows).toBe(1);
		expect(second.total).toBe(first.total);
	});

	test("an excluded segment beats every included one", async () => {
		seq += 1;
		const suffix = `${TAG}x${seq}`;

		const [wanted, held] = await Promise.all([
			db.contact.create({
				data: {
					firstName: "Wanted",
					lastName: TAG,
					title: `keep-${suffix}`,
					email: `wanted.${suffix}@example.test`,
				},
				select: { id: true },
			}),
			db.contact.create({
				data: {
					firstName: "Held",
					lastName: TAG,
					title: `keep-${suffix} drop-${suffix}`,
					email: `held.${suffix}@example.test`,
				},
				select: { id: true },
			}),
		]);

		const [include, exclude] = await Promise.all([
			db.marketingSegment.create({
				data: {
					name: `${TAG} include ${seq}`,
					definition: {
						facet: { facet: "contact.titleContains", value: `keep-${suffix}` },
					},
				},
				select: { id: true },
			}),
			db.marketingSegment.create({
				data: {
					name: `${TAG} exclude ${seq}`,
					definition: {
						facet: { facet: "contact.titleContains", value: `drop-${suffix}` },
					},
				},
				select: { id: true },
			}),
		]);

		const campaign = await db.marketingCampaign.create({
			data: {
				name: `${TAG} split blast ${seq}`,
				kind: "BLAST",
				status: "SCHEDULED",
				segments: {
					create: [
						{ segmentId: include.id, mode: "INCLUDE" },
						{ segmentId: exclude.id, mode: "EXCLUDE" },
					],
				},
				scheduledAt: new Date(),
				nodes: {
					create: [
						{
							kind: "EMAIL",
							subject: "Only the wanted",
							document: { version: 1, blocks: [] },
						},
					],
				},
			},
			select: { id: true },
		});

		await materialise(db, campaign.id);

		const sends = await db.marketingSend.findMany({
			where: { campaignId: campaign.id },
			select: { contactId: true },
		});

		expect(sends.map((send) => send.contactId)).toEqual([wanted.id]);
		expect(sends.some((send) => send.contactId === held.id)).toBe(false);
	});
});

describe("deliverability", () => {
	async function blastWith(
		outcomes: ("DELIVERED" | "BOUNCED" | "COMPLAINED")[],
	) {
		seq += 1;
		const campaign = await db.marketingCampaign.create({
			data: { name: `${TAG} health ${seq}`, kind: "BLAST", status: "SENDING" },
			select: { id: true },
		});

		const node = await db.marketingCampaignNode.create({
			data: {
				campaignId: campaign.id,
				kind: "EMAIL",
				subject: "s",
				document: { version: 1, blocks: [] },
			},
			select: { id: true },
		});

		for (const [index, status] of outcomes.entries()) {
			const recipient = await db.marketingRecipient.create({
				data: { address: `h${index}.${TAG}x${seq}@example.test` },
				select: { id: true },
			});

			await db.marketingSend.create({
				data: {
					campaignId: campaign.id,
					nodeId: node.id,
					recipientId: recipient.id,
					status,
					dueAt: new Date(),
				},
			});
		}

		return campaign.id;
	}

	test("pauses a campaign bouncing over five per cent, and says why", async () => {
		const bad = Array.from({ length: 100 }, (_unused, index) =>
			index < 8 ? ("BOUNCED" as const) : ("DELIVERED" as const),
		);
		const campaignId = await blastWith(bad);

		const paused = await pauseUnhealthy(db);
		expect(paused).toContain(campaignId);

		const campaign = await db.marketingCampaign.findUniqueOrThrow({
			where: { id: campaignId },
			select: { status: true, pausedReason: true },
		});

		expect(campaign.status).toBe("PAUSED");
		expect(campaign.pausedReason).toContain("bounced");
	});

	test("leaves a healthy campaign alone", async () => {
		const good = Array.from({ length: 100 }, () => "DELIVERED" as const);
		const campaignId = await blastWith(good);

		const paused = await pauseUnhealthy(db);
		expect(paused).not.toContain(campaignId);
	});

	test("does not judge a campaign that has barely sent anything", async () => {
		const campaignId = await blastWith(["BOUNCED", "BOUNCED", "DELIVERED"]);

		const paused = await pauseUnhealthy(db);
		expect(paused).not.toContain(campaignId);
	});
});

describe("retention", () => {
	test("sweeps old delivery events but keeps the evidence for a suppression", async () => {
		seq += 1;
		const recipient = await db.marketingRecipient.create({
			data: { address: `keep.${TAG}x${seq}@example.test` },
			select: { id: true },
		});

		const campaign = await db.marketingCampaign.create({
			data: { name: `${TAG} retention ${seq}`, kind: "BLAST", status: "SENT" },
			select: { id: true },
		});

		const node = await db.marketingCampaignNode.create({
			data: {
				campaignId: campaign.id,
				kind: "EMAIL",
				subject: "s",
				document: { version: 1, blocks: [] },
			},
			select: { id: true },
		});

		const send = await db.marketingSend.create({
			data: {
				campaignId: campaign.id,
				nodeId: node.id,
				recipientId: recipient.id,
				status: "SENT",
				dueAt: new Date(),
			},
			select: { id: true },
		});

		const old = new Date(Date.now() - 200 * 86_400_000);

		await db.marketingEvent.createMany({
			data: [
				{ sendId: send.id, type: "OPENED", at: old },
				{ sendId: send.id, type: "CLICKED", at: old },
				{ sendId: send.id, type: "DELIVERED", at: old },
				{ sendId: send.id, type: "BOUNCED", at: old },
				{ sendId: send.id, type: "COMPLAINED", at: old },
				{ sendId: send.id, type: "UNSUBSCRIBED", at: old },
			],
		});

		await sweepEvents(db, new Date(Date.now() - 90 * 86_400_000));

		const left = await db.marketingEvent.findMany({
			where: { sendId: send.id },
			select: { type: true },
		});

		expect(left.map((row) => row.type).sort()).toEqual([
			"BOUNCED",
			"COMPLAINED",
			"UNSUBSCRIBED",
		]);
	});

	test("says a batch-sized pass is incomplete and finishes on the next one", async () => {
		seq += 1;
		const recipient = await db.marketingRecipient.create({
			data: { address: `passes.${TAG}x${seq}@example.test` },
			select: { id: true },
		});

		const campaign = await db.marketingCampaign.create({
			data: { name: `${TAG} passes ${seq}`, kind: "BLAST", status: "SENT" },
			select: { id: true },
		});

		const send = await db.marketingSend.create({
			data: {
				campaignId: campaign.id,
				recipientId: recipient.id,
				status: "SENT",
				dueAt: new Date(),
			},
			select: { id: true },
		});

		const old = new Date(Date.now() - 200 * 86_400_000);

		await db.marketingEvent.createMany({
			data: [
				{ sendId: send.id, type: "OPENED", at: old },
				{ sendId: send.id, type: "CLICKED", at: old },
				{ sendId: send.id, type: "DELIVERED", at: old },
			],
		});

		const before = new Date(Date.now() - 90 * 86_400_000);
		const first = await sweepEvents(db, before, 2);

		expect(first.removed).toBe(2);
		expect(first.complete).toBe(false);

		let removed = first.removed;
		let complete = first.complete;

		for (
			let pass = 0;
			pass < MARKETING.retention.maxPasses && !complete;
			pass += 1
		) {
			const next = await sweepEvents(db, before, 2);
			removed += next.removed;
			complete = next.complete;
		}

		expect(complete).toBe(true);
		expect(removed).toBeGreaterThanOrEqual(3);
		expect(await db.marketingEvent.count({ where: { sendId: send.id } })).toBe(
			0,
		);
	});

	test("leaves anything inside the window alone", async () => {
		seq += 1;
		const recipient = await db.marketingRecipient.create({
			data: { address: `fresh.${TAG}x${seq}@example.test` },
			select: { id: true },
		});

		const campaign = await db.marketingCampaign.create({
			data: { name: `${TAG} fresh ${seq}`, kind: "BLAST", status: "SENT" },
			select: { id: true },
		});

		const send = await db.marketingSend.create({
			data: {
				campaignId: campaign.id,
				recipientId: recipient.id,
				status: "SENT",
				dueAt: new Date(),
			},
			select: { id: true },
		});

		await db.marketingEvent.create({
			data: { sendId: send.id, type: "OPENED", at: new Date() },
		});

		await sweepEvents(db, new Date(Date.now() - 90 * 86_400_000));

		expect(await db.marketingEvent.count({ where: { sendId: send.id } })).toBe(
			1,
		);
	});
});

describe("quiet hours", () => {
	test("reads a window that wraps midnight", () => {
		expect(isQuiet(3, 20, 8)).toBe(true);
		expect(isQuiet(21, 20, 8)).toBe(true);
		expect(isQuiet(12, 20, 8)).toBe(false);
		expect(isQuiet(9, 9, 9)).toBe(false);
	});

	test("finds the next open hour in the given zone", () => {
		const at = new Date("2026-08-12T02:00:00Z");
		const open = nextOpen(at, "UTC", 20, 8);

		expect(open.getUTCHours()).toBe(8);
		expect(open.getUTCDate()).toBe(12);
	});

	test("pushes a due campaign send forward and leaves a test alone", async () => {
		const drip = await seedDrip();

		const recipient = await db.marketingRecipient.create({
			data: { address: `quiet.${TAG}@example.test` },
			select: { id: true },
		});

		const now = new Date("2026-08-12T02:00:00Z");

		const campaignSend = await db.marketingSend.create({
			data: {
				campaignId: drip.campaignId,
				recipientId: recipient.id,
				origin: "CAMPAIGN",
				status: "QUEUED",
				dueAt: new Date(now.getTime() - 60_000),
			},
			select: { id: true },
		});

		const testSend = await db.marketingSend.create({
			data: {
				campaignId: drip.campaignId,
				recipientId: recipient.id,
				origin: "TEST",
				status: "QUEUED",
				dueAt: new Date(now.getTime() - 60_000),
			},
			select: { id: true },
		});

		const result = await deferQuiet(db, {
			start: 20,
			end: 8,
			timeZone: "UTC",
			now,
		});

		expect(result.until?.getUTCHours()).toBe(8);

		const pushed = await db.marketingSend.findUniqueOrThrow({
			where: { id: campaignSend.id },
			select: { dueAt: true },
		});
		const untouched = await db.marketingSend.findUniqueOrThrow({
			where: { id: testSend.id },
			select: { dueAt: true },
		});

		expect(pushed.dueAt.getTime()).toBe(result.until?.getTime());
		expect(untouched.dueAt.getTime()).toBe(now.getTime() - 60_000);
	});

	test("does nothing outside the window", async () => {
		const result = await deferQuiet(db, {
			start: 20,
			end: 8,
			timeZone: "UTC",
			now: new Date("2026-08-12T12:00:00Z"),
		});

		expect(result.deferred).toBe(0);
		expect(result.until).toBeNull();
	});
});

describe("the daily cap", () => {
	test("skips a recipient who is already at the cap, with the reason on the row", async () => {
		const drip = await seedDrip();

		const recipient = await db.marketingRecipient.create({
			data: { address: `cap.${TAG}@example.test` },
			select: { id: true },
		});

		const now = new Date();

		await db.marketingSend.create({
			data: {
				campaignId: drip.campaignId,
				recipientId: recipient.id,
				status: "SENT",
				dueAt: now,
				sentAt: now,
			},
		});

		const queued = await db.marketingSend.create({
			data: {
				campaignId: drip.campaignId,
				recipientId: recipient.id,
				status: "SENDING",
				dueAt: now,
			},
			select: { id: true },
		});

		const allowed = await skipOverCap(
			db,
			[
				{
					id: queued.id,
					recipientId: recipient.id,
					address: `cap.${TAG}@example.test`,
					token: "t",
					origin: "CAMPAIGN",
					contactId: null,
					campaignId: drip.campaignId,
					nodeId: null,
					subject: null,
					preheader: null,
					document: null,
					replyTo: null,
					attempts: 1,
					hasAttachments: false,
					attachments: [],
				},
			],
			1,
			now,
		);

		expect(allowed).toHaveLength(0);

		const row = await db.marketingSend.findUniqueOrThrow({
			where: { id: queued.id },
			select: { status: true, skipReason: true },
		});

		expect(row.status).toBe("SKIPPED");
		expect(row.skipReason).toBe("daily-cap");
	});

	test("lets everybody through when the cap is zero", async () => {
		const allowed = await skipOverCap(db, [], 0, new Date());
		expect(allowed).toHaveLength(0);
	});

	test("never skips a test send, however many the person already had", async () => {
		const recipient = await db.marketingRecipient.create({
			data: { address: `captest.${TAG}@example.test` },
			select: { id: true },
		});

		const now = new Date();

		await db.marketingSend.create({
			data: {
				recipientId: recipient.id,
				origin: "TEST",
				status: "SENT",
				dueAt: now,
				sentAt: now,
			},
		});

		const queued = await db.marketingSend.create({
			data: {
				recipientId: recipient.id,
				origin: "TEST",
				status: "SENDING",
				dueAt: now,
			},
			select: { id: true },
		});

		const allowed = await skipOverCap(
			db,
			[
				{
					id: queued.id,
					recipientId: recipient.id,
					address: `captest.${TAG}@example.test`,
					token: "t",
					origin: "TEST",
					contactId: null,
					campaignId: null,
					nodeId: null,
					subject: null,
					preheader: null,
					document: null,
					replyTo: null,
					attempts: 1,
					hasAttachments: false,
					attachments: [],
				},
			],
			1,
			now,
		);

		expect(allowed).toHaveLength(1);
	});
});

describe("the segments an install starts with", () => {
	test("creates them once and never twice", async () => {
		const before = await db.marketingSegment.count();
		const made = await ensureDefaultSegments(db);
		const after = await db.marketingSegment.count();

		expect(after - before).toBe(made);
		expect(await ensureDefaultSegments(db)).toBe(0);
	});

	test("a renamed default is not written a second time", async () => {
		await ensureDefaultSegments(db);

		const mine = await db.marketingSegment.findFirstOrThrow({
			where: { isDefault: true },
			select: { id: true, name: true },
		});

		await db.marketingSegment.update({
			where: { id: mine.id },
			data: { name: `${mine.name} — my version` },
		});

		expect(await ensureDefaultSegments(db)).toBe(0);
		expect(
			await db.marketingSegment.count({ where: { name: mine.name } }),
		).toBe(0);

		await db.marketingSegment.update({
			where: { id: mine.id },
			data: { name: mine.name },
		});
	});

	test("every one of them compiles", async () => {
		for (const segment of DEFAULT_SEGMENTS) {
			const parsed = filterSchema.safeParse(segment.definition);
			expect(parsed.success).toBe(true);

			await db.contact.count({
				where: segmentWhere({ definition: segment.definition }),
			});
		}
	});

	test("All contacts holds everybody with an address", async () => {
		const all = DEFAULT_SEGMENTS.find(
			(segment) => segment.name === "All contacts",
		);

		const counted = await db.contact.count({
			where: segmentWhere({ definition: all?.definition }),
		});

		expect(counted).toBe(
			await db.contact.count({ where: { email: { not: null } } }),
		);
	});
});

describe("a send that runs out of attempts", () => {
	async function seedSend(attempts: number) {
		seq += 1;
		const drip = await seedDrip();

		const recipient = await db.marketingRecipient.create({
			data: { address: `retry.${TAG}r${seq}@example.test` },
			select: { id: true },
		});

		return db.marketingSend.create({
			data: {
				campaignId: drip.campaignId,
				recipientId: recipient.id,
				status: "SENDING",
				dueAt: new Date(),
				attempts,
			},
			select: { id: true },
		});
	}

	test("fails on the last attempt rather than queueing forever", async () => {
		const send = await seedSend(MARKETING.drain.maxAttempts);

		await settle(db, send.id, {
			ok: false,
			error: "Resend did not answer.",
			retry: true,
		});

		const row = await db.marketingSend.findUniqueOrThrow({
			where: { id: send.id },
			select: { status: true },
		});

		const events = await db.marketingEvent.count({
			where: { sendId: send.id, type: "FAILED" },
		});

		expect(row.status).toBe("FAILED");
		expect(events).toBe(1);
	});

	test("queues again while an attempt is left", async () => {
		const send = await seedSend(1);

		await settle(db, send.id, {
			ok: false,
			error: "Resend did not answer.",
			retry: true,
		});

		const row = await db.marketingSend.findUniqueOrThrow({
			where: { id: send.id },
			select: { status: true },
		});

		expect(row.status).toBe("QUEUED");
	});
});

describe("opting out", () => {
	async function seedQueued(prefix: string) {
		seq += 1;
		const drip = await seedDrip();

		const recipient = await db.marketingRecipient.create({
			data: { address: `${prefix}.${TAG}o${seq}@example.test` },
			select: { id: true, token: true },
		});

		const send = await db.marketingSend.create({
			data: {
				campaignId: drip.campaignId,
				recipientId: recipient.id,
				status: "QUEUED",
				dueAt: new Date(),
			},
			select: { id: true },
		});

		return { recipient, send };
	}

	test("the one-click link cancels the sends already queued", async () => {
		const { recipient, send } = await seedQueued("oneclick");

		await unsubscribeByToken(db, recipient.token);

		const row = await db.marketingSend.findUniqueOrThrow({
			where: { id: send.id },
			select: { status: true, skipReason: true },
		});

		expect(row.status).toBe("SKIPPED");
		expect(row.skipReason).toBe("unsubscribed");
	});

	test("a bounce cancels the sends already queued", async () => {
		const { recipient, send } = await seedQueued("bounce");

		const address = await db.marketingRecipient.findUniqueOrThrow({
			where: { id: recipient.id },
			select: { address: true },
		});

		await suppress(db, address.address, "BOUNCED", "hard bounce");

		const row = await db.marketingSend.findUniqueOrThrow({
			where: { id: send.id },
			select: { status: true, skipReason: true },
		});

		expect(row.status).toBe("SKIPPED");
		expect(row.skipReason).toBe("bounced");
	});

	test("the claim skips a recipient who is no longer sendable", async () => {
		const { recipient, send } = await seedQueued("claim");

		await db.marketingRecipient.update({
			where: { id: recipient.id },
			data: { status: "COMPLAINED" },
		});

		const claimed = await claimDueSends(db, 50);

		const row = await db.marketingSend.findUniqueOrThrow({
			where: { id: send.id },
			select: { status: true, skipReason: true },
		});

		expect(claimed.some((candidate) => candidate.id === send.id)).toBe(false);
		expect(row.status).toBe("SKIPPED");
		expect(row.skipReason).toBe("complained");
	});
});

describe("a template-backed blast", () => {
	test("queues the template's subject and body, not an empty send", async () => {
		seq += 1;
		const suffix = `${TAG}b${seq}`;

		const contact = await db.contact.create({
			data: {
				firstName: "Bella",
				lastName: TAG,
				title: suffix,
				email: `bella.${suffix}@example.test`,
			},
			select: { id: true },
		});

		const segment = await db.marketingSegment.create({
			data: {
				name: `${TAG} blast segment ${seq}`,
				definition: {
					facet: { facet: "contact.titleContains", value: suffix },
				},
			},
			select: { id: true },
		});

		const template = await db.marketingTemplate.create({
			data: {
				name: `${TAG} blast template ${seq}`,
				subject: "From the template",
				document: { version: 1, blocks: [{ type: "divider" }] },
			},
			select: { id: true },
		});

		const campaign = await db.marketingCampaign.create({
			data: {
				name: `${TAG} template blast ${seq}`,
				kind: "BLAST",
				status: "SCHEDULED",
				segments: { create: [{ segmentId: segment.id, mode: "INCLUDE" }] },
				scheduledAt: new Date(),
			},
			select: { id: true },
		});

		await db.marketingCampaignNode.create({
			data: {
				campaignId: campaign.id,
				kind: "EMAIL",
				templateId: template.id,
			},
		});

		await materialise(db, campaign.id);

		const send = await db.marketingSend.findFirstOrThrow({
			where: { campaignId: campaign.id, contactId: contact.id },
			select: { subject: true, document: true },
		});

		expect(send.subject).toBe("From the template");
		expect(send.document).toEqual({
			version: 1,
			blocks: [{ type: "divider" }],
		});
	});
});
