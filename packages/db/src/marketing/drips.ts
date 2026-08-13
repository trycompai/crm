import type { Db } from "../client";
import type { Prisma } from "../generated/prisma/client";
import type { MarketingExitKind } from "../generated/prisma/enums";
import { campaignAudienceWhere } from "./audience";
import { pickArm } from "./graph";
import { compile, filterSchema } from "./segments";

const DAY_MS = 86_400_000;

type EmailContent = {
	subject: string | null;
	preheader: string | null;
	document: Prisma.InputJsonValue | undefined;
};

export function emailContent(node: {
	subject: string | null;
	preheader: string | null;
	document: Prisma.JsonValue | null;
	template: {
		subject: string;
		preheader: string | null;
		document: Prisma.JsonValue;
	} | null;
}): EmailContent {
	const document = node.document ?? node.template?.document ?? undefined;

	return {
		subject: node.subject?.trim()
			? node.subject
			: (node.template?.subject ?? null),
		preheader: node.preheader?.trim()
			? node.preheader
			: (node.template?.preheader ?? null),
		document: (document ?? undefined) as Prisma.InputJsonValue | undefined,
	};
}

export async function linkReplies(db: Db, since: Date): Promise<number> {
	const inbound = await db.emailMessage.findMany({
		where: { direction: "INBOUND", sentAt: { gte: since } },
		select: { sentAt: true, thread: { select: { contactId: true } } },
	});

	const byContact = new Map<string, Date>();
	for (const message of inbound) {
		const contactId = message.thread?.contactId;
		if (!contactId) continue;
		const current = byContact.get(contactId);
		if (!current || message.sentAt > current)
			byContact.set(contactId, message.sentAt);
	}

	let stamped = 0;

	for (const [contactId, at] of byContact) {
		const result = await db.marketingSend.updateMany({
			where: {
				contactId,
				repliedAt: null,
				sentAt: { not: null, lte: at },
			},
			data: { repliedAt: at },
		});
		stamped += result.count;
	}

	return stamped;
}

async function exitEnrolments(
	db: Db,
	ids: string[],
	kind: MarketingExitKind,
	reason: string,
): Promise<number> {
	if (ids.length === 0) return 0;

	const result = await db.marketingEnrolment.updateMany({
		where: { id: { in: ids }, status: "ACTIVE" },
		data: {
			status: "EXITED",
			exitKind: kind,
			exitReason: reason,
			exitedAt: new Date(),
		},
	});

	await db.marketingSend.updateMany({
		where: { enrolmentId: { in: ids }, status: "QUEUED" },
		data: { status: "SKIPPED", skipReason: reason },
	});

	return result.count;
}

export async function sweepExits(db: Db, campaignId: string): Promise<number> {
	const campaign = await db.marketingCampaign.findUnique({
		where: { id: campaignId },
		select: { exitDefinition: true },
	});

	if (!campaign) return 0;

	let exited = 0;

	const suppressed = await db.marketingEnrolment.findMany({
		where: {
			campaignId,
			status: "ACTIVE",
			recipient: { status: { not: "SUBSCRIBED" } },
		},
		select: { id: true },
	});

	exited += await exitEnrolments(
		db,
		suppressed.map((row) => row.id),
		"SUPPRESSED",
		"no longer subscribed",
	);

	const parsed = campaign.exitDefinition
		? filterSchema.safeParse(campaign.exitDefinition)
		: null;

	if (parsed?.success) {
		const matching = await db.marketingEnrolment.findMany({
			where: {
				campaignId,
				status: "ACTIVE",
				contact: { is: compile(parsed.data) },
			},
			select: { id: true },
		});

		exited += await exitEnrolments(
			db,
			matching.map((row) => row.id),
			"GOAL",
			"met the exit rule",
		);
	}

	return exited;
}

export async function sweepEntries(
	db: Db,
	campaignId: string,
): Promise<number> {
	const campaign = await db.marketingCampaign.findUnique({
		where: { id: campaignId },
		select: {
			id: true,
			entryMode: true,
			entryDefinition: true,
			maxPasses: true,
			reentryCooldownDays: true,
			nodes: { select: { id: true, kind: true } },
			edges: { select: { fromId: true, toId: true } },
		},
	});

	if (campaign?.entryMode !== "CONTINUOUS") return 0;

	let where = await campaignAudienceWhere(db, campaign.id);

	if (!where && campaign.entryDefinition) {
		const parsed = filterSchema.safeParse(campaign.entryDefinition);
		if (parsed.success) where = compile(parsed.data);
	}

	if (!where) return 0;

	const targets = new Set(campaign.edges.map((edge) => edge.toId));
	const root = campaign.nodes.find((node) => !targets.has(node.id));
	if (!root) return 0;

	const candidates = await db.contact.findMany({
		where: {
			AND: [
				where,
				{ email: { not: null } },
				{ marketingEnrolments: { none: { campaignId, status: "ACTIVE" } } },
			],
		},
		select: {
			id: true,
			email: true,
			marketingEnrolments: {
				where: { campaignId },
				select: { pass: true, exitKind: true, exitedAt: true },
				orderBy: { pass: "desc" },
			},
		},
		take: 1000,
	});

	const cooldownMs =
		campaign.reentryCooldownDays === null ||
		campaign.reentryCooldownDays === undefined
			? null
			: campaign.reentryCooldownDays * DAY_MS;

	let enrolled = 0;

	for (const contact of candidates) {
		const history = contact.marketingEnrolments;
		const passes = history.length;

		if (passes >= campaign.maxPasses) continue;
		if (passes > 0 && cooldownMs === null) continue;

		const last = history[0];
		if (last?.exitKind === "SUPPRESSED") continue;
		if (
			last?.exitedAt &&
			cooldownMs !== null &&
			Date.now() - last.exitedAt.getTime() < cooldownMs
		) {
			continue;
		}

		if (!contact.email) continue;

		const recipient = await db.marketingRecipient.findUnique({
			where: { address: contact.email.toLowerCase() },
			select: { id: true, status: true },
		});

		const resolved =
			recipient ??
			(await db.marketingRecipient.create({
				data: { address: contact.email.toLowerCase(), contactId: contact.id },
				select: { id: true, status: true },
			}));

		if (resolved.status !== "SUBSCRIBED") continue;

		await db.marketingEnrolment.create({
			data: {
				campaignId,
				contactId: contact.id,
				recipientId: resolved.id,
				pass: passes + 1,
				currentNodeId: root.id,
				nextDueAt: new Date(),
			},
		});

		enrolled += 1;
	}

	return enrolled;
}

export async function enrolContact(
	db: Db,
	campaignId: string,
	contactId: string,
): Promise<{ ok: true; enrolmentId: string } | { ok: false; reason: string }> {
	const campaign = await db.marketingCampaign.findUnique({
		where: { id: campaignId },
		select: {
			maxPasses: true,
			nodes: { select: { id: true } },
			edges: { select: { toId: true } },
		},
	});

	if (!campaign) return { ok: false, reason: "no such campaign" };

	const contact = await db.contact.findUnique({
		where: { id: contactId },
		select: { email: true },
	});

	if (!contact?.email)
		return { ok: false, reason: "this contact has no email address" };

	const active = await db.marketingEnrolment.findFirst({
		where: { campaignId, contactId, status: "ACTIVE" },
		select: { id: true },
	});

	if (active) return { ok: false, reason: "already in this campaign" };

	const history = await db.marketingEnrolment.count({
		where: { campaignId, contactId },
	});
	if (history >= campaign.maxPasses) {
		return { ok: false, reason: "they have already walked this campaign" };
	}

	const targets = new Set(campaign.edges.map((edge) => edge.toId));
	const root = campaign.nodes.find((node) => !targets.has(node.id));
	if (!root)
		return { ok: false, reason: "this campaign has no starting point" };

	const recipient = await db.marketingRecipient.upsert({
		where: { address: contact.email.toLowerCase() },
		create: { address: contact.email.toLowerCase(), contactId },
		update: { contactId },
		select: { id: true, status: true },
	});

	if (recipient.status !== "SUBSCRIBED") {
		return {
			ok: false,
			reason: `this address is ${recipient.status.toLowerCase()}`,
		};
	}

	const enrolment = await db.marketingEnrolment.create({
		data: {
			campaignId,
			contactId,
			recipientId: recipient.id,
			pass: history + 1,
			currentNodeId: root.id,
			nextDueAt: new Date(),
		},
		select: { id: true },
	});

	return { ok: true, enrolmentId: enrolment.id };
}

export async function advance(db: Db, enrolmentId: string): Promise<void> {
	const enrolment = await db.marketingEnrolment.findUnique({
		where: { id: enrolmentId },
		select: {
			id: true,
			campaignId: true,
			contactId: true,
			recipientId: true,
			pass: true,
			currentNodeId: true,
			campaign: {
				select: {
					fromName: true,
					replyTo: true,
					nodes: {
						select: {
							id: true,
							kind: true,
							subject: true,
							preheader: true,
							document: true,
							delayHours: true,
							condition: true,
							template: {
								select: { subject: true, preheader: true, document: true },
							},
						},
					},
					edges: {
						select: { fromId: true, toId: true, handle: true, weight: true },
					},
				},
			},
		},
	});

	if (!enrolment?.currentNodeId) return;

	const nodes = new Map(
		enrolment.campaign.nodes.map((node) => [node.id, node]),
	);
	const edgesFrom = (id: string) =>
		enrolment.campaign.edges.filter((edge) => edge.fromId === id);

	let cursor: string | null = enrolment.currentNodeId;
	let guard = 0;

	while (cursor && guard < 50) {
		guard += 1;
		const node = nodes.get(cursor);
		if (!node) break;

		if (node.kind === "EXIT") {
			await db.marketingEnrolment.update({
				where: { id: enrolment.id },
				data: {
					status: "COMPLETED",
					currentNodeId: node.id,
					nextDueAt: null,
					exitKind: "RULE",
					exitReason: "reached the end",
					exitedAt: new Date(),
				},
			});
			return;
		}

		if (node.kind === "EMAIL") {
			const content = emailContent(node);

			await db.marketingSend.upsert({
				where: {
					nodeId_recipientId_pass: {
						nodeId: node.id,
						recipientId: enrolment.recipientId,
						pass: enrolment.pass,
					},
				},
				create: {
					campaignId: enrolment.campaignId,
					enrolmentId: enrolment.id,
					nodeId: node.id,
					recipientId: enrolment.recipientId,
					contactId: enrolment.contactId,
					origin: "DRIP",
					pass: enrolment.pass,
					fromName: enrolment.campaign.fromName,
					subject: content.subject,
					preheader: content.preheader,
					document: content.document,
					replyTo: enrolment.campaign.replyTo,
					dueAt: new Date(),
				},
				update: {},
			});

			const next = edgesFrom(node.id)[0];

			if (!next) {
				await db.marketingEnrolment.update({
					where: { id: enrolment.id },
					data: {
						status: "COMPLETED",
						currentNodeId: node.id,
						nextDueAt: null,
						exitKind: "RULE",
						exitReason: "reached the end",
						exitedAt: new Date(),
					},
				});
				return;
			}

			await db.marketingEnrolment.update({
				where: { id: enrolment.id },
				data: { currentNodeId: next.toId, nextDueAt: new Date() },
			});
			return;
		}

		if (node.kind === "WAIT") {
			const next = edgesFrom(node.id)[0];
			if (!next) break;

			await db.marketingEnrolment.update({
				where: { id: enrolment.id },
				data: {
					currentNodeId: next.toId,
					nextDueAt: new Date(Date.now() + (node.delayHours ?? 0) * 3_600_000),
				},
			});
			return;
		}

		if (node.kind === "BRANCH") {
			const parsed = node.condition
				? filterSchema.safeParse(node.condition)
				: null;
			let yes = false;

			if (parsed?.success) {
				const hit = await db.contact.findFirst({
					where: { AND: [compile(parsed.data), { id: enrolment.contactId }] },
					select: { id: true },
				});
				yes = hit !== null;
			}

			const arm = edgesFrom(node.id).find(
				(edge) => (edge.handle ?? "next") === (yes ? "yes" : "no"),
			);

			if (!arm) break;
			cursor = arm.toId;
			continue;
		}

		if (node.kind === "SPLIT") {
			const arm = pickArm(edgesFrom(node.id), `${enrolment.id}:${node.id}`);
			if (!arm) break;
			cursor = arm.toId;
			continue;
		}

		break;
	}

	await db.marketingEnrolment.update({
		where: { id: enrolment.id },
		data: {
			status: "COMPLETED",
			nextDueAt: null,
			exitKind: "RULE",
			exitReason: "reached the end",
			exitedAt: new Date(),
		},
	});
}

export async function advanceDue(db: Db, limit = 200): Promise<number> {
	const due = await db.marketingEnrolment.findMany({
		where: {
			status: "ACTIVE",
			nextDueAt: { lte: new Date() },
			campaign: { status: { in: ["ACTIVE", "DRAINING"] } },
		},
		select: { id: true },
		orderBy: { nextDueAt: "asc" },
		take: limit,
	});

	for (const enrolment of due) {
		await advance(db, enrolment.id);
	}

	return due.length;
}

export async function archiveDrained(db: Db): Promise<void> {
	const draining = await db.marketingCampaign.findMany({
		where: { status: "DRAINING" },
		select: { id: true },
	});

	for (const campaign of draining) {
		const active = await db.marketingEnrolment.count({
			where: { campaignId: campaign.id, status: "ACTIVE" },
		});

		if (active === 0) {
			await db.marketingCampaign.update({
				where: { id: campaign.id },
				data: { status: "ARCHIVED", finishedAt: new Date() },
			});
		}
	}
}
