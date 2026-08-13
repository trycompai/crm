import type { Db, Prisma } from "@crm/db";
import { Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { InjectDatabase } from "../database/database.constants";

const storedRecipient = z.object({
	email: z.string(),
	name: z.string().nullable().catch(null),
	kind: z.string().catch("to"),
});

type StoredRecipient = z.infer<typeof storedRecipient>;

const storedRecipients = z.array(z.json()).catch([]);

@Injectable()
export class ConversationService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async thread(threadId: string) {
		const thread = await this.db.emailThread.findUnique({
			where: { id: threadId },
			select: {
				id: true,
				subject: true,
				messageCount: true,
				firstMessageAt: true,
				lastMessageAt: true,
				company: { select: { id: true, name: true } },
				contact: { select: { id: true, firstName: true, lastName: true } },
				messages: {
					orderBy: { sentAt: "asc" },
					select: {
						id: true,
						direction: true,
						fromEmail: true,
						fromName: true,
						recipients: true,
						subject: true,
						body: true,
						snippet: true,
						sentAt: true,
						gmailMessageId: true,
						outlookWebLink: true,
					},
				},
			},
		});

		if (!thread) {
			throw new NotFoundException(`No email thread with id ${threadId}.`);
		}

		const faces = await this.facesFor(
			thread.messages.map((message) => message.fromEmail),
		);

		return {
			...thread,
			firstMessageAt: thread.firstMessageAt.toISOString(),
			lastMessageAt: thread.lastMessageAt.toISOString(),
			messages: thread.messages.map((message) => ({
				...message,
				sentAt: message.sentAt.toISOString(),
				recipients: recipientsOf(message.recipients),
				fromImageUrl: faces.get(message.fromEmail.toLowerCase()) ?? null,
				mailboxUrl: message.gmailMessageId
					? `https://mail.google.com/mail/u/0/#all/${message.gmailMessageId}`
					: message.outlookWebLink,
				mailboxName: message.gmailMessageId
					? "Gmail"
					: message.outlookWebLink
						? "Outlook"
						: null,
			})),
		};
	}

	private async facesFor(addresses: string[]): Promise<Map<string, string>> {
		const emails = [
			...new Set(addresses.map((address) => address.toLowerCase())),
		];
		if (emails.length === 0) return new Map();

		const [contacts, users] = await Promise.all([
			this.db.contact.findMany({
				where: { email: { in: emails, mode: "insensitive" } },
				select: { email: true, imageUrl: true },
			}),
			this.db.user.findMany({
				where: { email: { in: emails, mode: "insensitive" } },
				select: { email: true, image: true },
			}),
		]);

		const faces = new Map<string, string>();
		for (const contact of contacts) {
			if (contact.email && contact.imageUrl) {
				faces.set(contact.email.toLowerCase(), contact.imageUrl);
			}
		}
		for (const user of users) {
			if (user.image) faces.set(user.email.toLowerCase(), user.image);
		}

		return faces;
	}

	async event(eventId: string) {
		const event = await this.db.calendarEvent.findUnique({
			where: { id: eventId },
			select: {
				id: true,
				title: true,
				description: true,
				location: true,
				conferenceUrl: true,
				startsAt: true,
				endsAt: true,
				isAllDay: true,
				status: true,
				organizerEmail: true,
				company: { select: { id: true, name: true } },
				contact: { select: { id: true, firstName: true, lastName: true } },
				attendees: {
					orderBy: [{ isOrganizer: "desc" }, { email: "asc" }],
					select: {
						id: true,
						email: true,
						name: true,
						responseStatus: true,
						isOrganizer: true,
						contactId: true,
						contact: { select: { imageUrl: true } },
					},
				},
			},
		});

		if (!event) {
			throw new NotFoundException(`No calendar event with id ${eventId}.`);
		}

		return {
			...event,
			startsAt: event.startsAt.toISOString(),
			endsAt: event.endsAt.toISOString(),
			attendees: event.attendees.map(({ contact, ...attendee }) => ({
				...attendee,
				imageUrl: contact?.imageUrl ?? null,
			})),
		};
	}
}

function recipientsOf(value: Prisma.JsonValue): StoredRecipient[] {
	return storedRecipients.parse(value).flatMap((entry) => {
		const parsed = storedRecipient.safeParse(entry);
		return parsed.success ? [parsed.data] : [];
	});
}
