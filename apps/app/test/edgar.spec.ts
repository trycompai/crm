import { afterEach, describe, expect, it } from "bun:test";
import {
	edgarConfigured,
	edgarHeaders,
	edgarPathAllowed,
	edgarTarget,
} from "../lib/edgar";

const savedUrl = process.env.EDGAR_URL;
const savedSecret = process.env.EDGAR_SECRET;

afterEach(() => {
	if (savedUrl === undefined) delete process.env.EDGAR_URL;
	else process.env.EDGAR_URL = savedUrl;
	if (savedSecret === undefined) delete process.env.EDGAR_SECRET;
	else process.env.EDGAR_SECRET = savedSecret;
});

describe("the app's edgar helpers", () => {
	it("is off without a URL", () => {
		delete process.env.EDGAR_URL;
		expect(edgarConfigured()).toBe(false);
		expect(edgarTarget("health", "")).toBeNull();
	});

	it("proxies only the routes the page reads", () => {
		for (const path of [
			"health",
			"companies/search",
			"companies/320193",
			"companies/AAPL",
			"companies/320193/filings",
			"companies/320193/owners",
			"companies/320193/insiders",
			"companies/320193/proxy",
			"filings/search",
			"compensation/compare",
		]) {
			expect(edgarPathAllowed(path)).toBe(true);
		}
		for (const path of [
			"",
			"docs",
			"companies/320193/secrets",
			"companies/../health",
			"companies/320193/filings/x",
		]) {
			expect(edgarPathAllowed(path)).toBe(false);
		}
	});

	it("builds the target from the URL, the path and the query", () => {
		process.env.EDGAR_URL = "http://127.0.0.1:2100/";
		expect(
			edgarTarget("companies/search", "?q=apple&limit=3")?.toString(),
		).toBe("http://127.0.0.1:2100/companies/search?q=apple&limit=3");
	});

	it("sends the secret only when it is set", () => {
		process.env.EDGAR_SECRET = "s3cret";
		expect(edgarHeaders()).toEqual({
			accept: "application/json",
			authorization: "Bearer s3cret",
		});
		delete process.env.EDGAR_SECRET;
		expect(edgarHeaders()).toEqual({ accept: "application/json" });
	});
});
