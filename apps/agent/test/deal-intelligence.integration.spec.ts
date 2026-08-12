import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DealStage, db } from "@crm/db";
import { effectiveForecastContext } from "@crm/db/deal-score";
import { writeDealIntelligence } from "../agent/lib/deal-intelligence";
import { brief } from "../agent/lib/dispatch";

const suffix = process.env.TEST_RUN_ID ?? crypto.randomUUID().slice(0, 8);
const domain = `deal-intel-${suffix}.test`;
const ownerId = `deal-intel-owner-${suffix}`;

let companyId = "";
let dealId = "";

async function clean() {
	if (dealId) {
		await db.deal.deleteMany({ where: { id: dealId } });
	}
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: ownerId } });
}

beforeAll(async () => {
	await clean();

	await db.user.create({
		data: {
			id: ownerId,
			name: "Intel Owner",
			email: `${ownerId}@example.test`,
			emailVerified: true,
		},
	});

	const company = await db.company.create({
		data: { name: `Intel Co ${suffix}`, domain },
		select: { id: true },
	});
	companyId = company.id;

	const deal = await db.deal.create({
		data: {
			name: `Intel Deal ${suffix}`,
			companyId,
			ownerId,
			stage: DealStage.DEMO_BOOKED,
			forecastContextManual: "Rep override stays put.",
		},
		select: { id: true },
	});
	dealId = deal.id;
});

afterAll(async () => {
	await clean();
});

const summary =
	"Stage is young with a champion on the account, but economic buyer coverage is thin and activity has slowed.";
const forecast =
	"Demo booked last week; next step is a technical review. Risk is no CFO contact and two quiet weeks on email.";

describe("writeDealIntelligence", () => {
	it("writes score fields without overwriting manual forecast", async () => {
		const result = await writeDealIntelligence({
			dealId,
			score: 67,
			summary,
			forecastContext: forecast,
		});

		expect(result.written).toBe(true);
		if (!result.written) return;

		const deal = await db.deal.findUnique({
			where: { id: dealId },
			select: {
				dealScore: true,
				dealScoreSummary: true,
				dealScoredAt: true,
				forecastContext: true,
				forecastContextManual: true,
			},
		});

		expect(deal?.dealScore).toBe(67);
		expect(deal?.dealScoreSummary).toBe(summary);
		expect(deal?.forecastContext).toBe(forecast);
		expect(deal?.forecastContextManual).toBe("Rep override stays put.");
		expect(deal?.dealScoredAt).not.toBeNull();
		expect(
			effectiveForecastContext(
				deal?.forecastContext,
				deal?.forecastContextManual,
			),
		).toBe("Rep override stays put.");
	});

	it("rejects empty summary", async () => {
		const result = await writeDealIntelligence({
			dealId,
			score: 50,
			summary: "   ",
			forecastContext: forecast,
		});
		expect(result.written).toBe(false);
	});

	it("briefs the research lane for deal-score tasks", () => {
		const text = brief({
			id: "t1",
			contactId: null,
			companyId: null,
			dealId,
			kind: "deal-score",
			reason: "Stage changed",
			payload: null,
			budget: 6,
			attempts: 1,
			priority: 80,
			dueAt: new Date(),
		});

		expect(text).toContain("write_deal_intelligence");
		expect(text).toContain("0–100");
		expect(text).toContain("forecastContextManual");
	});
});
