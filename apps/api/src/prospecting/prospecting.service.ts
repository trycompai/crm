import { createHash, randomUUID } from "node:crypto";
import { GMAIL_SEND_SCOPE } from "@crm/auth";
import {
	ConsentStatus,
	type Db,
	OutreachRole,
	OutreachStatus,
	OutreachStep,
	type Prisma,
	ProductKey,
	ProspectStatus,
} from "@crm/db";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { GmailClient } from "../google/gmail.client";
import { GoogleTokenService } from "../google/google-token.service";
import { header } from "../google/mime";
import { paginate, resolveOrderBy } from "../trpc/list-input";
import type {
	ComplianceSnapshotInput,
	InboundLead,
	InboundSuppression,
	ProductUpdateInput,
	ProspectDraftInput,
	ProspectListInput,
} from "./prospecting.contracts";

const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.ProspectCandidateOrderByWithRelationInput[]
> = {
	name: (dir) => [{ name: dir }],
	score: (dir) => [{ totalScore: dir }, { createdAt: "desc" }],
	status: (dir) => [{ status: dir }, { totalScore: "desc" }],
	createdAt: (dir) => [{ createdAt: dir }],
};

@Injectable()
export class ProspectingService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly tokens: GoogleTokenService,
		private readonly gmail: GmailClient,
	) {}

	async products() {
		return this.db.product.findMany({
			orderBy: { name: "asc" },
			include: {
				senderUser: { select: { id: true, name: true, email: true } },
			},
		});
	}

	async list(input: ProspectListInput) {
		const where: Prisma.ProspectCandidateWhereInput = {};
		const q = input.q.trim();
		if (q) {
			where.OR = [
				{ name: { contains: q, mode: "insensitive" } },
				{ companyName: { contains: q, mode: "insensitive" } },
				{ domain: { contains: q, mode: "insensitive" } },
				{ email: { contains: q, mode: "insensitive" } },
			];
		}
		if (input.product !== "all") where.productId = input.product;
		if (input.status !== "all") where.status = input.status;

		const { skip, take } = paginate(input);
		const [rows, total, statusCounts, productCounts] = await Promise.all([
			this.db.prospectCandidate.findMany({
				where,
				skip,
				take,
				orderBy: resolveOrderBy(input, SORTABLE, [
					{ totalScore: "desc" },
					{ createdAt: "desc" },
				]),
				select: {
					id: true,
					productId: true,
					kind: true,
					status: true,
					name: true,
					companyName: true,
					domain: true,
					email: true,
					countryCode: true,
					title: true,
					totalScore: true,
					fitScore: true,
					intentScore: true,
					contactabilityScore: true,
					consentStatus: true,
					eligibilityReason: true,
					createdAt: true,
					_count: { select: { evidence: true, messages: true } },
				},
			}),
			this.db.prospectCandidate.count({ where }),
			this.db.prospectCandidate.groupBy({
				by: ["status"],
				where:
					input.product === "all" ? undefined : { productId: input.product },
				_count: { _all: true },
			}),
			this.db.prospectCandidate.groupBy({
				by: ["productId"],
				where: input.status === "all" ? undefined : { status: input.status },
				_count: { _all: true },
			}),
		]);

		return {
			rows: rows.map(({ createdAt, ...row }) => ({
				...row,
				createdAt: createdAt.toISOString(),
			})),
			total,
			facetCounts: {
				status: Object.fromEntries(
					statusCounts.map((row) => [row.status, row._count._all]),
				),
				product: Object.fromEntries(
					productCounts.map((row) => [row.productId, row._count._all]),
				),
			},
		};
	}

	async byId(id: string) {
		const candidate = await this.db.prospectCandidate.findUnique({
			where: { id },
			include: {
				product: {
					include: {
						senderUser: { select: { id: true, name: true, email: true } },
					},
				},
				evidence: { orderBy: { observedAt: "desc" } },
				messages: { orderBy: { createdAt: "asc" } },
			},
		});
		if (!candidate) throw new NotFoundException("Prospect not found.");
		return candidate;
	}

	async approveCandidate(id: string, userId: string) {
		await this.requireReviewer(userId);
		const candidate = await this.requireCandidate(id);
		if (candidate.status !== ProspectStatus.REVIEW) {
			throw new BadRequestException(
				"Only review-ready prospects can be approved.",
			);
		}
		if (candidate.totalScore < 70) {
			throw new BadRequestException(
				"This prospect has not reached the review threshold.",
			);
		}
		return this.db.prospectCandidate.update({
			where: { id },
			data: {
				status: ProspectStatus.APPROVED,
				reviewedById: userId,
				reviewedAt: new Date(),
			},
		});
	}

	async rejectCandidate(id: string, reason: string, userId: string) {
		await this.requireReviewer(userId);
		await this.requireCandidate(id);
		return this.db.prospectCandidate.update({
			where: { id },
			data: {
				status: ProspectStatus.REJECTED,
				eligibilityReason: reason,
				reviewedById: userId,
				reviewedAt: new Date(),
				retentionExpiresAt: daysFromNow(90),
				messages: {
					updateMany: {
						where: {
							status: { in: [OutreachStatus.DRAFT, OutreachStatus.APPROVED] },
						},
						data: { status: OutreachStatus.CANCELLED },
					},
				},
			},
		});
	}

	async suppressCandidate(id: string, reason: string, userId: string) {
		await this.requireReviewer(userId);
		const candidate = await this.requireCandidate(id);
		const fingerprint = suppressionFingerprint(
			candidate.productId,
			candidate.emailHash,
			candidate.domain,
			candidate.id,
		);

		return this.db.$transaction(async (tx) => {
			await tx.suppressionEntry.upsert({
				where: { fingerprint },
				create: {
					productId: candidate.productId,
					fingerprint,
					emailHash: candidate.emailHash,
					domain: candidate.domain,
					reason,
					source: "manual-review",
				},
				update: { reason, source: "manual-review" },
			});
			return tx.prospectCandidate.update({
				where: { id },
				data: {
					status: ProspectStatus.SUPPRESSED,
					eligibilityReason: reason,
					reviewedById: userId,
					reviewedAt: new Date(),
					messages: {
						updateMany: {
							where: {
								status: { in: [OutreachStatus.DRAFT, OutreachStatus.APPROVED] },
							},
							data: { status: OutreachStatus.CANCELLED },
						},
					},
				},
			});
		});
	}

	async saveDraft(input: ProspectDraftInput, userId: string) {
		await this.requireReviewer(userId);
		const candidate = await this.requireCandidate(input.candidateId);
		if (
			!new Set<ProspectStatus>([
				ProspectStatus.REVIEW,
				ProspectStatus.APPROVED,
				ProspectStatus.CONTACTED,
			]).has(candidate.status)
		) {
			throw new BadRequestException(
				"This prospect cannot receive an outreach draft.",
			);
		}

		const contentHash = messageHash(input);
		const defaultSchedule = await this.defaultFollowUpSchedule(
			input.candidateId,
			input.step,
			input.subject,
		);
		const scheduledAt = input.scheduledAt
			? new Date(input.scheduledAt)
			: defaultSchedule;
		if (defaultSchedule && scheduledAt && scheduledAt < defaultSchedule) {
			throw new BadRequestException(
				"This follow-up is scheduled before its business-day delay.",
			);
		}
		return this.db.outreachMessage.upsert({
			where: {
				candidateId_step: {
					candidateId: input.candidateId,
					step: input.step,
				},
			},
			create: {
				candidateId: input.candidateId,
				step: input.step,
				recipientEmail: normaliseEmail(input.recipientEmail),
				subject: input.subject,
				body: input.body,
				contentHash,
				idempotencyKey: randomUUID(),
				scheduledAt,
			},
			update: {
				recipientEmail: normaliseEmail(input.recipientEmail),
				subject: input.subject,
				body: input.body,
				contentHash,
				status: OutreachStatus.DRAFT,
				approvedAt: null,
				approvedById: null,
				failureReason: null,
				scheduledAt,
			},
		});
	}

	async approveMessage(id: string, userId: string) {
		await this.requireReviewer(userId);
		const message = await this.db.outreachMessage.findUnique({
			where: { id },
			include: { candidate: { include: { product: true } } },
		});
		if (!message) throw new NotFoundException("Outreach message not found.");
		if (
			message.status !== OutreachStatus.DRAFT &&
			message.status !== OutreachStatus.FAILED
		) {
			throw new BadRequestException(
				"Only a draft or failed message can be approved.",
			);
		}
		if (!message.candidate.product.commercialReadyAt) {
			throw new BadRequestException(
				"This product is not commercially ready for sending.",
			);
		}
		if (!message.candidate.product.senderUserId) {
			throw new BadRequestException("This product has no sender mailbox.");
		}
		await this.assertNotSuppressed(message.candidate);

		return this.db.outreachMessage.update({
			where: { id },
			data: {
				status: OutreachStatus.APPROVED,
				approvedById: userId,
				approvedAt: new Date(),
			},
		});
	}

	async sendApproved(id: string, userId: string) {
		await this.requireReviewer(userId);
		const message = await this.db.outreachMessage.findUnique({
			where: { id },
			include: { candidate: { include: { product: true } } },
		});
		if (!message) throw new NotFoundException("Outreach message not found.");
		if (message.status !== OutreachStatus.APPROVED || !message.approvedAt) {
			throw new BadRequestException("This message has not been approved.");
		}
		if (message.scheduledAt && message.scheduledAt > new Date()) {
			throw new BadRequestException(
				"This approved message is scheduled for later.",
			);
		}
		const product = message.candidate.product;
		if (!product.senderUserId || !product.commercialReadyAt) {
			throw new BadRequestException(
				"The product sender or commercial readiness is missing.",
			);
		}
		await this.assertEligibleForSend(message.candidate);
		await this.claimWithinDailyCap(id, product.id, product.outreachDailyCap);

		const token = await this.tokens.accessTokenWithScope(
			product.senderUserId,
			GMAIL_SEND_SCOPE,
			"Gmail send",
		);
		if (token.outcome !== "ok") {
			await this.failMessage(id, token.reason);
			throw new BadRequestException(token.reason);
		}
		const previous =
			message.step === "FIRST_TOUCH"
				? null
				: await this.db.outreachMessage.findFirst({
						where: {
							candidateId: message.candidateId,
							status: OutreachStatus.SENT,
						},
						orderBy: { sentAt: "asc" },
						select: { gmailThreadId: true, rfcMessageId: true },
					});
		const result = await this.gmail.sendMessage(token.accessToken, {
			to: message.recipientEmail,
			subject: message.subject,
			body: message.body,
			threadId: previous?.gmailThreadId,
			inReplyTo: previous?.rfcMessageId,
		});
		if (result.outcome !== "ok" || !result.data.id) {
			const reason =
				result.outcome === "ok"
					? "Gmail returned no message id."
					: result.reason;
			await this.failMessage(id, reason);
			throw new BadRequestException(reason);
		}

		const sentMessage = await this.gmail.getMessage(
			token.accessToken,
			result.data.id,
		);
		const rfcMessageId =
			sentMessage.outcome === "ok"
				? header(sentMessage.data.payload?.headers, "message-id")
				: null;
		const now = new Date();
		return this.db.$transaction(async (tx) => {
			const sent = await tx.outreachMessage.update({
				where: { id },
				data: {
					status: OutreachStatus.SENT,
					gmailMessageId: result.data.id,
					gmailThreadId:
						result.data.threadId ?? previous?.gmailThreadId ?? null,
					rfcMessageId,
					sentAt: now,
				},
			});
			await tx.prospectCandidate.update({
				where: { id: message.candidateId },
				data: {
					status: ProspectStatus.CONTACTED,
					contactedAt: message.candidate.contactedAt ?? now,
					retentionExpiresAt: daysFromNow(730),
				},
			});
			return sent;
		});
	}

	async updateProduct(input: ProductUpdateInput, userId: string) {
		await this.requireAdmin(userId);
		const { id, commercialReady, ...data } = input;
		const current = await this.db.product.findUnique({
			where: { id },
			select: { nextDiscoveryAt: true },
		});
		if (!current) throw new NotFoundException("Product not found.");
		return this.db.product.update({
			where: { id },
			data: {
				...data,
				...(commercialReady === undefined
					? {}
					: { commercialReadyAt: commercialReady ? new Date() : null }),
				...(input.active === true && !current.nextDiscoveryAt
					? { nextDiscoveryAt: new Date() }
					: {}),
			},
		});
	}

	async importPortugueseDgc(input: ComplianceSnapshotInput, userId: string) {
		await this.requireAdmin(userId);
		const domains = [
			...new Set(input.domains.map(normaliseDomain).filter(isString)),
		].sort();
		if (domains.length === 0)
			throw new BadRequestException("The DGC list has no valid domains.");
		const checksum = hash(domains.join("\n"));
		return this.db.complianceSnapshot.upsert({
			where: { checksum },
			create: {
				jurisdiction: "PT_DGC",
				source: input.source,
				checksum,
				effectiveAt: new Date(input.effectiveAt),
				entryCount: domains.length,
				data: domains,
			},
			update: {
				source: input.source,
				effectiveAt: new Date(input.effectiveAt),
				entryCount: domains.length,
				data: domains,
			},
			select: { id: true, checksum: true, effectiveAt: true, entryCount: true },
		});
	}

	async convert(id: string, userId: string) {
		await this.requireReviewer(userId);
		const candidate = await this.db.prospectCandidate.findUnique({
			where: { id },
			include: { product: true },
		});
		if (!candidate) throw new NotFoundException("Prospect not found.");
		if (
			candidate.status !== ProspectStatus.REPLIED &&
			candidate.status !== ProspectStatus.QUALIFIED
		) {
			throw new BadRequestException(
				"Only a replied or qualified prospect can be converted.",
			);
		}
		if (candidate.convertedDealId) return { dealId: candidate.convertedDealId };

		return this.db.$transaction(async (tx) => {
			let companyId: string | null = null;
			if (candidate.domain) {
				const company = await tx.company.upsert({
					where: { domain: candidate.domain },
					create: {
						name: candidate.companyName ?? candidate.name,
						domain: candidate.domain,
						website: candidate.website,
						countryCode: candidate.countryCode,
						source: "PROSPECTING",
						ownerId: userId,
					},
					update: {},
					select: { id: true },
				});
				companyId = company.id;
			}

			let contactId: string | null = null;
			if (candidate.email) {
				const [firstName, ...rest] = candidate.name.trim().split(/\s+/);
				const contact = await tx.contact.upsert({
					where: { email: candidate.email },
					create: {
						firstName: firstName || candidate.email,
						lastName: rest.join(" ") || null,
						email: candidate.email,
						title: candidate.title,
						companyId,
						ownerId: userId,
						source: "PROSPECTING",
					},
					update: companyId ? { companyId } : {},
					select: { id: true },
				});
				contactId = contact.id;
			}

			const deal = await tx.deal.create({
				data: {
					name: `${candidate.product.name} — ${candidate.companyName ?? candidate.name}`,
					companyId,
					ownerId: userId,
					productId: candidate.productId,
					currency: "EUR",
					...(contactId
						? { contacts: { create: { contactId, role: candidate.title } } }
						: {}),
				},
				select: { id: true },
			});
			await tx.prospectCandidate.update({
				where: { id },
				data: {
					status: ProspectStatus.CONVERTED,
					convertedCompanyId: companyId,
					convertedContactId: contactId,
					convertedDealId: deal.id,
				},
			});
			return { dealId: deal.id, companyId, contactId };
		});
	}

	async ingest(input: InboundLead) {
		const email = normaliseEmail(input.lead.email);
		const emailHash = hash(email);
		const domain = normaliseDomain(input.lead.domain ?? email.split("@")[1]);
		const retentionExpiresAt = daysFromNow(730);

		const existingEvent = await this.db.inboundLeadEvent.findUnique({
			where: {
				productId_eventId: { productId: input.product, eventId: input.eventId },
			},
			include: { candidate: { select: { id: true, status: true } } },
		});
		if (existingEvent) return existingEvent.candidate;

		try {
			return await this.db.$transaction(async (tx) => {
				const candidate = await tx.prospectCandidate.upsert({
					where: {
						productId_emailHash: { productId: input.product, emailHash },
					},
					create: {
						productId: input.product,
						kind: input.lead.kind,
						name: input.lead.name ?? input.lead.companyName ?? email,
						companyName: input.lead.companyName,
						domain,
						email,
						emailHash,
						countryCode: input.lead.countryCode?.toUpperCase(),
						source: "product-form",
						sourceExternalId: input.eventId,
						consentStatus: ConsentStatus.GRANTED,
						consentCapturedAt: new Date(input.lead.consent.capturedAt),
						consentPolicyVersion: input.lead.consent.policyVersion,
						consentSource: input.lead.consent.source,
						contactabilityScore: 20,
						retentionExpiresAt,
					},
					update: {
						name: input.lead.name ?? input.lead.companyName ?? email,
						companyName: input.lead.companyName,
						domain,
						countryCode: input.lead.countryCode?.toUpperCase(),
						sourceExternalId: input.eventId,
						consentStatus: ConsentStatus.GRANTED,
						consentCapturedAt: new Date(input.lead.consent.capturedAt),
						consentPolicyVersion: input.lead.consent.policyVersion,
						consentSource: input.lead.consent.source,
						contactabilityScore: 20,
						retentionExpiresAt,
					},
					select: { id: true, status: true },
				});
				await tx.inboundLeadEvent.create({
					data: {
						productId: input.product,
						eventId: input.eventId,
						candidateId: candidate.id,
						occurredAt: new Date(input.occurredAt),
					},
				});
				return candidate;
			});
		} catch (error) {
			if (hasPrismaCode(error, "P2002")) {
				const replay = await this.db.inboundLeadEvent.findUnique({
					where: {
						productId_eventId: {
							productId: input.product,
							eventId: input.eventId,
						},
					},
					include: { candidate: { select: { id: true, status: true } } },
				});
				if (replay) return replay.candidate;
			}
			throw error;
		}
	}

	async ingestSuppression(input: InboundSuppression) {
		const email = normaliseEmail(input.email);
		const emailHash = hash(email);
		const fingerprint = `${input.product}:${emailHash}`;
		return this.db.$transaction(async (tx) => {
			await tx.suppressionEntry.upsert({
				where: { fingerprint },
				create: {
					productId: input.product,
					fingerprint,
					emailHash,
					reason: input.reason,
					source: `product-event:${input.eventId}`,
				},
				update: {
					reason: input.reason,
					source: `product-event:${input.eventId}`,
				},
			});
			const candidates = await tx.prospectCandidate.findMany({
				where: { productId: input.product, emailHash },
				select: { id: true },
			});
			if (candidates.length > 0) {
				const ids = candidates.map((candidate) => candidate.id);
				await tx.prospectCandidate.updateMany({
					where: { id: { in: ids } },
					data: {
						status: ProspectStatus.SUPPRESSED,
						eligibilityReason: input.reason,
					},
				});
				await tx.outreachMessage.updateMany({
					where: {
						candidateId: { in: ids },
						status: { in: [OutreachStatus.DRAFT, OutreachStatus.APPROVED] },
					},
					data: { status: OutreachStatus.CANCELLED },
				});
			}
		});
	}

	private async requireCandidate(id: string) {
		const candidate = await this.db.prospectCandidate.findUnique({
			where: { id },
		});
		if (!candidate) throw new NotFoundException("Prospect not found.");
		return candidate;
	}

	private async requireReviewer(userId: string) {
		const user = await this.db.user.findUnique({
			where: { id: userId },
			select: { outreachRole: true },
		});
		if (!user || user.outreachRole === OutreachRole.VIEWER) {
			throw new ForbiddenException(
				"Prospecting review permission is required.",
			);
		}
	}

	private async requireAdmin(userId: string) {
		const user = await this.db.user.findUnique({
			where: { id: userId },
			select: { outreachRole: true },
		});
		if (user?.outreachRole !== OutreachRole.ADMIN) {
			throw new ForbiddenException("Prospecting admin permission is required.");
		}
	}

	private async assertNotSuppressed(candidate: {
		id: string;
		productId: ProductKey;
		emailHash: string | null;
		domain: string | null;
	}) {
		const blocked = await this.db.suppressionEntry.findFirst({
			where: {
				AND: [
					{ OR: [{ productId: null }, { productId: candidate.productId }] },
					{
						OR: [
							...(candidate.emailHash
								? [{ emailHash: candidate.emailHash }]
								: []),
							...(candidate.domain ? [{ domain: candidate.domain }] : []),
						],
					},
				],
			},
			select: { id: true },
		});
		if (blocked) throw new BadRequestException("This recipient is suppressed.");
	}

	private async assertEligibleForSend(candidate: {
		id: string;
		productId: ProductKey;
		kind: string;
		consentStatus: string;
		countryCode: string | null;
		emailHash: string | null;
		domain: string | null;
	}) {
		await this.assertNotSuppressed(candidate);
		if (
			candidate.kind === "INDIVIDUAL" &&
			candidate.consentStatus !== ConsentStatus.GRANTED
		) {
			throw new BadRequestException(
				"An individual recipient requires recorded consent.",
			);
		}
		if (candidate.countryCode === "PT" && candidate.kind === "COMPANY") {
			const snapshot = await this.db.complianceSnapshot.findFirst({
				where: { jurisdiction: "PT_DGC" },
				orderBy: { effectiveAt: "desc" },
				select: { effectiveAt: true, data: true },
			});
			if (!snapshot || snapshot.effectiveAt < daysFromNow(-35)) {
				throw new BadRequestException(
					"A current Portuguese DGC suppression snapshot is required.",
				);
			}
			const domains = Array.isArray(snapshot.data) ? snapshot.data : [];
			if (candidate.domain && domains.includes(candidate.domain)) {
				throw new BadRequestException(
					"The company appears in the DGC opposition list.",
				);
			}
		}
	}

	private async claimWithinDailyCap(
		messageId: string,
		productId: ProductKey,
		cap: number,
	) {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			try {
				const claimed = await this.db.$transaction(
					async (tx) => {
						const reserved = await tx.outreachMessage.count({
							where: {
								OR: [
									{
										status: OutreachStatus.SENDING,
										updatedAt: { gte: startOfLisbonDay(new Date()) },
									},
									{
										status: OutreachStatus.SENT,
										sentAt: { gte: startOfLisbonDay(new Date()) },
									},
								],
								candidate: { productId },
							},
						});
						if (reserved >= cap) {
							throw new BadRequestException(
								"This product has reached its daily outreach cap.",
							);
						}
						return tx.outreachMessage.updateMany({
							where: { id: messageId, status: OutreachStatus.APPROVED },
							data: { status: OutreachStatus.SENDING, failureReason: null },
						});
					},
					{ isolationLevel: "Serializable" },
				);
				if (claimed.count !== 1) {
					throw new BadRequestException("This message is already being sent.");
				}
				return;
			} catch (error) {
				if (!hasPrismaCode(error, "P2034") || attempt === 2) throw error;
			}
		}
	}

	private async defaultFollowUpSchedule(
		candidateId: string,
		step: OutreachStep,
		subject: string,
	) {
		if (step === OutreachStep.FIRST_TOUCH) return null;
		const previousStep =
			step === OutreachStep.FOLLOW_UP_ONE
				? OutreachStep.FIRST_TOUCH
				: OutreachStep.FOLLOW_UP_ONE;
		const previous = await this.db.outreachMessage.findUnique({
			where: { candidateId_step: { candidateId, step: previousStep } },
			select: { sentAt: true, subject: true },
		});
		if (!previous?.sentAt) {
			throw new BadRequestException(
				"Send the previous outreach step before drafting this follow-up.",
			);
		}
		if (previous.subject.trim() !== subject.trim()) {
			throw new BadRequestException(
				"A follow-up must keep the original subject.",
			);
		}
		return addBusinessDays(
			previous.sentAt,
			step === OutreachStep.FOLLOW_UP_ONE ? 4 : 6,
		);
	}

	private async failMessage(id: string, reason: string) {
		await this.db.outreachMessage.update({
			where: { id },
			data: {
				status: OutreachStatus.FAILED,
				failureReason: reason.slice(0, 500),
			},
		});
	}
}

export function normaliseEmail(value: string): string {
	return value.trim().toLowerCase();
}

export function normaliseDomain(value: string | undefined): string | null {
	if (!value) return null;
	const domain = value
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.split("/")[0]
		?.replace(/^www\./, "");
	return domain && /^[a-z0-9.-]+$/.test(domain) ? domain : null;
}

export function hash(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function messageHash(
	input: Pick<ProspectDraftInput, "recipientEmail" | "subject" | "body">,
) {
	return hash(
		`${normaliseEmail(input.recipientEmail)}\n${input.subject.trim()}\n${input.body.trim()}`,
	);
}

function suppressionFingerprint(
	productId: ProductKey,
	emailHash: string | null,
	domain: string | null,
	fallback: string,
) {
	return `${productId}:${emailHash ?? domain ?? fallback}`;
}

function daysFromNow(days: number) {
	return new Date(Date.now() + days * 86_400_000);
}

function isString(value: string | null): value is string {
	return value !== null;
}

function hasPrismaCode(error: unknown, code: string): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === code
	);
}

function addBusinessDays(from: Date, days: number): Date {
	const result = new Date(from);
	let remaining = days;
	while (remaining > 0) {
		result.setUTCDate(result.getUTCDate() + 1);
		const weekday = new Intl.DateTimeFormat("en-GB", {
			timeZone: "Europe/Lisbon",
			weekday: "short",
		}).format(result);
		if (weekday !== "Sat" && weekday !== "Sun") remaining -= 1;
	}
	return result;
}

function startOfLisbonDay(now: Date): Date {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-CA", {
			timeZone: "Europe/Lisbon",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		})
			.formatToParts(now)
			.map((part) => [part.type, part.value]),
	);
	const localMidnightAsUtc = Date.UTC(
		Number(parts.year),
		Number(parts.month) - 1,
		Number(parts.day),
	);
	const probe = new Date(localMidnightAsUtc);
	const localProbe = Object.fromEntries(
		new Intl.DateTimeFormat("en-CA", {
			timeZone: "Europe/Lisbon",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			hourCycle: "h23",
		})
			.formatToParts(probe)
			.map((part) => [part.type, part.value]),
	);
	const represented = Date.UTC(
		Number(localProbe.year),
		Number(localProbe.month) - 1,
		Number(localProbe.day),
		Number(localProbe.hour),
	);
	return new Date(localMidnightAsUtc - (represented - localMidnightAsUtc));
}
