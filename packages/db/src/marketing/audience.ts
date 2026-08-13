import type { Db } from "../client";
import type { Prisma } from "../generated/prisma/client";
import { segmentWhere } from "./segments";

export type CampaignSegment = {
	id: string;
	name: string;
	mode: "INCLUDE" | "EXCLUDE";
};

const LINKS = {
	orderBy: [{ mode: "asc" }, { addedAt: "asc" }],
	select: {
		mode: true,
		segment: {
			select: {
				id: true,
				name: true,
				definition: true,
				members: { select: { contactId: true, mode: true } },
			},
		},
	},
} satisfies Prisma.MarketingCampaignSegmentFindManyArgs;

export async function campaignSegments(
	db: Db,
	campaignId: string,
): Promise<CampaignSegment[]> {
	const links = await db.marketingCampaignSegment.findMany({
		where: { campaignId },
		...LINKS,
	});

	return links.map((link) => ({
		id: link.segment.id,
		name: link.segment.name,
		mode: link.mode,
	}));
}

export async function campaignAudienceWhere(
	db: Db,
	campaignId: string,
): Promise<Prisma.ContactWhereInput | null> {
	const links = await db.marketingCampaignSegment.findMany({
		where: { campaignId },
		...LINKS,
	});

	const included = links
		.filter((link) => link.mode === "INCLUDE")
		.map((link) => segmentWhere(link.segment));

	const excluded = links
		.filter((link) => link.mode === "EXCLUDE")
		.map((link) => segmentWhere(link.segment));

	if (included.length === 0) return null;

	return combine(included, excluded);
}

export function combine(
	included: Prisma.ContactWhereInput[],
	excluded: Prisma.ContactWhereInput[],
): Prisma.ContactWhereInput {
	const takes = included.length === 1 ? included[0] : { OR: included };
	if (excluded.length === 0) return takes as Prisma.ContactWhereInput;

	const drops = excluded.length === 1 ? excluded[0] : { OR: excluded };

	return { AND: [takes as Prisma.ContactWhereInput, { NOT: drops }] };
}

export async function setCampaignSegments(
	db: Db,
	campaignId: string,
	chosen: { segmentId: string; mode: "INCLUDE" | "EXCLUDE" }[],
): Promise<void> {
	const wanted = new Map(chosen.map((one) => [one.segmentId, one.mode]));

	await db.$transaction([
		db.marketingCampaignSegment.deleteMany({
			where: { campaignId, segmentId: { notIn: [...wanted.keys()] } },
		}),
		...[...wanted].map(([segmentId, mode]) =>
			db.marketingCampaignSegment.upsert({
				where: { campaignId_segmentId: { campaignId, segmentId } },
				create: { campaignId, segmentId, mode },
				update: { mode },
			}),
		),
	]);
}
