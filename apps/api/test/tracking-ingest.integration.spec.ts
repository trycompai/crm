import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db } from "@crm/db";
import { EVENTS_PER_MINUTE, type TrackingConfig } from "@crm/db/tracking";
import type { TrackingConfigService } from "../src/tracking/tracking-config.service";
import { TrackingCounterService } from "../src/tracking/tracking-counter.service";
import type { TrackingFilingService } from "../src/tracking/tracking-filing.service";
import {
	type IncomingEvent,
	TrackingIngestService,
} from "../src/tracking/tracking-ingest.service";

const suffix = process.env.TEST_RUN_ID ?? "ingest-spec";
const parent = `sites-${suffix}.test`;
const child = `docs.${parent}`;
const exact = `shop-${suffix}.test`;

const SITE_ID = "cmp_1234abcd";

const config: TrackingConfig = {
	siteId: SITE_ID,
	crossDomain: true,
	limitToDomains: true,
	cookieSubdomains: false,
	secureCookies: true,
	honourDnt: true,
	cookieDays: 395,
	hosts: [
		{ host: parent, scope: "SITE_AND_SUBDOMAINS" },
		{ host: exact, scope: "EXACT_HOST" },
	],
};

const configService = {
	forSite: async (siteId: string) =>
		siteId === SITE_ID ? { config, hash: "0123456789ab" } : null,
} as unknown as TrackingConfigService;

const filed: string[] = [];

const filing = {
	file: async ({ id }: { id: string }) => {
		const claimed = await db.formSubmission.updateMany({
			where: { id, filedAt: null },
			data: { filedAt: new Date() },
		});

		if (claimed.count === 0) {
			return { filed: false as const, reason: "another delivery filed it" };
		}

		filed.push(id);

		return { filed: true as const, contactId: `contact-${id}` };
	},
} as unknown as TrackingFilingService;

const counters = new TrackingCounterService(db);
const ingest = new TrackingIngestService(db, configService, counters, filing);

const REQUEST = {
	origin: `https://${child}`,
	userAgent: "Mozilla/5.0",
};

const VISITOR_PREFIX = `ingest${suffix.replace(/[^a-zA-Z0-9]/g, "")}`;

let visitor = 0;

function visitorId(): string {
	visitor += 1;

	return `${VISITOR_PREFIX}${visitor}`;
}

async function accept(events: IncomingEvent[], id = visitorId()) {
	await ingest.accept({ siteId: SITE_ID, visitorId: id, events }, REQUEST);

	return id;
}

let tick = 0;

function view(host: string, path = "/pricing"): IncomingEvent {
	tick += 1;

	return { type: "page_view", host, path, at: Date.now() - tick };
}

async function clean() {
	for (const host of [parent, child, exact]) {
		await db.formSubmission.deleteMany({ where: { host } });
		await db.trackedEvent.deleteMany({ where: { host } });
	}

	await db.trackedDomain.deleteMany({
		where: { host: { in: [parent, exact] } },
	});
	await db.trackedVisitor.deleteMany({
		where: { id: { startsWith: VISITOR_PREFIX } },
	});
	await db.trackingCounter.deleteMany({ where: {} });
}

beforeAll(clean);

beforeEach(async () => {
	filed.length = 0;
	await clean();
	await db.trackedDomain.createMany({
		data: [
			{ host: parent, scope: "SITE_AND_SUBDOMAINS" },
			{ host: exact, scope: "EXACT_HOST" },
		],
	});
});

afterAll(clean);

describe("counting page views against a domain", () => {
	it("credits a subdomain's views to the parent that covers it", async () => {
		await accept([view(child), view(child), view(parent)]);

		const row = await db.trackedDomain.findUnique({
			where: { host: parent },
			select: { pageViews: true },
		});

		expect(row?.pageViews).toBe(3);
	});

	it("gives each domain only the views that were its own", async () => {
		await accept([view(child), view(exact), view(exact)]);

		const rows = await db.trackedDomain.findMany({
			where: { host: { in: [parent, exact] } },
			select: { host: true, pageViews: true },
			orderBy: { host: "asc" },
		});

		expect(rows.find((row) => row.host === parent)?.pageViews).toBe(1);
		expect(rows.find((row) => row.host === exact)?.pageViews).toBe(2);
	});

	it("does not count a click as a page view", async () => {
		await accept([
			view(parent),
			{ type: "click", host: parent, path: "/pricing", at: Date.now() },
		]);

		const row = await db.trackedDomain.findUnique({
			where: { host: parent },
			select: { pageViews: true },
		});

		expect(row?.pageViews).toBe(1);
	});
});

describe("the rate limit", () => {
	it("charges every event in the batch, not one per request", async () => {
		await accept([view(parent), view(parent), view(parent)]);

		const counter = await db.trackingCounter.findFirst({
			where: { key: { startsWith: "rate:" } },
			select: { value: true },
		});

		expect(counter?.value).toBe(3);
	});

	it("stops writing once the window is spent", async () => {
		await db.trackingCounter.deleteMany({ where: {} });

		for (const key of spendableWindows()) {
			await counters.take(key, EVENTS_PER_MINUTE, EVENTS_PER_MINUTE);
		}

		await accept([view(parent)]);

		expect(await db.trackedEvent.count({ where: { host: parent } })).toBe(0);
	});

	it("does not spend the window on a batch it refuses", async () => {
		await db.trackingCounter.deleteMany({ where: {} });

		for (const key of spendableWindows()) {
			await counters.take(key, EVENTS_PER_MINUTE, EVENTS_PER_MINUTE - 1);
		}

		await accept([view(parent), view(parent)]);
		expect(await db.trackedEvent.count({ where: { host: parent } })).toBe(0);

		await accept([view(parent)]);
		expect(await db.trackedEvent.count({ where: { host: parent } })).toBe(1);
	});
});

describe("what a stored event keeps", () => {
	it("never keeps the query string of a referrer", async () => {
		await accept([
			{
				type: "page_view",
				host: parent,
				path: "/pricing?plan=team",
				referrer: "https://elsewhere.test/reset?token=secret#x",
				at: Date.now(),
				touch: { referrer: "https://elsewhere.test/reset?token=secret" },
			},
		]);

		const row = await db.trackedEvent.findFirst({
			where: { host: parent },
			select: { path: true, referrer: true },
		});

		expect(row?.path).toBe("/pricing");
		expect(row?.referrer).toBe("https://elsewhere.test/reset");
	});

	it("never keeps it inside a submission's stored touch either", async () => {
		await accept([
			{
				type: "form_submit",
				host: parent,
				path: "/contact",
				at: Date.now(),
				fields: { email: `dana-${suffix}@acme.test` },
				touch: { referrer: "https://elsewhere.test/x?token=secret" },
				firstTouch: { referrer: "https://elsewhere.test/y?token=secret" },
			},
		]);

		const row = await db.formSubmission.findFirst({
			where: { host: parent },
			select: { firstTouch: true, lastTouch: true },
		});

		expect(JSON.stringify(row)).not.toContain("token=secret");
	});
});

describe("a batch delivered twice", () => {
	it("files the second delivery when the first left the row unfiled", async () => {
		const at = Date.now();
		const submission: IncomingEvent = {
			type: "form_submit",
			host: parent,
			path: "/contact",
			at,
			fields: { email: `twice-${suffix}@acme.test` },
		};

		const id = visitorId();
		await accept([submission], id);
		expect(filed).toHaveLength(1);

		await db.formSubmission.updateMany({
			where: { host: parent },
			data: { filedAt: null, contactId: null, skipReason: null },
		});

		await accept([submission], id);

		expect(filed).toHaveLength(2);
		expect(await db.formSubmission.count({ where: { host: parent } })).toBe(1);
	});

	it("files once when both deliveries arrive together", async () => {
		const at = Date.now();
		const submission: IncomingEvent = {
			type: "form_submit",
			host: parent,
			path: "/contact",
			at,
			fields: { email: `together-${suffix}@acme.test` },
		};

		const id = visitorId();
		await Promise.all([accept([submission], id), accept([submission], id)]);

		expect(await db.formSubmission.count({ where: { host: parent } })).toBe(1);
		expect(filed).toHaveLength(1);
	});

	it("leaves a submission alone once it has been filed", async () => {
		const at = Date.now();
		const submission: IncomingEvent = {
			type: "form_submit",
			host: parent,
			path: "/contact",
			at,
			fields: { email: `once-${suffix}@acme.test` },
		};

		const id = visitorId();
		await accept([submission], id);
		await db.formSubmission.updateMany({
			where: { host: parent },
			data: { filedAt: new Date() },
		});

		await accept([submission], id);

		expect(filed).toHaveLength(1);
	});
});

describe("the window a visitor was seen in", () => {
	it("moves firstSeen back for an event older than the stored first visit", async () => {
		const id = visitorId();
		const now = Date.now();
		const recent = now - 60_000;
		const delayed = now - 3_600_000;

		await accept(
			[{ type: "page_view", host: parent, path: "/a", at: recent }],
			id,
		);
		await accept(
			[{ type: "page_view", host: parent, path: "/b", at: delayed }],
			id,
		);

		const row = await db.trackedVisitor.findUnique({
			where: { id },
			select: { firstSeen: true, lastSeen: true },
		});

		expect(row?.firstSeen.getTime()).toBe(delayed);
		expect(row?.lastSeen.getTime()).toBe(recent);
	});

	it("keeps the later timestamp when two first batches arrive together", async () => {
		const id = visitorId();
		const now = Date.now();
		const older = now - 120_000;
		const newer = now - 1_000;

		await Promise.all([
			accept([{ type: "page_view", host: parent, path: "/a", at: older }], id),
			accept([{ type: "page_view", host: parent, path: "/b", at: newer }], id),
		]);

		const row = await db.trackedVisitor.findUnique({
			where: { id },
			select: { firstSeen: true, lastSeen: true },
		});

		expect(row?.firstSeen.getTime()).toBe(older);
		expect(row?.lastSeen.getTime()).toBe(newer);
	});
});

describe("a batch that looks scripted", () => {
	it("drops three events that share one timestamp", async () => {
		const at = Date.now();

		await accept([
			{ type: "page_view", host: parent, path: "/a", at },
			{ type: "page_view", host: parent, path: "/b", at },
			{ type: "page_view", host: parent, path: "/c", at },
		]);

		expect(await db.trackedEvent.count({ where: { host: parent } })).toBe(0);
	});

	it("keeps a batch whose events carry no timestamp at all", async () => {
		await accept([
			{ type: "page_view", host: parent, path: "/a" },
			{ type: "page_view", host: parent, path: "/b" },
			{ type: "page_view", host: parent, path: "/c" },
		]);

		expect(await db.trackedEvent.count({ where: { host: parent } })).toBe(3);
	});
});

function spendableWindows(): string[] {
	const bucket = Math.floor(Date.now() / 60_000);

	return [`rate:${bucket}`, `rate:${bucket + 1}`];
}
