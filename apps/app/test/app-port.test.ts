import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const appRoot = join(import.meta.dir, "..");
const repoRoot = join(appRoot, "../..");

describe("APP_PORT", () => {
	test("next dev uses APP_PORT so the API PORT env does not steal the app", () => {
		const pkg = JSON.parse(
			readFileSync(join(appRoot, "package.json"), "utf8"),
		) as { scripts: { dev: string } };

		expect(pkg.scripts.dev).toContain("${APP_PORT:-3000}");
	});

	test("turbo forwards APP_PORT into persistent tasks", () => {
		const turbo = JSON.parse(
			readFileSync(join(repoRoot, "turbo.json"), "utf8"),
		) as { globalPassThroughEnv: string[] };

		expect(turbo.globalPassThroughEnv).toContain("APP_PORT");
	});
});
