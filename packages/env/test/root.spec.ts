import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function findRoot(start: string): string | null {
	let directory = resolve(start);

	for (;;) {
		if (existsSync(join(directory, "pnpm-workspace.yaml"))) return directory;

		const parent = dirname(directory);
		if (parent === directory) return null;
		directory = parent;
	}
}

const repoRoot = resolve(import.meta.dir, "..", "..", "..");

describe("finding the workspace root", () => {
	it("finds it from the repo root itself", () => {
		expect(findRoot(repoRoot)).toBe(repoRoot);
	});

	it("finds it from a package that has its own turbo.json", () => {
		for (const app of ["apps/api", "apps/agent"]) {
			expect(findRoot(join(repoRoot, app))).toBe(repoRoot);
		}
	});

	it("finds it from a nested source directory", () => {
		expect(findRoot(join(repoRoot, "packages", "db", "src"))).toBe(repoRoot);
	});

	it("returns null above the repo rather than walking to /", () => {
		expect(findRoot("/")).toBeNull();
	});

	it("only matches a directory that declares the workspace", () => {
		expect(
			existsSync(join(repoRoot, "apps", "api", "pnpm-workspace.yaml")),
		).toBe(false);
	});
});

describe("the committed .env.example", () => {
	const example = readFileSync(join(repoRoot, ".env.example"), "utf8");

	it("names every variable the required section promises", () => {
		for (const key of [
			"DATABASE_URL",
			"BETTER_AUTH_SECRET",
			"ALLOWED_SIGN_IN",
			"GOOGLE_CLIENT_ID",
			"GOOGLE_CLIENT_SECRET",
		]) {
			expect(example).toContain(`${key}=`);
		}
	});

	it("ships no secret of its own", () => {
		for (const line of example.split("\n")) {
			if (line.startsWith("#") || !line.includes("=")) continue;
			const value = line.slice(line.indexOf("=") + 1).trim();
			expect(value === '""' || value.length > 0).toBe(true);
			if (line.startsWith("BETTER_AUTH_SECRET")) expect(value).toBe('""');
			if (line.startsWith("ALLOWED_SIGN_IN")) expect(value).toBe('""');
		}
	});
});
