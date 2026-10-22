import { describe, expect, test } from "bun:test";
import type { ModelMessage } from "ai";
import {
	approvedDocumentationUrls,
	refuseWebSearch,
	webFetchAllowed,
} from "../agent/lib/web-policy";

const userMessage = (content: ModelMessage["content"]): ModelMessage => ({
	role: "user",
	content,
});

describe("workspace web policy", () => {
	test("allows an exact public link from the user", () => {
		const messages = [
			userMessage("Read https://example.com/path?view=full#details please."),
		];
		expect(
			webFetchAllowed("https://example.com/path?view=full#other", messages),
		).toBe(true);
	});

	test("allows a link from user text parts", () => {
		const messages = [
			userMessage([{ type: "text", text: "Open https://example.com/report" }]),
		];
		expect(webFetchAllowed("https://example.com/report", messages)).toBe(true);
	});

	test("allows an approved documentation entry page", () => {
		expect(webFetchAllowed("https://trycomp.ai/#product", [])).toBe(true);
		expect(approvedDocumentationUrls).toContain("https://linear.app/");
	});

	test("rejects an unapproved path and query", () => {
		expect(webFetchAllowed("https://example.com/private", [])).toBe(false);
		expect(webFetchAllowed("https://trycomp.ai/?secret=value", [])).toBe(false);
	});

	test("rejects local, insecure, and credentialed links", () => {
		const messages = [
			userMessage(
				"https://localhost.example.internal/ https://127.0.0.1/ http://example.com/ https://user:pass@example.com/",
			),
		];
		expect(
			webFetchAllowed("https://localhost.example.internal/", messages),
		).toBe(false);
		expect(webFetchAllowed("https://127.0.0.1/", messages)).toBe(false);
		expect(webFetchAllowed("http://example.com/", messages)).toBe(false);
		expect(webFetchAllowed("https://user:pass@example.com/", messages)).toBe(
			false,
		);
	});

	test("refuses every search query", () => {
		expect(() => refuseWebSearch({ query: "customer email contents" })).toThrow(
			"Search is disabled in workspace chats",
		);
	});
});
