import { type Db, Prisma } from "@crm/db";
import { filterSchema, segmentWhere } from "@crm/db/marketing";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { blankToNull } from "../crm/values";
import { InjectDatabase } from "../database/database.constants";
import { type ListInput, paginate, resolveOrderBy } from "../trpc/list-input";

export type SegmentRow = {
	id: string;
	name: string;
	description: string | null;
	type: "rule" | "hand" | "both";
	people: number;
	byRule: number;
	byHand: number;
	usedBy: { id: string; name: string; kind: string; role: string }[];
	refreshed: string;
	updatedAt: Date;
};

const SELECT = {
	id: true,
	name: true,
	description: true,
	definition: true,
	kind: true,
	lastCount: true,
	lastCountedAt: true,
	createdAt: true,
	updatedAt: true,
	members: {
		select: {
			contactId: true,
			mode: true,
			contact: {
				select: { id: true, firstName: true, lastName: true, email: true },
			},
		},
	},
} as const;

@Injectable()
export class MarketingSegmentsService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	private async count(segment: {
		definition: unknown;
		members: { contactId: string; mode: "INCLUDE" | "EXCLUDE" }[];
	}): Promise<{ total: number; byRule: number; byHand: number }> {
		const total = await this.db.contact.count({ where: segmentWhere(segment) });

		const byHand = segment.members.filter(
			(member) => member.mode === "INCLUDE",
		).length;
		const byRule = segment.definition
			? await this.db.contact.count({
					where: segmentWhere({ definition: segment.definition }),
				})
			: 0;

		return { total, byRule, byHand };
	}

	async list(input: ListInput) {
		const where: Prisma.MarketingSegmentWhereInput = {
			archivedAt: null,
			...(input.q && { name: { contains: input.q, mode: "insensitive" } }),
		};

		const orderBy =
			resolveOrderBy<Prisma.MarketingSegmentOrderByWithRelationInput>(
				input,
				{
					name: (dir) => ({ name: dir }),
					updatedAt: (dir) => ({ updatedAt: dir }),
				},
				{ updatedAt: "desc" },
			);

		const [rows, total] = await Promise.all([
			this.db.marketingSegment.findMany({
				where,
				orderBy,
				...paginate(input),
				select: {
					...SELECT,
					campaigns: {
						select: {
							mode: true,
							campaign: { select: { id: true, name: true, kind: true } },
						},
					},
				},
			}),
			this.db.marketingSegment.count({ where }),
		]);

		const withCounts = await Promise.all(
			rows.map(async (row) => {
				const counts = await this.count(row);
				const hasRule = row.definition !== null;
				const hasHands = counts.byHand > 0;

				return {
					id: row.id,
					name: row.name,
					description: row.description,
					type: (hasRule && hasHands
						? "both"
						: hasRule
							? "rule"
							: "hand") as SegmentRow["type"],
					people: counts.total,
					byRule: counts.byRule,
					byHand: counts.byHand,
					usedBy: row.campaigns.map((link) => ({
						id: link.campaign.id,
						name: link.campaign.name,
						kind: link.campaign.kind,
						role:
							link.mode === "EXCLUDE"
								? "Excluded"
								: link.campaign.kind === "DRIP"
									? "Entry"
									: "Audience",
					})),
					refreshed: hasRule ? "Live" : row.updatedAt.toISOString(),
					updatedAt: row.updatedAt,
				};
			}),
		);

		return { rows: withCounts, total, facetCounts: {} };
	}

	async byId(id: string) {
		const row = await this.db.marketingSegment.findUnique({
			where: { id },
			select: {
				...SELECT,
				campaigns: {
					select: {
						mode: true,
						campaign: {
							select: { id: true, name: true, kind: true, status: true },
						},
					},
				},
			},
		});

		if (!row) throw new NotFoundException("No such segment.");

		const counts = await this.count(row);

		const sendable = await this.db.contact.count({
			where: {
				AND: [
					segmentWhere(row),
					{ email: { not: null } },
					{
						OR: [
							{ marketingRecipients: { none: {} } },
							{ marketingRecipients: { some: { status: "SUBSCRIBED" } } },
						],
					},
				],
			},
		});

		const excluded = await this.db.contact.groupBy({
			by: ["id"],
			where: {
				AND: [
					segmentWhere(row),
					{ marketingRecipients: { some: { status: { not: "SUBSCRIBED" } } } },
				],
			},
			_count: { _all: true },
		});

		const sample = await this.db.contact.findMany({
			where: segmentWhere(row),
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				company: { select: { name: true } },
			},
			take: 5,
			orderBy: { createdAt: "desc" },
		});

		return {
			id: row.id,
			name: row.name,
			description: row.description,
			definition: row.definition as Record<string, unknown> | null,
			kind: row.kind,
			counts: { ...counts, sendable, suppressed: excluded.length },
			usedBy: row.campaigns.map((link) => ({
				...link.campaign,
				mode: link.mode,
			})),
			members: row.members.map((member) => ({
				contactId: member.contactId,
				mode: member.mode,
				name:
					[member.contact.firstName, member.contact.lastName]
						.filter(Boolean)
						.join(" ") ||
					(member.contact.email ?? "Somebody"),
				email: member.contact.email,
			})),
			sample: sample.map((contact) => ({
				id: contact.id,
				name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
				email: contact.email,
				company: contact.company?.name ?? null,
			})),
		};
	}

	async people(input: ListInput & { segmentId: string }) {
		const segment = await this.db.marketingSegment.findUnique({
			where: { id: input.segmentId },
			select: {
				definition: true,
				members: { select: { contactId: true, mode: true } },
			},
		});

		if (!segment) throw new NotFoundException("No such segment.");

		const where: Prisma.ContactWhereInput = {
			AND: [
				segmentWhere(segment),
				...(input.q
					? [
							{
								OR: [
									{
										firstName: {
											contains: input.q,
											mode: "insensitive" as const,
										},
									},
									{
										lastName: {
											contains: input.q,
											mode: "insensitive" as const,
										},
									},
									{
										email: { contains: input.q, mode: "insensitive" as const },
									},
								],
							},
						]
					: []),
			],
		};

		const [rows, total] = await Promise.all([
			this.db.contact.findMany({
				where,
				...paginate(input),
				orderBy: { createdAt: "desc" },
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					title: true,
					company: { select: { name: true } },
					marketingRecipients: { select: { status: true }, take: 1 },
				},
			}),
			this.db.contact.count({ where }),
		]);

		return {
			rows: rows.map((contact) => ({
				id: contact.id,
				name:
					[contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
					(contact.email ?? "Somebody"),
				email: contact.email,
				title: contact.title,
				company: contact.company?.name ?? null,
				status: contact.marketingRecipients[0]?.status ?? "SUBSCRIBED",
			})),
			total,
			facetCounts: {},
		};
	}

	async preview(definition: unknown) {
		const parsed = filterSchema.safeParse(definition);
		if (!parsed.success) {
			throw new BadRequestException("Those rules cannot be read.");
		}

		const where = segmentWhere({ definition: parsed.data });

		const [total, sample] = await Promise.all([
			this.db.contact.count({ where }),
			this.db.contact.findMany({
				where,
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					company: { select: { name: true } },
				},
				take: 20,
			}),
		]);

		return {
			total,
			sample: sample.map((contact) => ({
				id: contact.id,
				name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
				email: contact.email,
				company: contact.company?.name ?? null,
			})),
		};
	}

	async create(input: {
		name: string;
		description?: string | null;
		definition?: unknown;
	}) {
		const name = blankToNull(input.name);
		if (!name) throw new BadRequestException("Give the segment a name.");

		if (input.definition && !filterSchema.safeParse(input.definition).success) {
			throw new BadRequestException("Those rules cannot be read.");
		}

		try {
			return await this.db.marketingSegment.create({
				data: {
					name,
					description: input.description
						? blankToNull(input.description)
						: null,
					definition: (input.definition ?? undefined) as
						| Prisma.InputJsonValue
						| undefined,
					kind: input.definition ? "DYNAMIC" : "STATIC",
				},
				select: { id: true, name: true },
			});
		} catch (error) {
			throw this.translate(error, name);
		}
	}

	async update(input: {
		id: string;
		name?: string;
		description?: string | null;
		definition?: unknown;
	}) {
		if (input.definition !== undefined && input.definition !== null) {
			if (!filterSchema.safeParse(input.definition).success) {
				throw new BadRequestException("Those rules cannot be read.");
			}
		}

		try {
			return await this.db.marketingSegment.update({
				where: { id: input.id },
				data: {
					...(input.name && { name: input.name }),
					...(input.description !== undefined && {
						description: input.description
							? blankToNull(input.description)
							: null,
					}),
					...(input.definition !== undefined && {
						definition:
							input.definition === null
								? Prisma.DbNull
								: (input.definition as Prisma.InputJsonValue),
						kind: input.definition === null ? "STATIC" : "DYNAMIC",
					}),
				},
				select: { id: true },
			});
		} catch (error) {
			throw this.translate(error, input.name ?? input.id);
		}
	}

	async archive(id: string) {
		return this.db.marketingSegment.update({
			where: { id },
			data: { archivedAt: new Date() },
			select: { id: true },
		});
	}

	async addMember(segmentId: string, contactId: string, userId: string) {
		return this.db.marketingSegmentMember.upsert({
			where: { segmentId_contactId: { segmentId, contactId } },
			create: { segmentId, contactId, mode: "INCLUDE", addedById: userId },
			update: { mode: "INCLUDE", addedById: userId },
			select: { segmentId: true },
		});
	}

	async excludeMember(segmentId: string, contactId: string, userId: string) {
		return this.db.marketingSegmentMember.upsert({
			where: { segmentId_contactId: { segmentId, contactId } },
			create: { segmentId, contactId, mode: "EXCLUDE", addedById: userId },
			update: { mode: "EXCLUDE", addedById: userId },
			select: { segmentId: true },
		});
	}

	async removeMember(segmentId: string, contactId: string) {
		await this.db.marketingSegmentMember.deleteMany({
			where: { segmentId, contactId },
		});
		return { segmentId };
	}

	async options() {
		return this.db.marketingSegment.findMany({
			where: { archivedAt: null },
			select: { id: true, name: true },
			orderBy: { name: "asc" },
		});
	}

	async campaignOptions() {
		return this.db.marketingCampaign.findMany({
			select: { id: true, name: true },
			orderBy: { updatedAt: "desc" },
		});
	}

	private translate(error: unknown, name: string): unknown {
		if (error instanceof Prisma.PrismaClientKnownRequestError) {
			if (error.code === "P2025") {
				return new NotFoundException("That segment does not exist.");
			}
			if (error.code === "P2002") {
				return new ConflictException(
					`Another segment is already named ${name}.`,
				);
			}
		}
		return error;
	}
}
