import {
	ActivityType,
	type Db,
	IntegrationProvider,
	Prisma,
	RecordSource,
} from "@crm/db";
import { Injectable, UnprocessableEntityException } from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import { normalizeDomain } from "../companies/domain";
import { InjectDatabase } from "../database/database.constants";
import type {
	ClaapWebhookInput,
	ClayWebhookInput,
} from "./integration.contracts";

type IntegrationResult = {
	companyId: string | null;
	contactId: string | null;
	dealId: string | null;
	activityId: string;
};

@Injectable()
export class IntegrationsService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
	) {}

	async ingestClay(input: ClayWebhookInput): Promise<IntegrationResult> {
		const delivery = await this.idempotent(
			IntegrationProvider.CLAY,
			input.eventId,
			async () => {
				const domain = normalizeDomain(input.company.domain);
				if (!domain) {
					throw new UnprocessableEntityException(
						"Clay company domain is invalid.",
					);
				}

				return this.db.$transaction(async (tx) => {
					const owner = await this.userByEmail(tx, input.ownerEmail);
					const company = await tx.company.upsert({
						where: { domain },
						create: {
							name: input.company.name,
							domain,
							website: input.company.website,
							industry: input.company.industry,
							linkedinUrl: input.company.linkedinUrl,
							ownerId: owner.id,
							source: RecordSource.CLAY,
						},
						update: compact({
							name: input.company.name,
							website: input.company.website,
							industry: input.company.industry,
							linkedinUrl: input.company.linkedinUrl,
						}),
						select: { id: true },
					});

					const contact = await tx.contact.upsert({
						where: { email: input.contact.email },
						create: {
							...input.contact,
							companyId: company.id,
							ownerId: owner.id,
							source: RecordSource.CLAY,
						},
						update: compact({
							firstName: input.contact.firstName,
							lastName: input.contact.lastName,
							phone: input.contact.phone,
							title: input.contact.title,
							linkedinUrl: input.contact.linkedinUrl,
							companyId: company.id,
						}),
						select: { id: true },
					});

					const deal = input.opportunity
						? await tx.deal.create({
								data: {
									name: input.opportunity.name,
									companyId: company.id,
									ownerId: owner.id,
									stage: input.opportunity.stage,
									amount: input.opportunity.amount,
									currency: input.opportunity.currency,
									expectedCloseDate: input.opportunity.expectedCloseDate
										? new Date(input.opportunity.expectedCloseDate)
										: undefined,
									contacts: { create: { contactId: contact.id } },
								},
								select: { id: true },
							})
						: null;

					const activity = await tx.activity.create({
						data: {
							type: ActivityType.ENRICHMENT,
							subject: "Imported from Clay",
							companyId: company.id,
							contactId: contact.id,
							dealId: deal?.id,
							createdById: owner.id,
							meta: json({
								provider: "clay",
								eventId: input.eventId,
								list: input.list,
								campaign: input.campaign,
							}),
						},
						select: { id: true, createdAt: true },
					});

					await touch(tx, activity.createdAt, {
						companyId: company.id,
						contactId: contact.id,
						dealId: deal?.id ?? null,
					});

					const integrationResult: IntegrationResult = {
						companyId: company.id,
						contactId: contact.id,
						dealId: deal?.id ?? null,
						activityId: activity.id,
					};

					await tx.integrationEvent.create({
						data: {
							provider: IntegrationProvider.CLAY,
							externalId: input.eventId,
							payload: json(input),
							result: json(integrationResult),
						},
					});

					return integrationResult;
				});
			},
		);

		if (delivery.created) {
			await Promise.all([
				this.agent.companyCreated(
					delivery.result.companyId as string,
					"Imported from Clay",
				),
				this.agent.contactCreated(
					delivery.result.contactId as string,
					"Imported from Clay",
				),
			]);
		}

		return delivery.result;
	}

	async ingestClaap(input: ClaapWebhookInput): Promise<IntegrationResult> {
		const delivery = await this.idempotent(
			IntegrationProvider.CLAAP,
			input.eventId,
			async () => {
				const { event } = input;
				return this.db.$transaction(async (tx) => {
					const author = await this.userByEmail(
						tx,
						event.recording.recorder.email,
					);
					const emails = [
						...new Set(
							(event.recording.meeting?.participants ?? []).map(
								(participant) => participant.email,
							),
						),
					];
					const contacts = await tx.contact.findMany({
						where: { email: { in: emails, mode: "insensitive" } },
						select: { id: true, companyId: true },
					});
					const explicitDealId =
						event.recording.crmInfo?.deal?.id ?? event.recording.deal?.id;
					const deal = explicitDealId
						? await tx.deal.findUnique({
								where: { id: explicitDealId },
								select: { id: true, companyId: true },
							})
						: null;
					const companyIds = new Set(
						contacts.flatMap((contact) =>
							contact.companyId ? [contact.companyId] : [],
						),
					);
					const companyId =
						deal?.companyId ??
						(companyIds.size === 1 ? ([...companyIds][0] as string) : null);
					const contactId =
						contacts.length === 1 ? (contacts[0]?.id ?? null) : null;
					const occurredAt = new Date(
						event.recording.meeting?.startingAt ?? event.recording.createdAt,
					);
					const body = event.recording.keyTakeaways
						.map((takeaway) => takeaway.text.trim())
						.filter(Boolean)
						.join("\n\n");

					const activity = await tx.activity.create({
						data: {
							type: ActivityType.MEETING,
							subject: event.recording.title,
							body: body || null,
							occurredAt,
							companyId,
							contactId,
							dealId: deal?.id,
							createdById: author.id,
							meta: json({
								provider: "claap",
								eventId: input.eventId,
								recordingId: event.recording.id,
								recordingUrl: event.recording.url,
								participants: event.recording.meeting?.participants ?? [],
								actionItems: event.recording.actionItems,
								insightTemplates: event.recording.insightTemplates,
								transcripts: event.recording.transcripts,
							}),
						},
						select: { id: true, createdAt: true },
					});

					await touch(tx, activity.createdAt, {
						companyId,
						contactId,
						dealId: deal?.id ?? null,
					});

					const integrationResult: IntegrationResult = {
						companyId,
						contactId,
						dealId: deal?.id ?? null,
						activityId: activity.id,
					};

					await tx.integrationEvent.create({
						data: {
							provider: IntegrationProvider.CLAAP,
							externalId: input.eventId,
							payload: json(input),
							result: json(integrationResult),
						},
					});

					return integrationResult;
				});
			},
		);

		return delivery.result;
	}

	private async idempotent(
		provider: IntegrationProvider,
		externalId: string,
		create: () => Promise<IntegrationResult>,
	): Promise<{ result: IntegrationResult; created: boolean }> {
		const previous = await this.previous(provider, externalId);
		if (previous) return { result: previous, created: false };

		try {
			return { result: await create(), created: true };
		} catch (error) {
			if (
				error instanceof Prisma.PrismaClientKnownRequestError &&
				error.code === "P2002"
			) {
				const concurrent = await this.previous(provider, externalId);
				if (concurrent) return { result: concurrent, created: false };
			}
			throw error;
		}
	}

	private async previous(
		provider: IntegrationProvider,
		externalId: string,
	): Promise<IntegrationResult | null> {
		const event = await this.db.integrationEvent.findUnique({
			where: { provider_externalId: { provider, externalId } },
			select: { result: true },
		});
		return event?.result as IntegrationResult | null;
	}

	private async userByEmail(tx: Prisma.TransactionClient, email: string) {
		const user = await tx.user.findFirst({
			where: { email: { equals: email, mode: "insensitive" } },
			select: { id: true },
		});
		if (!user) {
			throw new UnprocessableEntityException(
				`No CRM user matches integration owner ${email}.`,
			);
		}
		return user;
	}
}

function compact<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(
		Object.entries(value).filter(([, entry]) => entry !== undefined),
	) as T;
}

function json(value: unknown): Prisma.InputJsonValue {
	return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function touch(
	tx: Prisma.TransactionClient,
	at: Date,
	target: {
		companyId: string | null;
		contactId: string | null;
		dealId: string | null;
	},
) {
	const stale = {
		OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: at } }],
	};
	await Promise.all([
		target.companyId
			? tx.company.updateMany({
					where: { id: target.companyId, ...stale },
					data: { lastActivityAt: at },
				})
			: null,
		target.contactId
			? tx.contact.updateMany({
					where: { id: target.contactId, ...stale },
					data: { lastActivityAt: at },
				})
			: null,
		target.dealId
			? tx.deal.updateMany({
					where: { id: target.dealId, ...stale },
					data: { lastActivityAt: at },
				})
			: null,
	]);
}
