import {
	ActivityType,
	type Db,
	type DealStage,
	type Prisma,
	Prisma as PrismaNamespace,
} from "@crm/db";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import {
	ActivityStampService,
	type StampTargets,
} from "../crm/activity-stamp.service";
import { fromCents, toCents } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import {
	countsByKey,
	FACET_ALL,
	FACET_UNASSIGNED,
	type ListResult,
	paginate,
	resolveOrderBy,
} from "../trpc/list-input";
import {
	CLOSED_DEAL_STAGES,
	isClosedStage,
	LOSING_DEAL_STAGES,
	OPEN_DEAL_STAGES,
} from "./deal-stage";
import type {
	ClosingWindow,
	DealCreateInput,
	DealListInput,
	DealUpdateInput,
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

const LOSING = new Set<DealStage>(LOSING_DEAL_STAGES);

const SORTABLE: Record<
	string,
	(dir: Prisma.SortOrder) => Prisma.DealOrderByWithRelationInput[]
> = {
	name: (dir) => [{ name: dir }],
	company: (dir) => [{ company: { name: dir } }, { name: "asc" }],
	stage: (dir) => [{ stage: dir }, { expectedCloseDate: "asc" }],
	amount: (dir) => [{ amount: dir }],
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
		private readonly stamp: ActivityStampService,
	) {}

	async list(input: DealListInput) {
		const where = this.buildWhere(input);
		const { skip, take } = paginate(input);

		const [rows, total, facetCounts, openValue] = await Promise.all([
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
					expectedCloseDate: true,
					closedAt: true,
					company: { select: COMPANY_SELECT },
					owner: { select: OWNER_SELECT },
					lastActivityAt: true,
					createdAt: true,
				},
			}),
			this.db.deal.count({ where }),
			this.facetCounts(input),
			this.db.deal.aggregate({
				where: { ...where, stage: { in: [...OPEN_DEAL_STAGES] } },
				_sum: { amount: true },
			}),
		]);

		return {
			rows: rows.map(
				({
					amount,
					expectedCloseDate,
					closedAt,
					lastActivityAt,
					createdAt,
					...row
				}) => ({
					...row,
					amountCents: toCents(amount),
					expectedCloseDate: expectedCloseDate?.toISOString() ?? null,
					closedAt: closedAt?.toISOString() ?? null,
					lastActivityAt: lastActivityAt?.toISOString() ?? null,
					createdAt: createdAt.toISOString(),
				}),
			),
			total,
			facetCounts,
			openValueCents: toCents(openValue._sum.amount),
		} satisfies ListResult<unknown> & { openValueCents: number | null };
	}

	async byId(id: string) {
		const deal = await this.db.deal.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				stage: true,
				stageChangedAt: true,
				amount: true,
				currency: true,
				expectedCloseDate: true,
				closedAt: true,
				closedReason: true,
				createdAt: true,
				company: { select: { ...COMPANY_SELECT, industry: true } },
				owner: { select: OWNER_SELECT },
				contacts: {
					select: {
						role: true,
						contact: {
							select: {
								id: true,
								firstName: true,
								lastName: true,
								email: true,
								title: true,
								imageUrl: true,
							},
						},
					},
				},
			},
		});

		if (!deal) {
			throw new NotFoundException(`No deal with id ${id}.`);
		}

		const { contacts, amount, ...rest } = deal;

		return {
			...rest,
			amountCents: toCents(amount),
			stageChangedAt: deal.stageChangedAt.toISOString(),
			expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
			closedAt: deal.closedAt?.toISOString() ?? null,
			createdAt: deal.createdAt.toISOString(),
			contacts: contacts.map(({ role, contact }) => ({ ...contact, role })),
		};
	}

	async create(input: DealCreateInput) {
		const stage = input.stage ?? "DEMO_BOOKED";
		const closed = isClosedStage(stage);
		const now = new Date();

		try {
			const deal = await this.db.deal.create({
				data: {
					name: input.name.trim(),
					companyId: input.companyId,
					ownerId: input.ownerId,
					stage,
					stageChangedAt: now,
					closedAt: closed ? now : null,
					amount: fromCents(input.amountCents),
					currency: input.currency ?? "EUR",
					expectedCloseDate: parseDate(input.expectedCloseDate),
				},
				select: { id: true, name: true, companyId: true },
			});

			this.logger.log({ message: "Deal created", dealId: deal.id, stage });

			return deal;
		} catch (error) {
			throw this.translateRelations(error);
		}
	}

	async update(id: string, input: DealUpdateInput) {
		const data: Prisma.DealUpdateInput = {};

		if (input.name !== undefined) data.name = input.name.trim();
		if (input.companyId !== undefined) {
			data.company = { connect: { id: input.companyId } };
		}
		if (input.ownerId !== undefined) {
			data.owner = { connect: { id: input.ownerId } };
		}
		if (input.amountCents !== undefined) {
			data.amount = fromCents(input.amountCents);
		}
		if (input.currency !== undefined) data.currency = input.currency;
		if (input.expectedCloseDate !== undefined) {
			data.expectedCloseDate = parseDate(input.expectedCloseDate);
		}

		try {
			return await this.db.deal.update({
				where: { id },
				data,
				select: { id: true, name: true },
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
		const deal = await this.db.deal.findUnique({
			where: { id: input.id },
			select: { id: true, stage: true, companyId: true },
		});

		if (!deal) {
			throw new NotFoundException(`No deal with id ${input.id}.`);
		}

		if (deal.stage === input.stage) {
			return { id: deal.id, stage: deal.stage, changed: false };
		}

		const closedReason = input.closedReason?.trim();
		if (LOSING.has(input.stage) && !closedReason) {
			throw new BadRequestException(
				"Say why it was lost — a closed-lost deal with no reason teaches nobody anything.",
			);
		}

		const now = new Date();
		const closed = isClosedStage(input.stage);

		const [updated] = await this.db.$transaction([
			this.db.deal.update({
				where: { id: input.id },
				data: {
					stage: input.stage,
					stageChangedAt: now,
					closedAt: closed ? now : null,
					closedReason: closed ? (closedReason ?? null) : null,
				},
				select: { id: true, stage: true },
			}),
			this.db.activity.create({
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
			}),
		]);

		await this.stamp.touch(
			{ companyId: deal.companyId, dealId: deal.id },
			new Date(),
		);

		this.logger.log({
			message: "Deal stage changed",
			dealId: deal.id,
			from: deal.stage,
			to: input.stage,
		});

		return { ...updated, changed: true };
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

function parseDate(value: string | null | undefined): Date | null {
	if (value === null || value === undefined || value === "") return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new BadRequestException(`"${value}" is not a date.`);
	}
	return date;
}
