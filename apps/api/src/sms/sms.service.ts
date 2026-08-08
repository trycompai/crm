import {
	ActivityType,
	type Db,
	type Prisma,
	SmsDirection,
	SmsStatus,
} from "@crm/db";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { FACET_ALL, type ListResult, paginate } from "../trpc/list-input";
import type { SmsSendInput, SmsThreadListInput } from "./sms.contracts";
import { TwilioClient } from "./twilio.client";

export type SmsThreadRow = {
	id: string;
	ourNumber: string;
	theirNumber: string;
	lastMessageAt: string;
	lastPreview: string | null;
	unreadCount: number;
	contact: {
		id: string;
		firstName: string;
		lastName: string | null;
		imageUrl: string | null;
	} | null;
	clientAccountId: string | null;
};

function normalizeNumber(input: string): string {
	const trimmed = input.trim();
	if (trimmed.startsWith("+"))
		return `+${trimmed.slice(1).replace(/[^0-9]/g, "")}`;
	const digits = trimmed.replace(/[^0-9]/g, "");
	return `+${digits}`;
}

@Injectable()
export class SmsService {
	private readonly logger = new Logger(SmsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly twilio: TwilioClient,
	) {}

	async list(input: SmsThreadListInput): Promise<ListResult<SmsThreadRow>> {
		const where: Prisma.SmsThreadWhereInput = {};
		if (input.q.trim()) {
			where.OR = [
				{ theirNumber: { contains: input.q } },
				{ lastPreview: { contains: input.q, mode: "insensitive" } },
				{
					contact: {
						OR: [
							{ firstName: { contains: input.q, mode: "insensitive" } },
							{ lastName: { contains: input.q, mode: "insensitive" } },
						],
					},
				},
			];
		}
		if (input.unread === "unread") where.unreadCount = { gt: 0 };
		if (input.clientAccountId !== FACET_ALL) {
			where.clientAccountId = input.clientAccountId;
		}
		const { skip, take } = paginate(input);
		const [rows, total, unreadCount] = await Promise.all([
			this.db.smsThread.findMany({
				where,
				orderBy: { lastMessageAt: "desc" },
				skip,
				take,
				include: {
					contact: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							imageUrl: true,
						},
					},
				},
			}),
			this.db.smsThread.count({ where }),
			this.db.smsThread.count({ where: { unreadCount: { gt: 0 } } }),
		]);

		return {
			rows: rows.map((row) => ({
				id: row.id,
				ourNumber: row.ourNumber,
				theirNumber: row.theirNumber,
				lastMessageAt: row.lastMessageAt.toISOString(),
				lastPreview: row.lastPreview,
				unreadCount: row.unreadCount,
				contact: row.contact,
				clientAccountId: row.clientAccountId,
			})),
			total,
			facetCounts: {
				unread: { unread: unreadCount, all: total },
			},
		};
	}

	async thread(id: string) {
		const thread = await this.db.smsThread.findUnique({
			where: { id },
			include: {
				contact: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						imageUrl: true,
						email: true,
					},
				},
				messages: { orderBy: { sentAt: "asc" } },
			},
		});
		if (!thread) throw new NotFoundException("Thread not found");
		return {
			id: thread.id,
			ourNumber: thread.ourNumber,
			theirNumber: thread.theirNumber,
			lastMessageAt: thread.lastMessageAt.toISOString(),
			unreadCount: thread.unreadCount,
			contact: thread.contact,
			clientAccountId: thread.clientAccountId,
			messages: thread.messages.map((msg) => ({
				id: msg.id,
				direction: msg.direction,
				body: msg.body,
				status: msg.status,
				sentAt: msg.sentAt.toISOString(),
				errorMessage: msg.errorMessage,
			})),
		};
	}

	async send(input: SmsSendInput, userId: string) {
		if (!this.twilio.enabled) {
			throw new BadRequestException("Twilio is not configured.");
		}
		const to = normalizeNumber(input.to);
		const from = this.twilio.fromNumber ?? "";
		if (!from) {
			throw new BadRequestException(
				"TWILIO_FROM_NUMBER is not configured for outbound SMS.",
			);
		}

		let contactId = input.contactId ?? null;
		if (!contactId) {
			const existing = await this.db.contact.findFirst({
				where: { phone: to },
				select: { id: true },
			});
			contactId = existing?.id ?? null;
		}

		const thread = await this.upsertThread({
			ourNumber: from,
			theirNumber: to,
			contactId,
			clientAccountId: input.clientAccountId ?? null,
		});

		const message = await this.db.smsMessage.create({
			data: {
				threadId: thread.id,
				direction: SmsDirection.OUTBOUND,
				status: SmsStatus.QUEUED,
				body: input.body,
			},
		});

		try {
			const result = await this.twilio.send({ to, body: input.body, from });
			await this.db.smsMessage.update({
				where: { id: message.id },
				data: {
					providerSid: result.sid,
					status: SmsStatus.SENT,
					sentAt: new Date(),
				},
			});
			await this.db.smsThread.update({
				where: { id: thread.id },
				data: {
					lastMessageAt: new Date(),
					lastPreview: input.body.slice(0, 160),
				},
			});
			if (contactId) {
				await this.db.activity.create({
					data: {
						type: ActivityType.SMS,
						subject: `SMS to ${to}`,
						body: input.body,
						contactId,
						createdById: userId,
						meta: { direction: "OUTBOUND", threadId: thread.id },
					},
				});
			}
			return { id: message.id, sid: result.sid, status: result.status };
		} catch (err) {
			await this.db.smsMessage.update({
				where: { id: message.id },
				data: {
					status: SmsStatus.FAILED,
					errorMessage: err instanceof Error ? err.message : String(err),
				},
			});
			throw err;
		}
	}

	async markRead(threadId: string) {
		await this.db.smsThread.update({
			where: { id: threadId },
			data: { unreadCount: 0 },
		});
		return { ok: true };
	}

	async handleInbound(params: {
		messageSid: string;
		from: string;
		to: string;
		body: string;
		receivedAt?: Date;
	}) {
		const our = normalizeNumber(params.to);
		const their = normalizeNumber(params.from);
		const existing = await this.db.smsMessage.findUnique({
			where: { providerSid: params.messageSid },
		});
		if (existing) return existing;

		const contact = await this.db.contact.findFirst({
			where: { phone: their },
			select: { id: true, clientAccountId: true },
		});

		const thread = await this.upsertThread({
			ourNumber: our,
			theirNumber: their,
			contactId: contact?.id ?? null,
			clientAccountId: contact?.clientAccountId ?? null,
		});

		const message = await this.db.smsMessage.create({
			data: {
				threadId: thread.id,
				direction: SmsDirection.INBOUND,
				status: SmsStatus.RECEIVED,
				body: params.body,
				providerSid: params.messageSid,
				sentAt: params.receivedAt ?? new Date(),
			},
		});

		await this.db.smsThread.update({
			where: { id: thread.id },
			data: {
				lastMessageAt: message.sentAt,
				lastPreview: params.body.slice(0, 160),
				unreadCount: { increment: 1 },
			},
		});

		if (contact) {
			await this.db.activity
				.create({
					data: {
						type: ActivityType.SMS,
						subject: `SMS from ${their}`,
						body: params.body,
						contactId: contact.id,
						createdById: (await this.systemUserId()) ?? contact.id,
						meta: { direction: "INBOUND", threadId: thread.id },
					},
				})
				.catch(() => undefined);
		}

		return message;
	}

	private async systemUserId(): Promise<string | null> {
		const user = await this.db.user.findFirst({
			orderBy: { createdAt: "asc" },
			select: { id: true },
		});
		return user?.id ?? null;
	}

	private async upsertThread(input: {
		ourNumber: string;
		theirNumber: string;
		contactId: string | null;
		clientAccountId: string | null;
	}) {
		return this.db.smsThread.upsert({
			where: {
				ourNumber_theirNumber: {
					ourNumber: input.ourNumber,
					theirNumber: input.theirNumber,
				},
			},
			create: {
				ourNumber: input.ourNumber,
				theirNumber: input.theirNumber,
				contactId: input.contactId,
				clientAccountId: input.clientAccountId,
			},
			update: {
				contactId: input.contactId ?? undefined,
				clientAccountId: input.clientAccountId ?? undefined,
			},
		});
	}
}
