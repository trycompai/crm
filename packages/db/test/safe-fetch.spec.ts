import { describe, expect, it } from "bun:test";
import { resolvesToPublicHost, safeFetch } from "../src/safe-fetch";

describe("resolvesToPublicHost", () => {
	it("rejects blocked literals", async () => {
		expect(await resolvesToPublicHost("127.0.0.1")).toBe(false);
		expect(await resolvesToPublicHost("169.254.169.254")).toBe(false);
		expect(await resolvesToPublicHost("[::1]")).toBe(false);
		expect(await resolvesToPublicHost("10.0.0.5")).toBe(false);
	});

	it("accepts a public literal", async () => {
		expect(await resolvesToPublicHost("8.8.8.8")).toBe(true);
	});
});

describe("safeFetch", () => {
	it("refuses a non-http scheme", async () => {
		expect(await safeFetch("ftp://example.com/x")).toBeNull();
	});

	it("refuses a blocked literal host", async () => {
		expect(await safeFetch("http://169.254.169.254/latest/meta-data/")).toBeNull();
		expect(await safeFetch("http://127.0.0.1/")).toBeNull();
	});

	it("refuses a host that does not resolve", async () => {
		expect(await safeFetch("http://nonexistent.invalid/")).toBeNull();
	});
});
