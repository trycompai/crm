import {
	ActivityType,
	type Db,
	type DealStage,
	type Prisma,
	Prisma as PrismaNamespace,
} from "@crm/db";
import { approvalContentDigest } from "@crm/db/approval";
import { normalizeCurrency } from "@crm/db/currency";
import {
	CLOSED_DEAL_STAGES,
	isClosedStage,
	LOSING_DEAL_STAGES,
	OPEN_DEAL_STAGES,
} from "@crm/db/deal-stage";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import {
	ActivityStampService,
	type StampTargets,
} from "../crm/activity-stamp.service";
import { type BulkResult, requireOwner, runBulk } from "../crm/bulk";
import {
	blankToNull,
	decimalFromCents,
	fromCents,
	toCents,
} from "../crm/values";
import { ConversionService } from "../currency/conversion.service";
import { InjectDatabase } from "../database/database.constants";
import { FieldsService } from "../fields/fields.service";
import { kernelRequestHash } from "../operating-kernel/kernel-idempotency.service";
import { OperatingKernelCleanupService } from "../operating-kernel/operating-kernel-cleanup.service";
import {
	countsByKey,
	FACET_ALL,
	FACET_UNASSIGNED,
	type ListResult,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import type {
	ClosingWindow,
	DealAttachContactInput,
	DealBulkOwnerInput,
	DealBulkStageInput,
	DealContactRoleInput,
	DealCreateInput,
	DealDetachContactInput,
	DealListInput,
	DealUpdateInput,
	OnboardingItemCreateInput,
	OnboardingItemUpdateInput,
	OnboardingUpdateInput,
	SetStageInput,
} from "./deals.contracts";
import { CLOSING_WINDOWS } from "./deals.contracts";

const OWNER_SELECT = {
	id: true,
	name: true,
	email: true,
	image: true,
} as const;

const COMPANY_SELECT = {
	id: true,
	name: true,
	domain: true,
	iconUrl: true,
	iconDarkUrl: true,
	iconTone: true,
	logoUrl: true,
} as const;

const CONTACT_SELECT = {
	id: true,
	firstName: true,
	lastName: true,
	email: true,
	title: true,
	imageUrl: true,
} as const;

const LOSING = new Set<DealStage>(LOSING_DEAL_STAGES);

const ONBOARDING_ITEM_BLUEPRINTS = [
	{
		kind: "DECISION",
		name: "Confirm objectives and measurable success outcomes",
		details:
			"Capture the closed-won outcome, success measures and first useful operating cadence before any customer/provider change.",
	},
	{
		kind: "DECISION",
		name: "Identify stakeholders and approval owners",
		details:
			"Name customer stakeholders, Richard/Angus owner boundaries and unresolved blockers without inventing missing people.",
	},
	{
		kind: "SYSTEM",
		name: "Inventory current systems and their owners",
		details:
			"Record only confirmed systems, owners and access paths; leave unknown systems as explicit gaps.",
	},
	{
		kind: "DATA_SOURCE",
		name: "Map structured and unstructured customer data",
		details:
			"Separate databases, spreadsheets, documents, notes and inboxes so ingestion can be scoped safely.",
	},
	{
		kind: "ACCESS",
		name: "Agree secure access requirements",
		details:
			"List required credentials, scopes, consent owners and red-line exclusions before any connector is touched.",
	},
	{
		kind: "INGESTION",
		name: "Prepare the first Lode Brain ingestion plan",
		details:
			"Draft a dry-run ingestion plan with provenance, exclusions and rollback notes for human approval.",
	},
	{
		kind: "DECISION",
		name: "Resolve launch blockers and support boundaries",
		details:
			"Track blockers, support-safe knowledge limits and handoff conditions before go-live.",
	},
] as const satisfies readonly {
	kind: "SYSTEM" | "DATA_SOURCE" | "ACCESS" | "INGESTION" | "DECISION";
	name: string;
	details: string;
}[];

const CUSTOMER_FOUNDATION_GAPS = [
	"objectives",
	"successMeasures",
	"stakeholders",
	"systems",
	"structuredData",
	"unstructuredData",
	"accessRequirements",
	"ingestionPlan",
	"blockers",
	"instanceDiscovery",
] as const;

function jsonObject(value: Prisma.JsonValue | null | undefined) {
	return value && typeof value === "object" && !Array.isArray(value)
		? { ...(value as Record<string, unknown>) }
		: {};
}

function customerFoundationMetadata(input: {
	existing: Prisma.JsonValue | null | undefined;
	dealId: string;
	companyId: string;
	onboardingId: string;
	recordedAt: Date;
}) {
	const current = jsonObject(input.existing);
	const existingFoundation = jsonObject(
		(current.onboardingFoundation as Prisma.JsonValue | undefined) ?? null,
	);
	return {
		...current,
		onboardingFoundation: {
			...existingFoundation,
			dealId: input.dealId,
			companyId: input.companyId,
			onboardingId: input.onboardingId,
			evidenceState: "operator_required",
			requiredGaps: [...CUSTOMER_FOUNDATION_GAPS],
			customerMutationDisabled: true,
			providerMutationDisabled: true,
			modelExecutionDisabled: true,
			recordedAt: input.recordedAt.toISOString(),
		},
	} satisfies Prisma.InputJsonObject;
}

function instanceFoundationMetadata(input: {
	dealId: string;
	companyId: string;
	onboardingId: string;
	recordedAt: Date;
}) {
	return {
		source: "closed-won-onboarding",
		dealId: input.dealId,
		companyId: input.companyId,
		onboardingId: input.onboardingId,
		mode: "read-only-discovery",
		customerMutationDisabled: true,
		providerMutationDisabled: true,
		recordedAt: input.recordedAt.toISOString(),
	} satisfies Prisma.InputJsonObject;
}

function onboardingApprovalSnapshot(input: {
	dealId: string;
	companyId: string;
	accountId: string;
	instanceId: string;
	onboardingId: string;
	workItemIds: string[];
}) {
	return {
		dealId: input.dealId,
		companyId: input.companyId,
		customerAccountId: input.accountId,
		customerInstanceId: input.instanceId,
		onboardingId: input.onboardingId,
		requiredGaps: [...CUSTOMER_FOUNDATION_GAPS],
		proposedExecution: "local-plan-only",
		customerMutationDisabled: true,
		providerMutationDisabled: true,
		modelExecutionDisabled: true,
		workItemIds: input.workItemIds,
	} satisfies Prisma.InputJsonObject;
}

const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.DealOrderByWithRelationInput[]
> = {
	name: (dir) => [{ name: dir }],
	company: (dir) => [{ company: { name: dir } }, { name: "asc" }],
	stage: (dir) => [{ stage: dir }, { expectedCloseDate: "asc" }],
	amount: (dir) => [{ baseAmount: { sort: dir, nulls: "last" } }],
	expectedCloseDate: (dir) => [{ expectedCloseDate: dir }],
	createdAt: (dir) => [{ createdAt: dir }],
	owner: (dir) => [{ owner: { name: dir } }, { name: "asc" }],
	lastActivity: (dir) => [{ lastActivityAt: { sort: dir, nulls: "last" } }],
};

@Injectable()
export class DealsService {
	private readonly logger = new Logger(DealsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly agent: AgentTriggerService,
		private readonly stamp: ActivityStampService,
		private readonly conversion: ConversionService,
		private readonly fields: FieldsService,
		private readonly cleanup: OperatingKernelCleanupService,
	) {}

	async list(input: DealListInput) {
		const where = this.buildWhere(input);
		const { skip, take } = paginate(input);

		const openWhere = { ...where, stage: { in: [...OPEN_DEAL_STAGES] } };
		const base = await this.conversion.reportingCurrency();

		const [rows, total, facetCounts, openValue, unconverted] =
			await Promise.all([
				this.db.deal.findMany({
					where,
					skip,
					take,
					orderBy: resolveOrderBy(input, SORTABLE, [{ createdAt: "desc" }]),
					select: {
						id: true,
						name: true,
						stage: true,
						amount: true,
						currency: true,
						baseAmount: true,
						expectedCloseDate: true,
						closedAt: true,
						company: { select: COMPANY_SELECT },
						owner: { select: OWNER_SELECT },
						_count: { select: { contacts: true } },
						lastActivityAt: true,
						createdAt: true,
					},
				}),
				this.db.deal.count({ where }),
				this.facetCounts(input),
				this.db.deal.aggregate({
					where: { AND: [openWhere, this.conversion.countedWhere(base)] },
					_sum: { baseAmount: true },
				}),
				this.conversion.unconverted(openWhere),
			]);

		const tableFields = await this.fields.tableValuesFor(
			"DEAL",
			rows.map((row) => row.id),
		);

		return {
			rows: rows.map(
				({
					amount,
					baseAmount,
					expectedCloseDate,
					closedAt,
					lastActivityAt,
					createdAt,
					_count,
					...row
				}) => ({
					...row,
					amountCents: toCents(amount),
					baseAmountCents: toCents(baseAmount),
					expectedCloseDate: expectedCloseDate?.toISOString() ?? null,
					closedAt: closedAt?.toISOString() ?? null,
					lastActivityAt: lastActivityAt?.toISOString() ?? null,
					contactCount: _count.contacts,
					createdAt: createdAt.toISOString(),
					fields: tableFields.get(row.id) ?? {},
				}),
			),
			total,
			facetCounts,
			openValueCents: toCents(openValue._sum.baseAmount),
			reportingCurrency: base,
			unconverted,
		} satisfies ListResult<unknown> & {
			openValueCents: number | null;
			reportingCurrency: string;
			unconverted: { count: number; currencies: string[] };
		};
	}

	async byId(id: string) {
		const deal = await this.db.deal.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				description: true,
				stage: true,
				stageChangedAt: true,
				amount: true,
				currency: true,
				baseAmount: true,
				fxRate: true,
				fxRateAt: true,
				expectedCloseDate: true,
				closedAt: true,
				closedReason: true,
				lastActivityAt: true,
				createdAt: true,
				company: { select: { ...COMPANY_SELECT, industry: true } },
				owner: { select: OWNER_SELECT },
				contacts: {
					select: { role: true, contact: { select: CONTACT_SELECT } },
					orderBy: { contact: { firstName: "asc" } },
				},
				onboarding: {
					select: {
						id: true,
						status: true,
						objective: true,
						systemsSummary: true,
						dataSummary: true,
						brainPlan: true,
						agentPlannedAt: true,
						targetLiveAt: true,
						createdAt: true,
						updatedAt: true,
						items: {
							orderBy: [{ kind: "asc" }, { position: "asc" }],
							select: {
								id: true,
								kind: true,
								status: true,
								name: true,
								details: true,
								ownerName: true,
								source: true,
								dueAt: true,
								position: true,
								updatedAt: true,
							},
						},
					},
				},
			},
		});

		if (!deal) {
			throw new NotFoundException(`No deal with id ${id}.`);
		}

		const {
			contacts,
			amount,
			baseAmount,
			fxRate,
			fxRateAt,
			onboarding,
			...rest
		} = deal;

		return {
			...rest,
			fields: await this.fields.valuesFor("DEAL", id),
			amountCents: toCents(amount),
			baseAmountCents: toCents(baseAmount),
			reportingCurrency: await this.conversion.reportingCurrency(),
			fxRate: fxRate?.toNumber() ?? null,
			fxRateAt: fxRateAt?.toISOString() ?? null,
			stageChangedAt: deal.stageChangedAt.toISOString(),
			expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
			closedAt: deal.closedAt?.toISOString() ?? null,
			lastActivityAt: deal.lastActivityAt?.toISOString() ?? null,
			createdAt: deal.createdAt.toISOString(),
			contacts: contacts.map(({ role, contact }) => ({ ...contact, role })),
			onboarding: onboarding
				? {
						...onboarding,
						agentPlannedAt: onboarding.agentPlannedAt?.toISOString() ?? null,
						targetLiveAt: onboarding.targetLiveAt?.toISOString() ?? null,
						createdAt: onboarding.createdAt.toISOString(),
						updatedAt: onboarding.updatedAt.toISOString(),
						items: onboarding.items.map((item) => ({
							...item,
							dueAt: item.dueAt?.toISOString() ?? null,
							updatedAt: item.updatedAt.toISOString(),
						})),
					}
				: null,
		};
	}

	async create(input: DealCreateInput) {
		const stage = input.stage ?? "DEMO_BOOKED";
		const closed = isClosedStage(stage);
		const now = new Date();

		const currency = normalizeCurrency(
			input.currency ?? (await this.conversion.reportingCurrency()),
		);
		const fx = await this.conversion.dealFields(
			decimalFromCents(input.amountCents),
			currency,
		);

		try {
			const deal = await this.agent.withCrmEvents(async (tx, emit) => {
				const created = await tx.deal.create({
					data: {
						name: input.name.trim(),
						companyId: input.companyId,
						ownerId: input.ownerId,
						stage,
						stageChangedAt: now,
						closedAt: closed ? now : null,
						amount: fromCents(input.amountCents),
						currency,
						...fx,
						expectedCloseDate: parseDate(input.expectedCloseDate),
					},
					select: { id: true, name: true, companyId: true },
				});
				await emit({
					type: "deal.created",
					record: { kind: "deal", id: created.id },
					occurredAt: now,
					data: { companyId: created.companyId, stage },
				});
				if (closed) {
					await emit({
						type: "deal.closed",
						record: { kind: "deal", id: created.id },
						occurredAt: now,
						data: { companyId: created.companyId, from: null, to: stage },
					});
				}
				return created;
			});

			this.logger.log({ message: "Deal created", dealId: deal.id, stage });
			if (stage === "CLOSED_WON") {
				await this.ensureOnboarding(deal.id, deal.companyId, input.ownerId);
			}

			return deal;
		} catch (error) {
			throw this.translateRelations(error);
		}
	}

	async update(id: string, input: DealUpdateInput) {
		const data: Prisma.DealUpdateInput = {};

		if (input.name !== undefined) data.name = input.name.trim();
		if (input.description !== undefined) {
			data.description =
				input.description === null ? null : blankToNull(input.description);
		}
		if (input.companyId !== undefined) {
			data.company = { connect: { id: input.companyId } };
		}
		if (input.ownerId !== undefined) {
			data.owner = { connect: { id: input.ownerId } };
		}
		if (input.amountCents !== undefined) {
			data.amount = fromCents(input.amountCents);
		}
		if (input.currency !== undefined) {
			data.currency = normalizeCurrency(input.currency);
		}
		if (input.expectedCloseDate !== undefined) {
			data.expectedCloseDate = parseDate(input.expectedCloseDate);
		}

		if (input.amountCents !== undefined || input.currency !== undefined) {
			const current = await this.db.deal.findUnique({
				where: { id },
				select: { amount: true, currency: true },
			});

			if (!current) {
				throw new NotFoundException(`No deal with id ${id}.`);
			}

			const amount =
				input.amountCents !== undefined
					? decimalFromCents(input.amountCents)
					: current.amount;
			const currency =
				input.currency !== undefined
					? normalizeCurrency(input.currency)
					: normalizeCurrency(current.currency);

			Object.assign(data, await this.conversion.dealFields(amount, currency));
		}

		try {
			return await this.db.$transaction(async (tx) => {
				if (input.fields) {
					await this.fields.applyValues(tx, "DEAL", id, input.fields);
				}

				return tx.deal.update({
					where: { id },
					data,
					select: { id: true, name: true },
				});
			});
		} catch (error) {
			throw this.translate(error, id);
		}
	}

	async delete(id: string): Promise<{ id: string; name: string }> {
		let deleted: { targets: StampTargets; name: string };

		try {
			deleted = await this.db.$transaction(async (tx) => {
				const targets = await this.stamp.targetsOf({ dealId: id }, tx);
				await this.cleanup.beforeSubjectDelete(tx, { type: "DEAL", id });

				const deal = await tx.deal.delete({
					where: { id },
					select: { name: true },
				});

				return { targets, name: deal.name };
			});
		} catch (error) {
			throw this.translate(error, id);
		}

		await this.stamp.recomputeAfterDelete(deleted.targets, { dealId: id });

		this.logger.log({
			message: "Deal deleted",
			dealId: id,
			name: deleted.name,
		});

		return { id, name: deleted.name };
	}

	async setStage(input: SetStageInput, actingUserId: string) {
		const closedReason = input.closedReason?.trim();
		const closed = isClosedStage(input.stage);
		const transition = await this.agent.withCrmEvents(async (tx, emit) => {
			const [deal] = await tx.$queryRaw<
				Array<{
					id: string;
					stage: DealStage;
					companyId: string;
					ownerId: string;
				}>
			>`
				SELECT id, stage, "companyId", "ownerId"
				FROM deal
				WHERE id = ${input.id}
				FOR UPDATE
			`;

			if (!deal) {
				throw new NotFoundException(`No deal with id ${input.id}.`);
			}

			if (deal.stage === input.stage) {
				return {
					changed: false as const,
					deal,
					updated: { id: deal.id, stage: deal.stage },
					now: null,
				};
			}
			if (LOSING.has(input.stage) && !closedReason) {
				throw new BadRequestException(
					"Say why it was lost — a closed-lost deal with no reason teaches nobody anything.",
				);
			}

			const now = new Date();
			const updated = await tx.deal.update({
				where: { id: input.id },
				data: {
					stage: input.stage,
					stageChangedAt: now,
					closedAt: closed ? now : null,
					closedReason: closed ? (closedReason ?? null) : null,
				},
				select: { id: true, stage: true },
			});
			await tx.activity.create({
				data: {
					type: ActivityType.STAGE_CHANGE,
					subject: "Stage changed",
					body: closedReason ?? null,
					occurredAt: now,
					companyId: deal.companyId,
					dealId: deal.id,
					createdById: actingUserId,
					meta: { from: deal.stage, to: input.stage },
				},
			});
			await emit({
				type: "deal.stage.changed",
				record: { kind: "deal", id: deal.id },
				occurredAt: now,
				data: { companyId: deal.companyId, from: deal.stage, to: input.stage },
			});
			if (!isClosedStage(deal.stage) && closed) {
				await emit({
					type: "deal.closed",
					record: { kind: "deal", id: deal.id },
					occurredAt: now,
					data: {
						companyId: deal.companyId,
						from: deal.stage,
						to: input.stage,
					},
				});
			}
			if (isClosedStage(deal.stage) && !closed) {
				await emit({
					type: "deal.opened",
					record: { kind: "deal", id: deal.id },
					occurredAt: now,
					data: {
						companyId: deal.companyId,
						from: deal.stage,
						to: input.stage,
					},
				});
			}
			return { changed: true as const, deal, updated, now };
		});

		if (!transition.changed) {
			if (input.stage === "CLOSED_WON") {
				await this.ensureOnboarding(
					transition.deal.id,
					transition.deal.companyId,
					transition.deal.ownerId,
				);
			}
			return { ...transition.updated, changed: false };
		}

		const { deal, updated, now } = transition;

		await this.stamp.touch({ companyId: deal.companyId, dealId: deal.id }, now);
		if (input.stage === "CLOSED_WON") {
			await this.ensureOnboarding(deal.id, deal.companyId, deal.ownerId);
		}

		this.logger.log({
			message: "Deal stage changed",
			dealId: deal.id,
			from: deal.stage,
			to: input.stage,
		});

		return { ...updated, changed: true };
	}

	async updateOnboarding(input: OnboardingUpdateInput) {
		const onboarding = await this.db.customerOnboarding.findUnique({
			where: { dealId: input.dealId },
			select: { id: true },
		});
		if (!onboarding)
			throw new NotFoundException("This deal has no customer onboarding yet.");
		return this.db.customerOnboarding.update({
			where: { id: onboarding.id },
			data: {
				status: input.status,
				objective: input.objective,
				systemsSummary: input.systemsSummary,
				dataSummary: input.dataSummary,
				brainPlan: input.brainPlan,
				targetLiveAt:
					input.targetLiveAt === undefined
						? undefined
						: input.targetLiveAt
							? new Date(input.targetLiveAt)
							: null,
			},
			select: { id: true, status: true, updatedAt: true },
		});
	}

	async addOnboardingItem(input: OnboardingItemCreateInput) {
		const onboarding = await this.db.customerOnboarding.findUnique({
			where: { dealId: input.dealId },
			select: {
				id: true,
				items: {
					select: { position: true },
					orderBy: { position: "desc" },
					take: 1,
				},
			},
		});
		if (!onboarding)
			throw new NotFoundException("This deal has no customer onboarding yet.");
		return this.db.onboardingItem.create({
			data: {
				onboardingId: onboarding.id,
				kind: input.kind,
				name: input.name,
				details: input.details,
				ownerName: input.ownerName,
				position: (onboarding.items[0]?.position ?? -1) + 1,
			},
			select: { id: true },
		});
	}

	async updateOnboardingItem(input: OnboardingItemUpdateInput) {
		const result = await this.db.onboardingItem.updateMany({
			where: { id: input.id, onboarding: { dealId: input.dealId } },
			data: {
				status: input.status,
				name: input.name,
				details: input.details,
				ownerName: input.ownerName,
				dueAt:
					input.dueAt === undefined
						? undefined
						: input.dueAt
							? new Date(input.dueAt)
							: null,
			},
		});
		if (result.count === 0)
			throw new NotFoundException("Onboarding item not found.");
		return { id: input.id };
	}

	private async ensureOnboarding(
		dealId: string,
		companyId: string,
		ownerId: string,
	): Promise<void> {
		const now = new Date();
		await this.db.$transaction(async (tx) => {
			const [company] = await tx.$queryRaw<Array<{ id: string }>>`
				SELECT id
				FROM company
				WHERE id = ${companyId}
				FOR UPDATE
			`;
			if (!company) {
				throw new NotFoundException(`No company with id ${companyId}.`);
			}
			const [lockedDeal] = await tx.$queryRaw<Array<{ id: string }>>`
				SELECT id
				FROM deal
				WHERE id = ${dealId}
				FOR UPDATE
			`;
			if (!lockedDeal)
				throw new NotFoundException(`No deal with id ${dealId}.`);
			const deal = await tx.deal.findUnique({
				where: { id: dealId },
				select: {
					id: true,
					name: true,
					ownerId: true,
					company: { select: { id: true, name: true, domain: true } },
				},
			});
			if (!deal) throw new NotFoundException(`No deal with id ${dealId}.`);
			if (deal.company.id !== companyId) {
				throw new BadRequestException(
					"Closed-won onboarding company does not match the deal.",
				);
			}

			const onboarding = await tx.customerOnboarding.upsert({
				where: { dealId },
				create: {
					dealId,
					companyId,
					ownerId,
					items: {
						create: ONBOARDING_ITEM_BLUEPRINTS.map((item, position) => ({
							...item,
							source: "closed-won-foundation",
							position,
						})),
					},
				},
				update: { companyId, ownerId },
				select: { id: true },
			});

			const existingAccount = await tx.customerAccount.findUnique({
				where: { companyId },
				select: {
					id: true,
					metadata: true,
					customerOnboardingId: true,
				},
			});
			const account = existingAccount
				? await tx.customerAccount.update({
						where: { id: existingAccount.id },
						data: {
							name: deal.company.name,
							status: "ACTIVE",
							ownerId,
							customerOnboardingId:
								existingAccount.customerOnboardingId ?? onboarding.id,
							metadata: customerFoundationMetadata({
								existing: existingAccount.metadata,
								dealId,
								companyId,
								onboardingId: onboarding.id,
								recordedAt: now,
							}),
						},
						select: { id: true, name: true },
					})
				: await tx.customerAccount.create({
						data: {
							companyId,
							customerOnboardingId: onboarding.id,
							name: deal.company.name,
							externalKey: `company:${companyId}`,
							status: "ACTIVE",
							ownerId,
							metadata: customerFoundationMetadata({
								existing: null,
								dealId,
								companyId,
								onboardingId: onboarding.id,
								recordedAt: now,
							}),
						},
						select: { id: true, name: true },
					});

			const instance = await tx.customerInstance.upsert({
				where: {
					accountId_key: {
						accountId: account.id,
						key: `onboarding-${dealId}`,
					},
				},
				create: {
					accountId: account.id,
					key: `onboarding-${dealId}`,
					name: `${deal.company.name} discovery`,
					environment: "customer-discovery",
					region: "operator-confirmed",
					status: "DISCOVERED",
					metadata: instanceFoundationMetadata({
						dealId,
						companyId,
						onboardingId: onboarding.id,
						recordedAt: now,
					}),
				},
				update: {
					name: `${deal.company.name} discovery`,
					status: "DISCOVERED",
					metadata: instanceFoundationMetadata({
						dealId,
						companyId,
						onboardingId: onboarding.id,
						recordedAt: now,
					}),
				},
				select: { id: true, name: true },
			});

			const intakeWorkId = `customer-onboarding:${dealId}:intake`;
			const discoveryWorkId = `customer-onboarding:${dealId}:instance-discovery`;
			const intakeEvidence = {
				source: "closed-won-foundation",
				dealId,
				companyId,
				onboardingId: onboarding.id,
				customerAccountId: account.id,
				requiredGaps: [...CUSTOMER_FOUNDATION_GAPS],
				customerMutationDisabled: true,
				providerMutationDisabled: true,
				modelExecutionDisabled: true,
			} satisfies Prisma.InputJsonObject;
			await tx.workItem.upsert({
				where: { id: intakeWorkId },
				create: {
					id: intakeWorkId,
					subjectType: "CUSTOMER_ACCOUNT",
					subjectId: account.id,
					subjectLabel: account.name,
					ownerId,
					queue: "customers",
					urgency: "HIGH",
					reason:
						"Closed-won customer needs objectives, success measures, stakeholders, systems, data, access and blockers captured.",
					primaryAction: "Complete customer onboarding intake",
					evidence: intakeEvidence,
					dueAt: now,
				},
				update: {
					subjectId: account.id,
					subjectLabel: account.name,
					ownerId,
					evidence: intakeEvidence,
				},
			});
			await tx.workItem.upsert({
				where: { id: discoveryWorkId },
				create: {
					id: discoveryWorkId,
					subjectType: "CUSTOMER_INSTANCE",
					subjectId: instance.id,
					subjectLabel: instance.name,
					ownerId,
					queue: "instances",
					urgency: "NORMAL",
					reason:
						"Prepare read-only instance discovery and a dry-run plan before any provider change.",
					primaryAction: "Prepare instance discovery dry-run",
					evidence: {
						source: "closed-won-foundation",
						dealId,
						companyId,
						onboardingId: onboarding.id,
						customerAccountId: account.id,
						customerInstanceId: instance.id,
						requiredGaps: ["providerResourceCensus", "observedState"],
						providerMutationDisabled: true,
						customerMutationDisabled: true,
					} satisfies Prisma.InputJsonObject,
				},
				update: {
					subjectId: instance.id,
					subjectLabel: instance.name,
					ownerId,
				},
			});

			const workItemIds = [intakeWorkId, discoveryWorkId];
			const contentSnapshot = onboardingApprovalSnapshot({
				dealId,
				companyId,
				accountId: account.id,
				instanceId: instance.id,
				onboardingId: onboarding.id,
				workItemIds,
			});
			const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
			const action = "customers.onboarding.plan.approve";
			const contentDigest = approvalContentDigest({
				action,
				contentSnapshot,
				targetType: "CUSTOMER_ACCOUNT",
				targetId: account.id,
				risk: "HIGH",
				policyVersion: "customer-onboarding-local-v1",
				expiresAt,
				invalidationVersion: 0,
			});
			const approval = await tx.approvalRequest.upsert({
				where: { idempotencyKey: `customers:onboarding:${dealId}:approval` },
				create: {
					action,
					contentDigest,
					contentSnapshot,
					targetType: "CUSTOMER_ACCOUNT",
					targetId: account.id,
					targetLabel: account.name,
					risk: "HIGH",
					policyVersion: "customer-onboarding-local-v1",
					requestorId: ownerId,
					expiresAt,
					idempotencyKey: `customers:onboarding:${dealId}:approval`,
				},
				update: {
					targetId: account.id,
					targetLabel: account.name,
					requestorId: ownerId,
				},
				select: { id: true, contentDigest: true },
			});

			const requestHash = kernelRequestHash({
				operation: "customers.closed-won.ensure",
				dealId,
				companyId,
				accountId: account.id,
				instanceId: instance.id,
				onboardingId: onboarding.id,
				workItemIds,
				approvalRequestId: approval.id,
			});
			const receiptResult = {
				dealId,
				companyId,
				customerAccountId: account.id,
				customerInstanceId: instance.id,
				onboardingId: onboarding.id,
				approvalRequestId: approval.id,
				approvalContentDigest: approval.contentDigest,
				workItemIds,
				customerMutationDisabled: true,
				providerMutationDisabled: true,
				modelExecutionDisabled: true,
			} satisfies Prisma.InputJsonObject;
			await tx.actionReceipt.upsert({
				where: { idempotencyKey: `customers:closed-won:${dealId}` },
				create: {
					idempotencyKey: `customers:closed-won:${dealId}`,
					requestHash,
					provider: "lode-crm",
					channel: "customers",
					operationKey: "customers.closed-won.ensure",
					status: "SUCCEEDED",
					completedAt: now,
					result: receiptResult,
				},
				update: {
					requestHash,
					result: receiptResult,
				},
			});
		});
	}

	async contactOptions(dealId: string) {
		const deal = await this.db.deal.findUnique({
			where: { id: dealId },
			select: { companyId: true, contacts: { select: { contactId: true } } },
		});

		if (!deal) {
			throw new NotFoundException(`No deal with id ${dealId}.`);
		}

		return this.db.contact.findMany({
			where: {
				companyId: deal.companyId,
				id: { notIn: deal.contacts.map((row) => row.contactId) },
			},
			select: CONTACT_SELECT,
			orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
			take: 100,
		});
	}

	async attachContact(input: DealAttachContactInput) {
		const company = await this.companyOf(input.dealId);
		const contact = await this.db.contact.findUnique({
			where: { id: input.contactId },
			select: { companyId: true },
		});

		if (!contact) {
			throw new NotFoundException(`No contact with id ${input.contactId}.`);
		}

		if (contact.companyId !== company.id) {
			throw new BadRequestException(
				`That contact does not work at ${company.name}.`,
			);
		}

		const role = roleOrNull(input.role ?? null);

		await this.db.dealContact.upsert({
			where: {
				dealId_contactId: {
					dealId: input.dealId,
					contactId: input.contactId,
				},
			},
			create: { dealId: input.dealId, contactId: input.contactId, role },
			update: role === null ? {} : { role },
		});

		this.logger.log({
			message: "Contact attached to deal",
			dealId: input.dealId,
			contactId: input.contactId,
		});

		return { dealId: input.dealId, contactId: input.contactId };
	}

	async detachContact(input: DealDetachContactInput) {
		const { count } = await this.db.dealContact.deleteMany({
			where: { dealId: input.dealId, contactId: input.contactId },
		});

		if (count === 0) {
			throw new NotFoundException("That contact is not on this deal.");
		}

		this.logger.log({
			message: "Contact detached from deal",
			dealId: input.dealId,
			contactId: input.contactId,
		});

		return { dealId: input.dealId, contactId: input.contactId };
	}

	async setContactRole(input: DealContactRoleInput) {
		const role = roleOrNull(input.role);

		const { count } = await this.db.dealContact.updateMany({
			where: { dealId: input.dealId, contactId: input.contactId },
			data: { role },
		});

		if (count === 0) {
			throw new NotFoundException("That contact is not on this deal.");
		}

		return { dealId: input.dealId, contactId: input.contactId, role };
	}

	async bulkAssignOwner(input: DealBulkOwnerInput): Promise<BulkResult> {
		await requireOwner(this.db, input.ownerId);

		const ids = [...new Set(input.ids)];
		const { count } = await this.db.deal.updateMany({
			where: { id: { in: ids } },
			data: { ownerId: input.ownerId },
		});

		this.logger.log({
			message: "Deals reassigned",
			count,
			ownerId: input.ownerId,
		});

		return {
			requested: ids.length,
			succeeded: count,
			failed: ids.length - count,
			message: null,
		};
	}

	async bulkSetStage(
		input: DealBulkStageInput,
		actingUserId: string,
	): Promise<BulkResult> {
		const closedReason = input.closedReason?.trim();

		if (LOSING.has(input.stage) && !closedReason) {
			throw new BadRequestException(
				"Say why they were lost — a closed-lost deal with no reason teaches nobody anything.",
			);
		}

		return runBulk(input.ids, (id) =>
			this.setStage({ id, stage: input.stage, closedReason }, actingUserId),
		);
	}

	async bulkDelete(ids: string[]): Promise<BulkResult> {
		return runBulk(ids, (id) => this.delete(id));
	}

	private async companyOf(dealId: string) {
		const deal = await this.db.deal.findUnique({
			where: { id: dealId },
			select: { company: { select: { id: true, name: true } } },
		});

		if (!deal) {
			throw new NotFoundException(`No deal with id ${dealId}.`);
		}

		return deal.company;
	}

	private searchFilter(q: string): Prisma.DealWhereInput {
		const term = q.trim();
		if (!term) return {};

		return {
			OR: [
				{ name: { contains: term, mode: "insensitive" } },
				{ company: { name: { contains: term, mode: "insensitive" } } },
			],
		};
	}

	private buildWhere(input: DealListInput): Prisma.DealWhereInput {
		const where: Prisma.DealWhereInput = this.searchFilter(input.q);

		if (input.owner !== FACET_ALL) {
			where.ownerId =
				input.owner === FACET_UNASSIGNED ? { in: [] } : input.owner;
		}

		if (input.status === "open") {
			where.stage = { in: [...OPEN_DEAL_STAGES] };
		} else if (input.status === "closed") {
			where.stage = { in: [...CLOSED_DEAL_STAGES] };
		}

		if (input.stage !== FACET_ALL) {
			where.stage = input.stage as DealStage;
		}

		if (input.closing !== FACET_ALL) {
			Object.assign(where, closingFilter(input.closing as ClosingWindow));
		}

		return where;
	}

	private async facetCounts(input: DealListInput) {
		const where = this.searchFilter(input.q);

		const [owners, stages, ...closingCounts] = await Promise.all([
			this.db.deal.groupBy({ by: ["ownerId"], where, _count: { _all: true } }),
			this.db.deal.groupBy({ by: ["stage"], where, _count: { _all: true } }),
			...CLOSING_WINDOWS.map((window) =>
				this.db.deal.count({ where: { ...where, ...closingFilter(window) } }),
			),
		]);

		const stageCounts = countsByKey(stages, "stage");
		const openCount = OPEN_DEAL_STAGES.reduce(
			(total, stage) => total + (stageCounts[stage] ?? 0),
			0,
		);
		const closedCount = CLOSED_DEAL_STAGES.reduce(
			(total, stage) => total + (stageCounts[stage] ?? 0),
			0,
		);

		return {
			status: { open: openCount, closed: closedCount },
			owner: countsByKey(owners, "ownerId", FACET_UNASSIGNED),
			stage: stageCounts,
			closing: Object.fromEntries(
				CLOSING_WINDOWS.map((window, index) => [
					window,
					closingCounts[index] ?? 0,
				]),
			),
		};
	}

	private translate(error: unknown, id: string): unknown {
		if (
			error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
			error.code === "P2025"
		) {
			return new NotFoundException(`No deal with id ${id}.`);
		}
		return this.translateRelations(error);
	}

	private translateRelations(error: unknown): unknown {
		if (
			error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
			(error.code === "P2003" || error.code === "P2025")
		) {
			return new BadRequestException(
				"That company or owner does not exist any more.",
			);
		}
		return error;
	}
}

function closingFilter(window: ClosingWindow): Prisma.DealWhereInput {
	const now = new Date();
	const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
	const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
	const startOfMonthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 1);

	switch (window) {
		case "overdue":
			return {
				expectedCloseDate: { lt: now },
				stage: { in: [...OPEN_DEAL_STAGES] },
			};
		case "this-month":
			return {
				expectedCloseDate: { gte: startOfMonth, lt: startOfNextMonth },
			};
		case "next-month":
			return {
				expectedCloseDate: { gte: startOfNextMonth, lt: startOfMonthAfter },
			};
		case "later":
			return { expectedCloseDate: { gte: startOfMonthAfter } };
		case "none":
			return { expectedCloseDate: null };
	}
}

function roleOrNull(value: string | null): string | null {
	return value === null ? null : blankToNull(value);
}

function parseDate(value: string | null | undefined): Date | null {
	if (value === null || value === undefined || value === "") return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new BadRequestException(`"${value}" is not a date.`);
	}
	return date;
}
