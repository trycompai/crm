import type { Db } from "../client";
import type {
	MarketingConsent,
	MarketingStatus,
} from "../generated/prisma/enums";
import { normalizeEmail } from "../values";

export type SkipReason =
	| "no-address"
	| "unsubscribed"
	| "bounced"
	| "complained"
	| "daily-cap";

export type RecipientRef = {
	id: string;
	address: string;
	token: string;
	status: MarketingStatus;
	contactId: string | null;
};

const SELECT = {
	id: true,
	address: true,
	token: true,
	status: true,
	contactId: true,
} as const;

export async function recipientFor(
	db: Db,
	address: string,
	options: {
		contactId?: string | null;
		consent?: MarketingConsent;
		source?: string;
	} = {},
): Promise<RecipientRef | null> {
	const normalized = normalizeEmail(address);
	if (!normalized) return null;

	return db.marketingRecipient.upsert({
		where: { address: normalized },
		create: {
			address: normalized,
			contactId: options.contactId ?? null,
			consentBasis: options.consent ?? null,
			consentAt: options.consent ? new Date() : null,
			consentSource: options.source ?? null,
		},
		update: options.contactId ? { contactId: options.contactId } : {},
		select: SELECT,
	});
}

export async function recipientsFor(
	db: Db,
	rows: { address: string; contactId?: string | null }[],
): Promise<Map<string, RecipientRef>> {
	const wanted = new Map<string, string | null>();

	for (const row of rows) {
		const normalized = normalizeEmail(row.address);
		if (normalized) wanted.set(normalized, row.contactId ?? null);
	}

	if (wanted.size === 0) return new Map();

	await db.marketingRecipient.createMany({
		data: [...wanted].map(([address, contactId]) => ({ address, contactId })),
		skipDuplicates: true,
	});

	const found = await db.marketingRecipient.findMany({
		where: { address: { in: [...wanted.keys()] } },
		select: SELECT,
	});

	return new Map(found.map((row) => [row.address, row]));
}

export function skipFor(status: MarketingStatus): SkipReason | null {
	if (status === "SUBSCRIBED") return null;
	if (status === "UNSUBSCRIBED") return "unsubscribed";
	if (status === "BOUNCED") return "bounced";
	if (status === "COMPLAINED") return "complained";
	return null;
}

async function cancelQueued(
	db: Db,
	recipientId: string,
	reason: SkipReason,
): Promise<void> {
	await db.marketingSend.updateMany({
		where: { recipientId, status: "QUEUED" },
		data: { status: "SKIPPED", skipReason: reason },
	});
}

export async function suppress(
	db: Db,
	address: string,
	status: Exclude<MarketingStatus, "SUBSCRIBED">,
	reason?: string,
): Promise<void> {
	const normalized = normalizeEmail(address);
	if (!normalized) return;

	const row = await db.marketingRecipient.findUnique({
		where: { address: normalized },
		select: { id: true },
	});

	if (!row) return;

	await db.marketingRecipient.update({
		where: { id: row.id },
		data: { status, statusReason: reason ?? null, statusAt: new Date() },
	});

	const skip = skipFor(status);
	if (skip) await cancelQueued(db, row.id, skip);
}

export async function unsubscribeByToken(
	db: Db,
	token: string,
): Promise<{ address: string } | null> {
	const row = await db.marketingRecipient.findUnique({
		where: { token },
		select: { id: true, address: true },
	});

	if (!row) return null;

	await db.marketingRecipient.update({
		where: { id: row.id },
		data: {
			status: "UNSUBSCRIBED",
			statusReason: "one-click",
			statusAt: new Date(),
		},
	});

	await cancelQueued(db, row.id, "unsubscribed");

	return { address: row.address };
}

export function isSendable(status: MarketingStatus): boolean {
	return status === "SUBSCRIBED";
}
