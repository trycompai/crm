import { ActivityType, db } from "@crm/db";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { extract, type JsonSchema } from "../lib/context-dev";
import { spend } from "../lib/focus";

const RESEARCH_SCHEMA: JsonSchema = {
	type: "object",
	properties: {
		positioning: {
			type: "string",
			description: "One paragraph: what they sell and who to.",
		},
		pricingModel: {
			type: "string",
			description: "How they charge — per seat, usage, flat, enterprise-only.",
		},
		targetCustomer: {
			type: "string",
			description: "The customer they describe themselves as serving.",
		},
		notableCustomers: {
			type: "array",
			items: { type: "string" },
			description: "Named customers or logos on the site.",
		},
		recentNews: {
			type: "array",
			items: { type: "string" },
			description: "Recent announcements, funding, or launches.",
		},
	},
	required: ["positioning"],
};

const RESEARCH_INSTRUCTIONS =
	"Read this company's marketing site and answer as a salesperson preparing " +
	"for a first call. Be specific and factual; leave a field empty rather than " +
	"guessing.";

const briefText = z.string().trim().min(1).nullable().catch(null);

const briefList = z
	.array(z.string().nullable().catch(null))
	.transform((items) => items.filter((item) => item !== null))
	.catch([]);

const briefScalar = z
	.union([z.string(), z.number(), z.boolean()])
	.nullable()
	.catch(null);

const researchBrief = z
	.object({
		positioning: briefText,
		pricingModel: briefText,
		targetCustomer: briefText,
		notableCustomers: briefList,
		recentNews: briefList,
	})
	.catch({
		positioning: null,
		pricingModel: null,
		targetCustomer: null,
		notableCustomers: [],
		recentNews: [],
	});

type ResearchBrief = z.infer<typeof researchBrief>;

export default defineTool({
	description:
		"Read a company's marketing site and write a research brief to its timeline: positioning, pricing, who they sell to, notable customers, recent news.",
	inputSchema: z.object({
		companyId: z.string(),
	}),
	async execute({ companyId }) {
		const company = await db.company.findUnique({
			where: { id: companyId },
			select: {
				id: true,
				name: true,
				domain: true,
				website: true,
				ownerId: true,
			},
		});

		if (!company)
			return { written: false as const, reason: "No such company." };

		const url =
			company.website ?? (company.domain ? `https://${company.domain}` : null);

		if (!url) {
			return {
				written: false as const,
				reason: "This company has no website.",
			};
		}

		const charge = spend(2);
		if (!charge.ok) return { written: false as const, reason: charge.reason };

		const result = await extract(url, RESEARCH_SCHEMA, RESEARCH_INSTRUCTIONS);

		if (result.outcome === "failed") {
			return { written: false as const, reason: result.reason };
		}

		const author =
			company.ownerId ??
			(await db.user.findFirst({ select: { id: true } }))?.id ??
			null;

		if (!author)
			return { written: false as const, reason: "No user to attribute to." };

		const scalar = briefScalar.parse(result.data);
		const activity = await db.activity.create({
			data: {
				type: ActivityType.ENRICHMENT,
				subject: `Research brief — ${company.name}`,
				body:
					scalar === null
						? formatBrief(researchBrief.parse(result.data))
						: String(scalar),
				occurredAt: new Date(),
				companyId: company.id,
				createdById: author,
				meta: {
					source: "context.dev",
					endpoint: "web/extract",
					creditCost: 10,
					agent: "people-research",
				},
			},
			select: { id: true },
		});

		await db.company.update({
			where: { id: companyId },
			data: { lastActivityAt: new Date() },
		});

		return { written: true as const, activityId: activity.id };
	},
});

function formatBrief(brief: ResearchBrief): string {
	const lines: string[] = [];

	if (brief.positioning) lines.push(brief.positioning);
	if (brief.pricingModel) lines.push(`Pricing: ${brief.pricingModel}`);
	if (brief.targetCustomer) lines.push(`Sells to: ${brief.targetCustomer}`);

	if (brief.notableCustomers.length > 0) {
		lines.push(`Customers: ${brief.notableCustomers.join(", ")}`);
	}

	if (brief.recentNews.length > 0) {
		lines.push(
			`Recently:\n${brief.recentNews.map((item) => `• ${item}`).join("\n")}`,
		);
	}

	return lines.join("\n\n");
}
