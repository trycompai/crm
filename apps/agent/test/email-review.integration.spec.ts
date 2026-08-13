import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, type Prisma } from "@crm/db";
import { SETTINGS_ID } from "@crm/db/settings";
import { resolveChrome } from "../agent/lib/chrome";
import {
	composeReviewHtml,
	findingsFor,
	resolveReviewSource,
	reviewEmail,
} from "../agent/lib/email-review";
import { captureEmail } from "../agent/lib/email-screenshot";

const suffix = process.env.TEST_RUN_ID ?? "email-review-spec";
const TAG = `review-${suffix}`;
const APP_URL = "http://localhost:3000";

const DOCUMENT = {
	version: 1,
	blocks: [
		{
			type: "text",
			text: [{ text: "A short paragraph that says something useful." }],
		},
	],
};

let templateId: string;
let emailNodeId: string;
let waitNodeId: string;

let savedSetting: Prisma.AppSettingUncheckedCreateInput | null = null;
const savedAppUrl = process.env.APP_URL;

async function cleanup() {
	await db.marketingCampaign.deleteMany({ where: { name: { contains: TAG } } });
	await db.marketingTemplate.deleteMany({ where: { name: { contains: TAG } } });
}

beforeAll(async () => {
	await cleanup();

	savedSetting = await db.appSetting.findUnique({ where: { id: SETTINGS_ID } });

	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, marketingPostalAddress: "1 Test Street" },
		update: { marketingPostalAddress: "1 Test Street" },
	});

	process.env.APP_URL = APP_URL;

	const template = await db.marketingTemplate.create({
		data: {
			name: `${TAG} welcome`,
			subject: "Welcome aboard",
			document: DOCUMENT,
		},
		select: { id: true },
	});
	templateId = template.id;

	const campaign = await db.marketingCampaign.create({
		data: {
			name: `${TAG} drip`,
			kind: "DRIP",
			status: "DRAFT",
			nodes: {
				create: [
					{
						kind: "EMAIL",
						label: "Touch 1",
						subject: "Hello",
						document: DOCUMENT,
						x: 0,
						y: 0,
					},
					{ kind: "WAIT", label: "Wait", delayHours: 48, x: 0, y: 120 },
				],
			},
		},
		select: { nodes: { select: { id: true, kind: true } } },
	});

	emailNodeId = campaign.nodes.find((node) => node.kind === "EMAIL")?.id ?? "";
	waitNodeId = campaign.nodes.find((node) => node.kind === "WAIT")?.id ?? "";
});

afterAll(async () => {
	await cleanup();

	await db.appSetting.deleteMany({ where: { id: SETTINGS_ID } });
	if (savedSetting) await db.appSetting.create({ data: savedSetting });

	if (savedAppUrl === undefined) delete process.env.APP_URL;
	else process.env.APP_URL = savedAppUrl;
});

describe("resolving records", () => {
	it("reads a template", async () => {
		const resolved = await resolveReviewSource({ templateId });

		expect("error" in resolved).toBe(false);
		if ("error" in resolved) return;
		expect(resolved.subject).toBe("Welcome aboard");
		expect(resolved.label).toContain("welcome");
	});

	it("reads an EMAIL campaign step", async () => {
		const resolved = await resolveReviewSource({ nodeId: emailNodeId });

		expect("error" in resolved).toBe(false);
		if ("error" in resolved) return;
		expect(resolved.subject).toBe("Hello");
		expect(resolved.label).toContain("Touch 1");
	});

	it("refuses a WAIT step by name", async () => {
		const resolved = await resolveReviewSource({ nodeId: waitNodeId });

		expect("error" in resolved && resolved.error).toContain("WAIT");
	});

	it("refuses an id that is nothing", async () => {
		const resolved = await resolveReviewSource({ templateId: "not-a-row" });

		expect("error" in resolved && resolved.error).toContain(
			"No template with that id",
		);
	});
});

describe("composing the preview", () => {
	it("wraps the body in the real shell", async () => {
		const resolved = await resolveReviewSource({ templateId });
		if ("error" in resolved) throw new Error(resolved.error);

		const composed = await composeReviewHtml(resolved);

		expect("blocked" in composed).toBe(false);
		if ("blocked" in composed) return;
		expect(composed.html).toContain("A short paragraph");
		expect(composed.html).toContain("Unsubscribe");
		expect(composed.html).toContain("1 Test Street");
	});

	it("says what is missing rather than rendering a shell-less email", async () => {
		const resolved = await resolveReviewSource({ templateId });
		if ("error" in resolved) throw new Error(resolved.error);

		delete process.env.APP_URL;

		try {
			const composed = await composeReviewHtml(resolved);

			expect("blocked" in composed).toBe(true);
			if (!("blocked" in composed)) return;
			expect(composed.blocked).toContain("APP_URL");
		} finally {
			process.env.APP_URL = APP_URL;
		}
	});

	it("returns a browser failure as a result, never a throw", async () => {
		const result = await reviewEmail({ templateId }, "/nowhere/chrome");

		expect("error" in result && result.error).toContain("could not render");
	});
});

const chrome = resolveChrome();

const PIXEL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("rendering in a real browser", () => {
	it.skipIf(chrome === null)(
		"measures a wall-of-image first screen (skipped without a Chrome executable)",
		async () => {
			const html = [
				'<!doctype html><html><body style="margin:0">',
				`<img src="${PIXEL}" width="560" height="620" style="display:block">`,
				'<p style="font:14px sans-serif">Tiny caption</p>',
				"</body></html>",
			].join("");

			const screens = await captureEmail(
				html,
				[{ view: "desktop", width: 600, height: 640 }],
				chrome ?? "",
			);

			expect(screens).toHaveLength(1);
			const screen = screens[0];
			if (!screen) throw new Error("no screen captured");

			expect(screen.screenshotBase64.length).toBeGreaterThan(1000);
			expect(screen.measurements.images).toHaveLength(1);
			expect(screen.measurements.images[0]?.height).toBe(620);

			const codes = findingsFor(screen.measurements).map(
				(finding) => finding.code,
			);
			expect(codes).toContain("image-dominates-first-screen");
			expect(codes).toContain("image-taller-than-first-screen");
			expect(codes).toContain("little-text-on-first-screen");
		},
		30_000,
	);

	it.skipIf(chrome === null)(
		"sees the text a reader sees (skipped without a Chrome executable)",
		async () => {
			const paragraph = "Readable words. ".repeat(30).trim();
			const html = `<!doctype html><html><body style="margin:0"><p style="font:14px sans-serif">${paragraph}</p></body></html>`;

			const screens = await captureEmail(
				html,
				[{ view: "mobile", width: 390, height: 660 }],
				chrome ?? "",
			);

			const screen = screens[0];
			if (!screen) throw new Error("no screen captured");

			expect(
				screen.measurements.firstScreenTextCharacters,
			).toBeGreaterThanOrEqual(paragraph.length);
			expect(screen.measurements.horizontalOverflowPx).toBe(0);
			expect(findingsFor(screen.measurements)).toEqual([]);
		},
		30_000,
	);

	it.skipIf(chrome === null)(
		"counts only the lines above the fold (skipped without a Chrome executable)",
		async () => {
			const paragraph = "Readable words. ".repeat(60).trim();
			const html = `<!doctype html><html><body style="margin:0"><p style="font:14px/20px sans-serif">${paragraph}</p></body></html>`;

			const screens = await captureEmail(
				html,
				[{ view: "mobile", width: 390, height: 100 }],
				chrome ?? "",
			);

			const screen = screens[0];
			if (!screen) throw new Error("no screen captured");

			const counted = screen.measurements.firstScreenTextCharacters;
			expect(counted).toBeGreaterThan(0);
			expect(counted).toBeLessThan(paragraph.length / 2);
		},
		30_000,
	);

	it.skipIf(chrome === null)(
		"never fetches an image on a private address (skipped without a Chrome executable)",
		async () => {
			const metadata = "http://169.254.169.254/latest/meta-data/";
			const html = [
				'<!doctype html><html><body style="margin:0">',
				`<img src="${metadata}" width="300" height="200">`,
				'<p style="font:14px sans-serif">A caption a reader can read.</p>',
				"</body></html>",
			].join("");

			const screens = await captureEmail(
				html,
				[{ view: "desktop", width: 600, height: 640 }],
				chrome ?? "",
			);

			const screen = screens[0];
			if (!screen) throw new Error("no screen captured");

			expect(screen.measurements.blockedRequests).toEqual([metadata]);
			expect(findingsFor(screen.measurements).map((one) => one.code)).toContain(
				"address-not-loaded",
			);
		},
		30_000,
	);
});
