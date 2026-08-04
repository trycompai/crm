import { describe, expect, it } from "bun:test";
import { isOnboarded, markOnboarded } from "../src/workspace";

const AT = new Date("2026-08-03T17:00:00.000Z");

describe("isOnboarded", () => {
	it("is false for a workspace nobody has answered for", () => {
		expect(isOnboarded(null)).toBe(false);
		expect(isOnboarded("")).toBe(false);
		expect(isOnboarded("{}")).toBe(false);
	});

	it("is true once the timestamp is in the metadata", () => {
		expect(isOnboarded('{"onboardedAt":"2026-08-03T16:59:29.675Z"}')).toBe(
			true,
		);
	});

	it("does not throw on metadata written by something else", () => {
		expect(isOnboarded("not json")).toBe(false);
		expect(isOnboarded("[1,2,3]")).toBe(false);
		expect(isOnboarded('{"onboardedAt":true}')).toBe(false);
	});
});

describe("markOnboarded", () => {
	it("records the moment the form was answered", () => {
		expect(JSON.parse(markOnboarded(null, AT))).toEqual({
			onboardedAt: AT.toISOString(),
		});
	});

	it("keeps the first answer, so saving settings again does not move it", () => {
		const first = markOnboarded(null, AT);
		const second = markOnboarded(first, new Date("2027-01-01T00:00:00.000Z"));

		expect(second).toBe(first);
	});

	it("leaves metadata the plugin owns alone", () => {
		expect(JSON.parse(markOnboarded('{"theme":"dark"}', AT))).toEqual({
			theme: "dark",
			onboardedAt: AT.toISOString(),
		});
	});
});
