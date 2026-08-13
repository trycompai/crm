import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { resolveChrome } from "../agent/lib/chrome";
import { requestVerdict } from "../agent/lib/email-requests";
import {
	findingsFor,
	firstScreenImageCoverage,
	resolveReviewSource,
	visualRead,
} from "../agent/lib/email-review";
import { EMAIL_REVIEW } from "../agent/lib/email-review-config";
import type { ImageBox, ViewMeasurements } from "../agent/lib/email-screenshot";

function image(overrides: Partial<ImageBox> = {}): ImageBox {
	return {
		src: "https://blob.example/product.png",
		top: 0,
		left: 20,
		width: 560,
		height: 200,
		naturalWidth: 1120,
		naturalHeight: 400,
		...overrides,
	};
}

function view(overrides: Partial<ViewMeasurements> = {}): ViewMeasurements {
	return {
		view: "desktop",
		width: 600,
		foldHeight: 640,
		pageHeight: 1200,
		horizontalOverflowPx: 0,
		firstScreenTextCharacters: 400,
		images: [],
		blockedRequests: [],
		...overrides,
	};
}

const codes = (measurements: ViewMeasurements) =>
	findingsFor(measurements).map((finding) => finding.code);

describe("first-screen image coverage", () => {
	it("measures the intersection with the first screen, not the whole image", () => {
		const coverage = firstScreenImageCoverage(
			view({ images: [image({ top: 80, height: 620 })] }),
		);

		expect(coverage).toBe(82);
	});

	it("clamps at 100 when an image is larger than the first screen", () => {
		const coverage = firstScreenImageCoverage(
			view({
				images: [image({ top: -100, left: -50, width: 900, height: 2000 })],
			}),
		);

		expect(coverage).toBe(100);
	});

	it("is zero with no images", () => {
		expect(firstScreenImageCoverage(view())).toBe(0);
	});
});

describe("findings", () => {
	it("catches a first screen that is a wall of product image", () => {
		const found = codes(
			view({
				firstScreenTextCharacters: 10,
				images: [image({ top: 80, height: 620, naturalWidth: 1300 })],
			}),
		);

		expect(found).toContain("image-dominates-first-screen");
		expect(found).toContain("little-text-on-first-screen");
		expect(found).toContain("image-taller-than-first-screen");
	});

	it("says which numbers it measured", () => {
		const finding = findingsFor(
			view({
				firstScreenTextCharacters: 10,
				images: [image({ top: 80, height: 620 })],
			}),
		).find((entry) => entry.code === "image-dominates-first-screen");

		expect(finding?.observed).toContain("82%");
		expect(finding?.observed).toContain("640px");
	});

	it("reports nothing on a balanced email", () => {
		expect(codes(view({ images: [image()] }))).toEqual([]);
	});

	it("reports an empty first screen once, not as missing text twice", () => {
		const found = codes(view({ firstScreenTextCharacters: 0 }));

		expect(found).toEqual(["empty-first-screen"]);
	});

	it("reports sideways scrolling on a narrow viewport", () => {
		const found = codes(
			view({ view: "mobile", width: 390, horizontalOverflowPx: 40 }),
		);

		expect(found).toContain("horizontal-overflow");
	});

	it("reports an image drawn wider than its source", () => {
		const found = codes(view({ images: [image({ naturalWidth: 300 })] }));

		expect(found).toContain("image-upscaled");
	});

	it("ignores an image far below the first screen", () => {
		const found = codes(view({ images: [image({ top: 2000, height: 700 })] }));

		expect(found).toEqual([]);
	});
});

describe("what the renderer is allowed to fetch", () => {
	const own = ["http://localhost:3000"];

	it("loads an inline image", async () => {
		expect(await requestVerdict("data:image/png;base64,iVBORw0=", [])).toEqual({
			allowed: true,
		});
	});

	it("loads this install's own origin, loopback and all", async () => {
		expect(await requestVerdict("http://localhost:3000/logo.png", own)).toEqual(
			{ allowed: true },
		);
	});

	it("refuses loopback that is not this install", async () => {
		const verdict = await requestVerdict("http://127.0.0.1:9200/_all", own);

		expect(verdict.allowed).toBe(false);
	});

	it("refuses a private, a link-local and a unique-local address", async () => {
		for (const url of [
			"http://10.0.0.5/secret",
			"http://169.254.169.254/latest/meta-data/",
			"http://[fd00::1]/inside",
			"http://100.64.0.1/carrier",
		]) {
			expect((await requestVerdict(url, own)).allowed).toBe(false);
		}
	});

	it("loads a public address", async () => {
		expect(await requestVerdict("https://93.184.216.34/hero.png", own)).toEqual(
			{ allowed: true },
		);
	});

	it("refuses a scheme that is not http", async () => {
		const verdict = await requestVerdict("file:///etc/passwd", own);

		expect(verdict.allowed).toBe(false);
	});
});

describe("resolving what to review", () => {
	it("refuses zero sources", async () => {
		const resolved = await resolveReviewSource({});

		expect("error" in resolved && resolved.error).toContain("exactly one");
	});

	it("refuses two sources", async () => {
		const resolved = await resolveReviewSource({
			templateId: "one",
			nodeId: "two",
		});

		expect("error" in resolved && resolved.error).toContain("exactly one");
	});

	it("takes an unsaved draft without touching a record", async () => {
		const resolved = await resolveReviewSource({
			draft: {
				document: {
					version: 1,
					blocks: [{ type: "text", text: [{ text: "Hello there" }] }],
				},
				subject: "A subject",
			},
		});

		expect("error" in resolved).toBe(false);
		if ("error" in resolved) return;
		expect(resolved.label).toBe("the draft");
		expect(resolved.subject).toBe("A subject");
		expect(resolved.document.blocks).toHaveLength(1);
	});

	it("hands back the problems and the vocabulary for an unreadable draft", async () => {
		const resolved = await resolveReviewSource({
			draft: { document: { blocks: [{ type: "mystery" }] } },
		});

		expect("error" in resolved).toBe(true);
		if (!("error" in resolved)) return;
		expect(resolved.problems?.length).toBeGreaterThan(0);
		expect(resolved.shapes).toBeDefined();
	});
});

describe("finding a browser", () => {
	const saved = process.env[EMAIL_REVIEW.chrome.env];

	beforeEach(() => {
		delete process.env[EMAIL_REVIEW.chrome.env];
	});

	afterEach(() => {
		if (saved === undefined) delete process.env[EMAIL_REVIEW.chrome.env];
		else process.env[EMAIL_REVIEW.chrome.env] = saved;
	});

	it("finds nothing when nothing is there", () => {
		expect(resolveChrome([])).toBeNull();
	});

	it("prefers the variable when it points at a real file", () => {
		process.env[EMAIL_REVIEW.chrome.env] = process.execPath;

		expect(resolveChrome([])).toBe(process.execPath);
	});

	it("returns nothing when the variable points at a missing file", () => {
		process.env[EMAIL_REVIEW.chrome.env] = "/nowhere/chrome";

		expect(resolveChrome([process.execPath])).toBeNull();
	});

	it("falls back to a known location", () => {
		expect(resolveChrome([process.execPath])).toBe(process.execPath);
	});
});

describe("the visual read without a credential", () => {
	const saved = {
		gateway: process.env.AI_GATEWAY_API_KEY,
		oidc: process.env.VERCEL_OIDC_TOKEN,
	};

	beforeEach(() => {
		delete process.env.AI_GATEWAY_API_KEY;
		delete process.env.VERCEL_OIDC_TOKEN;
	});

	afterEach(() => {
		if (saved.gateway === undefined) delete process.env.AI_GATEWAY_API_KEY;
		else process.env.AI_GATEWAY_API_KEY = saved.gateway;
		if (saved.oidc === undefined) delete process.env.VERCEL_OIDC_TOKEN;
		else process.env.VERCEL_OIDC_TOKEN = saved.oidc;
	});

	it("reports itself skipped rather than failing the review", async () => {
		const read = await visualRead(
			[{ measurements: view(), screenshotBase64: "aGk=" }],
			"A subject",
		);

		expect("skipped" in read).toBe(true);
		if (!("skipped" in read)) return;
		expect(read.skipped).toContain("measurements are still exact");
	});
});
