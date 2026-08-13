import { describe, expect, it } from "bun:test";
import type { Db } from "@crm/db";
import type { MarketingComposeService } from "../src/marketing/marketing-compose.service";
import { MarketingTemplatesService } from "../src/marketing/marketing-templates.service";

const BROKEN_DOCUMENT = { version: 1, blocks: [{ type: "heading" }] };

const compose = {
	contextFor: async () => {
		throw new Error("The preview composed an unreadable document.");
	},
	compose: async () => {
		throw new Error("The preview composed an unreadable document.");
	},
} as unknown as MarketingComposeService;

const db = {
	marketingPartial: {
		findUnique: async () => ({ kind: "HEADER", document: BROKEN_DOCUMENT }),
	},
} as unknown as Db;

const templates = new MarketingTemplatesService(db, compose);

describe("previewing content nobody can read", () => {
	it("refuses the email and says why", async () => {
		const result = await templates.preview({ document: BROKEN_DOCUMENT });

		expect(result.html).toBeNull();
		expect(result.blocked).toMatch(/cannot be read/);
	});

	it("still hands back the lint findings", async () => {
		const result = await templates.preview({ document: BROKEN_DOCUMENT });

		expect(Array.isArray(result.lint)).toBe(true);
	});

	it("refuses the shell and says why", async () => {
		const result = await templates.previewShell({ id: "shell_1" });

		expect(result.html).toBeNull();
		expect(result.blocked).toMatch(/cannot be read/);
	});
});
