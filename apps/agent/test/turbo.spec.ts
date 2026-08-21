import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const turbo = readFileSync(join(import.meta.dir, "..", "turbo.json"), "utf8");

const lock = "@crm/db#db:generate";

describe("agent dev waits for the Prisma client", () => {
	it("orders dev after db generate", () => {
		const start = turbo.indexOf('"dev":');
		const end = turbo.indexOf('"dev:headless":', start);
		const block = turbo.slice(start, end);

		expect(block).toContain(`"dependsOn": ["$TURBO_EXTENDS$", "${lock}"]`);
	});

	it("orders dev:headless after db generate", () => {
		const start = turbo.indexOf('"dev:headless":');
		const end = turbo.indexOf("/**", start);
		const block = turbo.slice(start, end);

		expect(block).toContain(`"dependsOn": ["$TURBO_EXTENDS$", "${lock}"]`);
	});
});
