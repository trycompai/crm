import { ActivityType, type Db, type Prisma } from "@crm/db";
import { Injectable } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

export type FiledSend = {
	contactId: string;
	subject: string | null;
	campaignName: string | null;
	sentAt: Date;
};

@Injectable()
export class MarketingActivityService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	/**
	 * One row per send, so a rep opening a contact sees the marketing email
	 * beside the sales one. It never touches `lastActivityAt`: an email we sent
	 * is not the contact being active, and bumping it would reset "Quiet for 60
	 * days" with our own campaign.
	 */
	async file(sends: FiledSend[]): Promise<number> {
		if (sends.length === 0) return 0;

		const contacts = await this.contacts(sends.map((send) => send.contactId));
		if (contacts.size === 0) return 0;

		const rows: Prisma.ActivityCreateManyInput[] = [];

		for (const send of sends) {
			const contact = contacts.get(send.contactId);
			if (!contact) continue;

			rows.push({
				type: ActivityType.EMAIL,
				subject: send.subject?.trim() || "A marketing email",
				body: send.campaignName,
				contactId: send.contactId,
				companyId: contact.companyId,
				occurredAt: send.sentAt,
				createdById: contact.author,
				meta: { automated: true, source: "marketing" },
			});
		}

		if (rows.length === 0) return 0;

		const result = await this.db.activity.createMany({ data: rows });
		return result.count;
	}

	private async contacts(
		contactIds: string[],
	): Promise<Map<string, { author: string; companyId: string | null }>> {
		const unique = [...new Set(contactIds)];
		if (unique.length === 0) return new Map();

		const rows = await this.db.contact.findMany({
			where: { id: { in: unique } },
			select: { id: true, ownerId: true, companyId: true },
		});

		const unowned = rows.some((contact) => contact.ownerId === null);

		const fallback = unowned
			? await this.db.user.findFirst({ select: { id: true } })
			: null;

		const contacts = new Map<
			string,
			{ author: string; companyId: string | null }
		>();

		for (const row of rows) {
			const author = row.ownerId ?? fallback?.id ?? null;
			if (author) {
				contacts.set(row.id, { author, companyId: row.companyId });
			}
		}

		return contacts;
	}
}
