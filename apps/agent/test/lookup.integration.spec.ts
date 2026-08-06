import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { DealStage, db } from "@crm/db";
import { listDeals, searchCrm } from "../agent/lib/lookup";

const suffix = process.env.TEST_RUN_ID ?? "lookup-spec";
const domain = `northwind-${suffix}.test`;
const otherDomain = `brightwater-${suffix}.test`;

let northwindId: string;
let brightwaterId: string;
let paulaId: string;
let peterId: string;
let dealId: string;
let freshDealId: string;
let closedDealId: string;

beforeAll(async () => {
	await cleanup();

	const user = await db.user.create({
		data: {
			id: `user-${suffix}`,
			name: "Rep One",
			email: `rep.${suffix}@example.test`,
			emailVerified: true,
			image: "https://cdn.example.test/rep-one.png",
		},
		select: { id: true },
	});

	const northwind = await db.company.create({
		data: {
			name: `Northwind ${suffix}`,
			domain,
			iconUrl: "https://cdn.example.test/northwind-icon.png",
			iconDarkUrl: "https://cdn.example.test/northwind-icon-dark.png",
			iconTone: "opaque",
			logoUrl: "https://cdn.example.test/northwind-logo.svg",
		},
		select: { id: true },
	});
	northwindId = northwind.id;

	const brightwater = await db.company.create({
		data: { name: `Brightwater ${suffix}`, domain: otherDomain },
		select: { id: true },
	});
	brightwaterId = brightwater.id;

	const paula = await db.contact.create({
		data: {
			firstName: "Paula",
			lastName: "Marchetti",
			title: "Growth Specialist",
			email: `paula.marchetti@${domain}`,
			companyId: northwindId,
			lastActivityAt: new Date(),
		},
		select: { id: true },
	});
	paulaId = paula.id;

	const peter = await db.contact.create({
		data: {
			firstName: "Peter",
			lastName: "Marchetti",
			title: "Controller",
			email: `peter.marchetti@${otherDomain}`,
			companyId: brightwaterId,
		},
		select: { id: true },
	});
	peterId = peter.id;

	const deal = await db.deal.create({
		data: {
			name: `Northwind renewal ${suffix}`,
			companyId: northwindId,
			ownerId: user.id,
			stage: DealStage.QUALIFIED_TO_BUY,
			amount: 12_000,
			lastActivityAt: new Date("2026-06-01T12:00:00.000Z"),
		},
		select: { id: true },
	});
	dealId = deal.id;

	const freshDeal = await db.deal.create({
		data: {
			name: `Fresh expansion ${suffix}`,
			companyId: northwindId,
			ownerId: user.id,
			stage: DealStage.CONTRACT_SENT,
			lastActivityAt: new Date("2026-08-04T12:00:00.000Z"),
		},
		select: { id: true },
	});
	freshDealId = freshDeal.id;

	const closedDeal = await db.deal.create({
		data: {
			name: `Closed renewal ${suffix}`,
			companyId: brightwaterId,
			ownerId: user.id,
			stage: DealStage.CLOSED_LOST,
			lastActivityAt: new Date("2026-05-01T12:00:00.000Z"),
		},
		select: { id: true },
	});
	closedDealId = closedDeal.id;
});

afterAll(cleanup);

async function cleanup(): Promise<void> {
	const companies = await db.company.findMany({
		where: { domain: { in: [domain, otherDomain] } },
		select: { id: true },
	});
	const ids = companies.map((company) => company.id);

	if (ids.length > 0) {
		await db.activity.deleteMany({ where: { companyId: { in: ids } } });
		await db.deal.deleteMany({ where: { companyId: { in: ids } } });
		await db.contact.deleteMany({ where: { companyId: { in: ids } } });
		await db.company.deleteMany({ where: { id: { in: ids } } });
	}

	await db.user.deleteMany({ where: { email: `rep.${suffix}@example.test` } });
}

describe("searchCrm", () => {
	it("finds a company by name", async () => {
		const result = await searchCrm(`Northwind ${suffix}`);

		expect(result.companies[0]?.id).toBe(northwindId);
		expect(result.companies[0]?.contacts).toBe(1);
	});

	it("finds the people at a company named in the query", async () => {
		const result = await searchCrm(`Northwind ${suffix}`);

		expect(result.contacts.map((hit) => hit.id)).toContain(paulaId);
	});

	it("returns both people behind an ambiguous surname", async () => {
		const result = await searchCrm("Marchetti");

		expect(result.contacts.map((hit) => hit.id).sort()).toEqual(
			[paulaId, peterId].sort(),
		);
		expect(result.contacts.every((hit) => hit.company !== null)).toBe(true);
		expect(result.contacts.map((hit) => hit.title)).toContain("Controller");
	});

	it("finds a person by their address, and the company on its domain", async () => {
		const result = await searchCrm(`paula.marchetti@${domain}`);

		expect(result.contacts[0]?.id).toBe(paulaId);
		expect(result.companies[0]?.id).toBe(northwindId);
	});

	it("treats a bare domain as the company", async () => {
		const result = await searchCrm(domain);

		expect(result.companies[0]?.id).toBe(northwindId);
	});

	it("finds a deal by name", async () => {
		const result = await searchCrm(`Northwind renewal ${suffix}`);

		expect(result.deals[0]?.id).toBe(dealId);
		expect(result.deals[0]?.amount).toBe(12_000);
	});

	it("narrows to the kinds asked for", async () => {
		const result = await searchCrm(`Northwind ${suffix}`, {
			kinds: ["contact"],
		});

		expect(result.companies).toHaveLength(0);
		expect(result.deals).toHaveLength(0);
		expect(result.contacts.length).toBeGreaterThan(0);
	});

	it("finds nothing rather than guessing", async () => {
		const result = await searchCrm("zzyzxqqq");

		expect(result.total).toBe(0);
	});

	it("ranks a whole-phrase match above rows sharing only one word", async () => {
		const result = await searchCrm(`Paula Marchetti`);

		expect(result.contacts[0]?.id).toBe(paulaId);
	});

	it("refuses a query too short to mean anything", async () => {
		expect((await searchCrm("a")).total).toBe(0);
	});
});

describe("listDeals", () => {
	it("lists stale open deals across the pipeline", async () => {
		const result = await listDeals({
			status: "open",
			inactiveForDays: 14,
			now: new Date("2026-08-05T12:00:00.000Z"),
		});
		const ids = result.deals.map((deal) => deal.id);

		expect(ids).toContain(dealId);
		expect(ids).not.toContain(freshDealId);
		expect(ids).not.toContain(closedDealId);
		expect(result.deals.find((deal) => deal.id === dealId)).toMatchObject({
			daysSinceLastActivity: 65,
			neverActive: false,
			company: {
				domain,
				iconUrl: "https://cdn.example.test/northwind-icon.png",
				iconDarkUrl: "https://cdn.example.test/northwind-icon-dark.png",
				iconTone: "opaque",
				logoUrl: "https://cdn.example.test/northwind-logo.svg",
			},
			owner: { image: "https://cdn.example.test/rep-one.png" },
		});
	});

	it("paginates a broad deal sweep without repeating a row", async () => {
		const first = await listDeals({ status: "all", limit: 1 });
		expect(first.hasMore).toBe(true);
		expect(first.nextCursor).toBeTruthy();

		const second = await listDeals({
			status: "all",
			limit: 1,
			cursor: first.nextCursor ?? undefined,
		});
		expect(second.deals[0]?.id).not.toBe(first.deals[0]?.id);
	});
});
