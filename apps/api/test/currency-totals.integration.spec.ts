import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DealStage, db, RateSource } from "@crm/db";
import { normalizeCurrency } from "@crm/db/currency";
import { SETTINGS_ID, writeReportingCurrency } from "@crm/db/settings";
import type { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { ActivityStampService } from "../src/crm/activity-stamp.service";
import { ConversionService } from "../src/currency/conversion.service";
import { DashboardService } from "../src/dashboard/dashboard.service";
import { DealsService } from "../src/deals/deals.service";
import { FieldsService } from "../src/fields/fields.service";
import { withDiscardedCrmEvents } from "./agent-trigger.stub";

const suffix = process.env.TEST_RUN_ID ?? "currency-totals-spec";
const userId = `user-${suffix}`;
const domain = `money-${suffix}.test`;

const agent = {
	withCrmEvents: withDiscardedCrmEvents,
} as unknown as AgentTriggerService;

const conversion = new ConversionService(db);
const deals = new DealsService(
	db,
	agent,
	new ActivityStampService(db),
	conversion,
	new FieldsService(db, { fieldBackfill: async () => undefined } as never),
);
const dashboard = new DashboardService(db, conversion);

let companyId: string;
let previousReportingCurrency: string | null = null;

const MILLION = 100_000_000;
const HALF_MILLION = 50_000_000;

async function rate(quote: string, value: string, source: RateSource) {
	await db.exchangeRate.upsert({
		where: {
			baseCurrency_quoteCurrency_source: {
				baseCurrency: "USD",
				quoteCurrency: quote,
				source,
			},
		},
		create: {
			baseCurrency: "USD",
			quoteCurrency: quote,
			rate: value,
			asOf: new Date("2026-08-01T00:00:00.000Z"),
			source,
		},
		update: { rate: value },
	});
}

async function clearRates() {
	await db.exchangeRate.deleteMany({
		where: {
			baseCurrency: { in: ["USD", "EUR"] },
			quoteCurrency: { in: ["USD", "EUR", "CHF"] },
		},
	});
}

async function pipelineCents(): Promise<number> {
	const summary = await dashboard.summary(userId, { scope: "me" });
	return summary.pipeline.totalCents;
}

beforeAll(async () => {
	const existing = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
		select: { reportingCurrency: true },
	});
	previousReportingCurrency = existing?.reportingCurrency ?? null;

	await writeReportingCurrency(db, "USD");
	await clearRates();

	await db.user.upsert({
		where: { id: userId },
		create: {
			id: userId,
			name: "Rate Tester",
			email: `rates@${domain}`,
			emailVerified: true,
		},
		update: {},
	});

	const company = await db.company.upsert({
		where: { domain },
		create: { name: `Money Co ${suffix}`, domain },
		update: {},
		select: { id: true },
	});
	companyId = company.id;

	await rate("EUR", "1.10", RateSource.FETCHED);
});

afterAll(async () => {
	await db.deal.deleteMany({ where: { companyId } });
	await db.company.deleteMany({ where: { domain } });
	await db.user.deleteMany({ where: { id: userId } });
	await clearRates();

	if (previousReportingCurrency) {
		await writeReportingCurrency(db, previousReportingCurrency);
	} else {
		await db.appSetting.updateMany({ data: { reportingCurrency: null } });
	}

	await conversion.rerateAll();
});

describe("a total across currencies", () => {
	it("converts on write and never adds two currencies together", async () => {
		await deals.create({
			name: `Domestic ${suffix}`,
			companyId,
			ownerId: userId,
			amountCents: MILLION,
			currency: "USD",
		});

		await deals.create({
			name: `Continental ${suffix}`,
			companyId,
			ownerId: userId,
			amountCents: MILLION,
			currency: "EUR",
		});

		expect(await pipelineCents()).toBe(MILLION + 1.1 * MILLION);
	});

	it("locks the rate onto the deal, so the row says how it was converted", async () => {
		const row = await db.deal.findFirst({
			where: { companyId, currency: "EUR" },
			select: { amount: true, baseAmount: true, fxRate: true, fxRateAt: true },
		});

		expect(row?.amount?.toNumber()).toBe(1_000_000);
		expect(row?.baseAmount?.toNumber()).toBe(1_100_000);
		expect(row?.fxRate?.toNumber()).toBe(1.1);
		expect(row?.fxRateAt).toBeInstanceOf(Date);
	});

	it("leaves a deal it cannot convert out of the total, and says so", async () => {
		const before = await pipelineCents();

		await deals.create({
			name: `Alpine ${suffix}`,
			companyId,
			ownerId: userId,
			amountCents: HALF_MILLION,
			currency: "CHF",
		});

		expect(await pipelineCents()).toBe(before);

		const summary = await dashboard.summary(userId, { scope: "me" });
		expect(summary.reportingCurrency).toBe("USD");
		expect(summary.unconverted.count).toBe(1);
		expect(summary.unconverted.currencies).toEqual(["CHF"]);
	});

	it("picks the waiting deal up when a rate finally arrives", async () => {
		await rate("CHF", "1.25", RateSource.MANUAL);

		const filled = await conversion.fillMissing();
		expect(filled.converted).toBeGreaterThan(0);

		expect(await pipelineCents()).toBe(
			MILLION + 1.1 * MILLION + 1.25 * HALF_MILLION,
		);

		const summary = await dashboard.summary(userId, { scope: "me" });
		expect(summary.unconverted.count).toBe(0);
	});

	it("does not re-rate a deal that already has a rate", async () => {
		await rate("EUR", "9.99", RateSource.FETCHED);

		await conversion.fillMissing();

		const row = await db.deal.findFirst({
			where: { companyId, currency: "EUR" },
			select: { baseAmount: true },
		});

		expect(row?.baseAmount?.toNumber()).toBe(1_100_000);
	});

	it("lets a rate entered by hand beat the fetched one on a re-rate", async () => {
		await rate("EUR", "1.50", RateSource.MANUAL);

		await conversion.rerateAll();

		const row = await db.deal.findFirst({
			where: { companyId, currency: "EUR" },
			select: { baseAmount: true, fxRate: true },
		});

		expect(row?.fxRate?.toNumber()).toBe(1.5);
		expect(row?.baseAmount?.toNumber()).toBe(1_500_000);
	});

	it("re-rates everything when the reporting currency changes", async () => {
		await writeReportingCurrency(db, "EUR");

		const rerated = await conversion.rerateAll();
		expect(rerated.missing).toContain("USD");

		const summary = await dashboard.summary(userId, { scope: "me" });

		expect(summary.reportingCurrency).toBe("EUR");
		expect(summary.pipeline.totalCents).toBe(MILLION);
		expect(summary.unconverted.currencies).toEqual(["CHF", "USD"]);
	});
});

describe("the deals list", () => {
	it("reports its open pipeline in the reporting currency and discloses the rest", async () => {
		await writeReportingCurrency(db, "USD");
		await conversion.rerateAll();

		const list = await deals.list({
			q: "",
			page: 1,
			pageSize: 25,
			sort: "amount",
			dir: "desc",
			status: "open",
			owner: userId,
			stage: "all",
			closing: "all",
		});

		expect(list.reportingCurrency).toBe("USD");
		expect(list.unconverted.count).toBe(0);
		expect(list.openValueCents).toBe(
			MILLION + 1.5 * MILLION + 1.25 * HALF_MILLION,
		);

		const amounts = list.rows.map((row) => row.baseAmountCents);
		expect(amounts).toEqual([...amounts].sort((a, b) => (b ?? 0) - (a ?? 0)));
	});
});

describe("a converted figure knows which currency it is in", () => {
	it("leaves a deal whose baseAmount predates a currency change out of totals", async () => {
		await writeReportingCurrency(db, "USD");
		await conversion.rerateAll();

		const before = await pipelineCents();
		const summary = await dashboard.summary(userId, { scope: "me" });
		expect(summary.unconverted.count).toBe(0);

		const deal = await deals.create({
			name: `Stale ${suffix}`,
			companyId,
			ownerId: userId,
			amountCents: MILLION,
			currency: "USD",
		});

		expect(await pipelineCents()).toBe(before + MILLION);

		await db.deal.update({
			where: { id: deal.id },
			data: { baseCurrency: "JPY" },
		});

		expect(await pipelineCents()).toBe(before);

		const stale = await dashboard.summary(userId, { scope: "me" });
		expect(stale.unconverted.count).toBe(1);

		const filled = await conversion.fillMissing();
		expect(filled.converted).toBeGreaterThan(0);

		expect(await pipelineCents()).toBe(before + MILLION);

		await db.deal.delete({ where: { id: deal.id } });
	});

	it("never lets a converted figure with no currency on it go unnoticed", async () => {
		await writeReportingCurrency(db, "USD");
		await conversion.rerateAll();

		const before = await pipelineCents();

		const orphan = await db.deal.create({
			data: {
				name: `Orphan ${suffix}`,
				companyId,
				ownerId: userId,
				amount: 50_000,
				currency: "USD",
				baseAmount: 50_000,
				fxRate: 1,
				fxRateAt: new Date(),
			},
			select: { id: true },
		});

		expect(await pipelineCents()).toBe(before);

		const summary = await dashboard.summary(userId, { scope: "me" });
		expect(summary.unconverted.count).toBe(1);

		await conversion.fillMissing();

		const healed = await db.deal.findUnique({
			where: { id: orphan.id },
			select: { baseCurrency: true },
		});
		expect(healed?.baseCurrency).toBe("USD");
		expect(await pipelineCents()).toBe(before + 5_000_000);

		await db.deal.delete({ where: { id: orphan.id } });
	});

	it("counts a currency once however it was cased or padded", async () => {
		const rows = await Promise.all(
			[" usd ", "Usd"].map((currency, index) =>
				db.deal.create({
					data: {
						name: `Variant ${index} ${suffix}`,
						companyId,
						ownerId: userId,
						amount: 1000,
						currency,
					},
					select: { id: true },
				}),
			),
		);

		const pending = await conversion.unconverted();
		expect(pending.currencies.filter((code) => code === "USD")).toEqual([
			"USD",
		]);

		const rerated = await conversion.rerateAll();

		const written = await db.deal.findMany({
			where: { id: { in: rows.map((row) => row.id) } },
			select: { baseAmount: true, baseCurrency: true },
		});

		for (const row of written) {
			expect(row.baseCurrency).toBe("USD");
			expect(row.baseAmount?.toNumber()).toBe(1000);
		}

		const groups = await db.deal.groupBy({
			by: ["currency"],
			where: { amount: { not: null } },
			_count: { _all: true },
		});

		const convertible = groups
			.filter(
				(group) => !rerated.missing.includes(normalizeCurrency(group.currency)),
			)
			.reduce((total, group) => total + group._count._all, 0);

		expect(rerated.converted).toBe(convertible);

		await db.deal.deleteMany({
			where: { id: { in: rows.map((row) => row.id) } },
		});
	});

	it("keeps a converted deal when the rate behind it has gone away", async () => {
		await writeReportingCurrency(db, "USD");
		await conversion.rerateAll();

		const deal = await deals.create({
			name: `Frozen ${suffix}`,
			companyId,
			ownerId: userId,
			amountCents: MILLION,
			currency: "EUR",
		});

		const frozen = await db.deal.findUnique({
			where: { id: deal.id },
			select: { baseAmount: true },
		});
		expect(frozen?.baseAmount).not.toBeNull();

		const before = await pipelineCents();

		await clearRates();

		const stranded = await db.deal.create({
			data: {
				name: `Stranded ${suffix}`,
				companyId,
				ownerId: userId,
				amount: 1000,
				currency: "EUR",
			},
			select: { id: true },
		});

		const filled = await conversion.fillMissing();
		expect(filled.missing).toContain("EUR");
		expect(filled.cleared).toBe(0);

		const kept = await db.deal.findUnique({
			where: { id: deal.id },
			select: { baseAmount: true, baseCurrency: true },
		});
		expect(kept?.baseCurrency).toBe("USD");
		expect(kept?.baseAmount?.toNumber()).toBe(frozen?.baseAmount?.toNumber());
		expect(await pipelineCents()).toBe(before);

		await db.deal.deleteMany({
			where: { id: { in: [deal.id, stranded.id] } },
		});
		await rate("EUR", "1.10", RateSource.FETCHED);
	});
});

describe("the dashboard only values what it can convert", () => {
	const analystId = `analyst-${suffix}`;

	beforeAll(async () => {
		await writeReportingCurrency(db, "USD");

		await db.user.upsert({
			where: { id: analystId },
			create: {
				id: analystId,
				name: "Dashboard Tester",
				email: `dashboard@${domain}`,
				emailVerified: true,
			},
			update: {},
		});
	});

	afterAll(async () => {
		await db.deal.deleteMany({ where: { ownerId: analystId } });
		await db.user.deleteMany({ where: { id: analystId } });
	});

	async function stale(name: string, stage: DealStage) {
		const closed = stage === DealStage.CLOSED_WON;

		return db.deal.create({
			data: {
				name: `${name} ${suffix}`,
				companyId,
				ownerId: analystId,
				stage,
				amount: 9_000,
				currency: "USD",
				baseAmount: 9_000,
				baseCurrency: "JPY",
				fxRate: 1,
				fxRateAt: new Date(),
				closedAt: closed ? new Date() : null,
			},
			select: { id: true },
		});
	}

	it("does not average a won deal it cannot value into the rest", async () => {
		const won = await deals.create({
			name: `Valued win ${suffix}`,
			companyId,
			ownerId: analystId,
			amountCents: 10_000,
			currency: "USD",
			stage: DealStage.CLOSED_WON,
		});

		const unvalued = await stale("Stale win", DealStage.CLOSED_WON);

		const summary = await dashboard.summary(analystId, { scope: "me" });

		expect(summary.performance.wins).toBe(2);
		expect(summary.performance.avgDealCents).toBe(10_000);
		expect(summary.unconverted.count).toBe(1);

		await db.deal.deleteMany({ where: { id: { in: [won.id, unvalued.id] } } });
	});

	it("does not let a stale figure set the largest open deal", async () => {
		const open = await deals.create({
			name: `Valued open ${suffix}`,
			companyId,
			ownerId: analystId,
			amountCents: 10_000,
			currency: "USD",
		});

		const unvalued = await stale("Stale open", DealStage.DEMO_BOOKED);

		const summary = await dashboard.summary(analystId, { scope: "me" });

		expect(summary.biggestOpen[0]?.id).toBe(open.id);
		expect(summary.biggestOpen[0]?.baseAmountCents).toBe(10_000);
		expect(
			summary.biggestOpen.find((deal) => deal.id === unvalued.id)
				?.baseAmountCents,
		).toBeNull();

		await db.deal.deleteMany({ where: { id: { in: [open.id, unvalued.id] } } });
	});
});
