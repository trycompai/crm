import { describe, expect, test } from "bun:test";
import { CLOSED_DEAL_STAGES } from "../src/deal-stage";
import { DealStage, RecordSource } from "../src/generated/prisma/enums";
import { compile, facetSchema } from "../src/marketing/segments";

describe("a facet only holds a value the database holds", () => {
	test("contact.source refuses anything but a record source", () => {
		expect(
			facetSchema.safeParse({ facet: "contact.source", source: "website" })
				.success,
		).toBe(false);

		const facet = facetSchema.parse({
			facet: "contact.source",
			source: RecordSource.IMPORT,
		});

		expect(compile({ facet })).toEqual({ source: RecordSource.IMPORT });
	});

	test("deal.atStage refuses anything but a deal stage", () => {
		expect(
			facetSchema.safeParse({ facet: "deal.atStage", stage: "closed" }).success,
		).toBe(false);

		const facet = facetSchema.parse({
			facet: "deal.atStage",
			stage: DealStage.CLOSED_WON,
		});

		expect(compile({ facet })).toEqual({
			deals: { some: { deal: { is: { stage: DealStage.CLOSED_WON } } } },
		});
	});
});

describe("a deal facet agrees with the rest of the CRM", () => {
	test("no open deal counts an unqualified deal as closed", () => {
		const stages = [...CLOSED_DEAL_STAGES];
		expect(stages).toContain(DealStage.UNQUALIFIED_TO_BUY);

		const facet = facetSchema.parse({ facet: "deal.hasNoOpen" });

		expect(compile({ facet })).toEqual({
			deals: { none: { deal: { is: { stage: { notIn: stages } } } } },
		});
	});

	test("closed won within reads the close date, not the last edit", () => {
		const facet = facetSchema.parse({
			facet: "deal.closedWonWithin",
			days: 30,
		});

		const where = JSON.stringify(compile({ facet }));

		expect(where).toContain("closedAt");
		expect(where).not.toContain("updatedAt");
	});
});
