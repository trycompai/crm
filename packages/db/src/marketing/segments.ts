import { z } from "zod";
import type { Db } from "../client";
import { CLOSED_DEAL_STAGES } from "../deal-stage";
import type { Prisma } from "../generated/prisma/client";
import { DealStage, RecordSource } from "../generated/prisma/enums";
import { FACET_LIMITS } from "./facet-limits";

const days = z
	.number()
	.int()
	.min(FACET_LIMITS.days.min)
	.max(FACET_LIMITS.days.max);
const text = z
	.string()
	.trim()
	.min(FACET_LIMITS.text.min)
	.max(FACET_LIMITS.text.max);

export const facetSchema = z.discriminatedUnion("facet", [
	z.object({ facet: z.literal("contact.hasEmail") }),
	z.object({ facet: z.literal("contact.owner"), userId: z.string().min(1) }),
	z.object({
		facet: z.literal("contact.source"),
		source: z.enum(RecordSource),
	}),
	z.object({ facet: z.literal("contact.titleContains"), value: text }),
	z.object({ facet: z.literal("contact.createdWithin"), days }),
	z.object({ facet: z.literal("company.industry"), value: text }),
	z.object({ facet: z.literal("company.country"), value: text }),
	z.object({
		facet: z.literal("company.domainIn"),
		domains: z.array(text).min(1).max(500),
	}),
	z.object({ facet: z.literal("field.equals"), key: text, value: text }),
	z.object({ facet: z.literal("activity.within"), days }),
	z.object({ facet: z.literal("activity.notWithin"), days }),
	z.object({ facet: z.literal("deal.atStage"), stage: z.enum(DealStage) }),
	z.object({ facet: z.literal("deal.hasNoOpen") }),
	z.object({ facet: z.literal("deal.closedWonWithin"), days }),
	z.object({ facet: z.literal("mailbox.repliedWithin"), days }),
	z.object({ facet: z.literal("mailbox.neverReplied") }),
	z.object({ facet: z.literal("meeting.bookedWithin"), days }),
	z.object({ facet: z.literal("meeting.notBookedWithin"), days }),
	z.object({
		facet: z.literal("tracking.visitedPath"),
		path: text,
		atLeast: z.number().int().min(1).max(100).default(1),
	}),
	z.object({ facet: z.literal("tracking.submittedForm"), path: text }),
	z.object({
		facet: z.literal("marketing.openedCampaign"),
		campaignId: z.string().min(1),
	}),
	z.object({
		facet: z.literal("marketing.clickedCampaign"),
		campaignId: z.string().min(1),
	}),
	z.object({
		facet: z.literal("marketing.inCampaign"),
		campaignId: z.string().min(1),
	}),
	z.object({ facet: z.literal("marketing.noSendWithin"), days }),
]);

export type Facet = z.infer<typeof facetSchema>;

export type Filter =
	| { all: Filter[] }
	| { any: Filter[] }
	| { not: Filter }
	| { facet: Facet };

export const filterSchema: z.ZodType<Filter> = z.lazy(() =>
	z.union([
		z.object({ all: z.array(filterSchema).max(50) }),
		z.object({ any: z.array(filterSchema).max(50) }),
		z.object({ not: filterSchema }),
		z.object({ facet: facetSchema }),
	]),
);

function ago(days: number): Date {
	return new Date(Date.now() - days * 86_400_000);
}

function compileFacet(facet: Facet): Prisma.ContactWhereInput {
	switch (facet.facet) {
		case "contact.hasEmail":
			return { email: { not: null } };
		case "contact.owner":
			return { ownerId: facet.userId };
		case "contact.source":
			return { source: facet.source };
		case "contact.titleContains":
			return { title: { contains: facet.value, mode: "insensitive" } };
		case "contact.createdWithin":
			return { createdAt: { gte: ago(facet.days) } };
		case "company.industry":
			return {
				company: {
					is: { industry: { equals: facet.value, mode: "insensitive" } },
				},
			};
		case "company.country":
			return {
				company: {
					is: { country: { equals: facet.value, mode: "insensitive" } },
				},
			};
		case "company.domainIn":
			return {
				company: {
					is: {
						domain: {
							in: facet.domains.map((domain: string) => domain.toLowerCase()),
						},
					},
				},
			};
		case "field.equals":
			return {
				fieldValues: {
					some: { field: { is: { key: facet.key } }, text: facet.value },
				},
			};
		case "activity.within":
			return { lastActivityAt: { gte: ago(facet.days) } };
		case "activity.notWithin":
			return {
				OR: [
					{ lastActivityAt: null },
					{ lastActivityAt: { lt: ago(facet.days) } },
				],
			};
		case "deal.atStage":
			return {
				deals: {
					some: { deal: { is: { stage: facet.stage } } },
				},
			};
		case "deal.hasNoOpen":
			return {
				deals: {
					none: {
						deal: {
							is: {
								stage: { notIn: [...CLOSED_DEAL_STAGES] },
							},
						},
					},
				},
			};
		case "deal.closedWonWithin":
			return {
				deals: {
					some: {
						deal: {
							is: {
								stage: DealStage.CLOSED_WON,
								closedAt: { gte: ago(facet.days) },
							},
						},
					},
				},
			};
		case "mailbox.repliedWithin":
			return {
				emailThreads: {
					some: {
						messages: {
							some: {
								direction: "INBOUND" as never,
								sentAt: { gte: ago(facet.days) },
							},
						},
					},
				},
			};
		case "mailbox.neverReplied":
			return {
				emailThreads: {
					none: { messages: { some: { direction: "INBOUND" as never } } },
				},
			};
		case "meeting.bookedWithin":
			return {
				eventAttendance: {
					some: { event: { is: { startsAt: { gte: ago(facet.days) } } } },
				},
			};
		case "meeting.notBookedWithin":
			return {
				eventAttendance: {
					none: { event: { is: { startsAt: { gte: ago(facet.days) } } } },
				},
			};
		case "tracking.visitedPath":
			return {
				visitors: {
					some: { events: { some: { path: { startsWith: facet.path } } } },
				},
			};
		case "tracking.submittedForm":
			return { submissions: { some: { path: { startsWith: facet.path } } } };
		case "marketing.openedCampaign":
			return {
				marketingRecipients: {
					some: {
						sends: {
							some: { campaignId: facet.campaignId, openedAt: { not: null } },
						},
					},
				},
			};
		case "marketing.clickedCampaign":
			return {
				marketingRecipients: {
					some: {
						sends: {
							some: { campaignId: facet.campaignId, clickedAt: { not: null } },
						},
					},
				},
			};
		case "marketing.inCampaign":
			return {
				marketingEnrolments: {
					some: { campaignId: facet.campaignId, status: "ACTIVE" },
				},
			};
		case "marketing.noSendWithin":
			return {
				marketingRecipients: {
					none: { sends: { some: { sentAt: { gte: ago(facet.days) } } } },
				},
			};
		default:
			return {};
	}
}

export function compile(filter: Filter): Prisma.ContactWhereInput {
	if ("all" in filter) return { AND: filter.all.map(compile) };
	if ("any" in filter) return { OR: filter.any.map(compile) };
	if ("not" in filter) return { NOT: compile(filter.not) };
	return compileFacet(filter.facet);
}

export function matches(
	db: Db,
	filter: Filter,
	contactIds: string[],
): Promise<{ id: string }[]> {
	if (contactIds.length === 0) return Promise.resolve([]);

	return db.contact.findMany({
		where: { AND: [compile(filter), { id: { in: contactIds } }] },
		select: { id: true },
	});
}

export function segmentWhere(segment: {
	definition: unknown;
	members?: { contactId: string; mode: "INCLUDE" | "EXCLUDE" }[];
}): Prisma.ContactWhereInput {
	const parsed = segment.definition
		? filterSchema.safeParse(segment.definition)
		: null;
	const rule = parsed?.success ? compile(parsed.data) : null;

	const included = (segment.members ?? [])
		.filter((m) => m.mode === "INCLUDE")
		.map((m) => m.contactId);
	const excluded = (segment.members ?? [])
		.filter((m) => m.mode === "EXCLUDE")
		.map((m) => m.contactId);

	const positives: Prisma.ContactWhereInput[] = [];
	if (rule) positives.push(rule);
	if (included.length > 0) positives.push({ id: { in: included } });

	if (positives.length === 0) return { id: { in: [] } };

	const where: Prisma.ContactWhereInput =
		positives.length === 1
			? (positives[0] as Prisma.ContactWhereInput)
			: { OR: positives };

	return excluded.length > 0
		? { AND: [where, { id: { notIn: excluded } }] }
		: where;
}

export const DEFAULT_SEGMENTS = [
	{
		name: "All contacts",
		description: "Everybody with an email address.",
		definition: { facet: { facet: "contact.hasEmail" } },
	},
	{
		name: "Added in the last 30 days",
		description: "New to the CRM, and reachable.",
		definition: {
			all: [
				{ facet: { facet: "contact.hasEmail" } },
				{ facet: { facet: "contact.createdWithin", days: 30 } },
			],
		},
	},
	{
		name: "Quiet for 60 days",
		description: "Nothing has happened with them in two months.",
		definition: {
			all: [
				{ facet: { facet: "contact.hasEmail" } },
				{ facet: { facet: "activity.notWithin", days: 60 } },
			],
		},
	},
	{
		name: "No open deal",
		description: "Reachable, and nothing is in the pipeline for them.",
		definition: {
			all: [
				{ facet: { facet: "contact.hasEmail" } },
				{ facet: { facet: "deal.hasNoOpen" } },
			],
		},
	},
] as const;

export async function ensureDefaultSegments(db: Db): Promise<number> {
	let made = 0;

	const alive = await db.marketingSegment.count({
		where: { isDefault: true, archivedAt: null },
	});

	if (alive >= DEFAULT_SEGMENTS.length) return 0;

	for (const segment of DEFAULT_SEGMENTS) {
		const clash = await db.marketingSegment.findFirst({
			where: { name: segment.name },
			select: { id: true, isDefault: true, archivedAt: true },
		});

		if (clash) {
			if (!clash.isDefault || clash.archivedAt) {
				await db.marketingSegment.update({
					where: { id: clash.id },
					data: { isDefault: true, archivedAt: null },
				});
			}
			continue;
		}

		await db.marketingSegment.upsert({
			where: { name: segment.name },
			update: { isDefault: true, archivedAt: null },
			create: {
				name: segment.name,
				description: segment.description,
				definition: segment.definition as Prisma.InputJsonValue,
				isDefault: true,
			},
		});

		made += 1;
	}

	return made;
}
