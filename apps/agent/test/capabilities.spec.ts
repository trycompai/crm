import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	CONTEXT_DEV,
	capabilitiesFrom,
	EMAIL_PREVIEW,
	enabled,
	markdownFor,
	unavailable,
} from "../agent/lib/capabilities";

const KEYS = [
	"RAPIDAPI_KEY",
	"PERPLEXITY_API_KEY",
	"BLOB_READ_WRITE_TOKEN",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
	for (const key of KEYS) {
		saved[key] = process.env[key];
		delete process.env[key];
	}
});

afterEach(() => {
	for (const key of KEYS) {
		if (saved[key] === undefined) delete process.env[key];
		else process.env[key] = saved[key];
	}
});

describe("capabilities", () => {
	it("reports everything off on a bare install", async () => {
		expect(capabilitiesFrom(null).every((c) => !c.enabled)).toBe(true);
		expect(await enabled("RAPIDAPI_KEY")).toBe(false);
	});

	it("turns one on without turning on the others", async () => {
		process.env.PERPLEXITY_API_KEY = "pplx-test";

		expect(await enabled("PERPLEXITY_API_KEY")).toBe(true);
		expect(await enabled("RAPIDAPI_KEY")).toBe(false);
	});

	it("treats blank and whitespace as unset", async () => {
		process.env.RAPIDAPI_KEY = "   ";
		expect(await enabled("RAPIDAPI_KEY")).toBe(false);
	});

	it("is read live, so a late-configured process is not stuck off", async () => {
		expect(await enabled("RAPIDAPI_KEY")).toBe(false);
		process.env.RAPIDAPI_KEY = "key";
		expect(await enabled("RAPIDAPI_KEY")).toBe(true);
	});

	it("is unknown for a variable that is not a capability", async () => {
		process.env.SOMETHING_ELSE = "x";
		expect(await enabled("SOMETHING_ELSE")).toBe(false);
		delete process.env.SOMETHING_ELSE;
	});
});

describe("the Context key is a setting, never a variable", () => {
	const contextDev = (stored: string | null) =>
		capabilitiesFrom(stored).find((c) => c.id === CONTEXT_DEV);

	it("is on when a key is stored", () => {
		expect(contextDev("ctx-from-the-settings-page")?.enabled).toBe(true);
	});

	it("is off when nothing has been stored", () => {
		expect(contextDev(null)?.enabled).toBe(false);
	});

	it("is not turned on by an environment variable", () => {
		process.env.CONTEXT_DEV_API_KEY = "a-variable-nothing-reads";

		expect(contextDev(null)?.enabled).toBe(false);

		delete process.env.CONTEXT_DEV_API_KEY;
	});

	it("points at the settings page rather than a variable name", () => {
		expect(contextDev(null)?.from).toBe("Settings → General");
	});
});

describe("the unavailable result", () => {
	it("says retrying will not help", () => {
		const result = unavailable("RAPIDAPI_KEY");

		expect(result.ok).toBe(false);
		expect(result.configured).toBe(false);
		expect(result.reason).toContain("retrying will not help");
		expect(result.reason).toContain("RAPIDAPI_KEY");
	});
});

describe("the capability briefing", () => {
	it("tells a bare install to work from the CRM alone", () => {
		const markdown = markdownFor(capabilitiesFrom(null));

		expect(markdown).toContain("No outside sources are configured");
		expect(markdown).toContain("read_crm_history");
	});

	it("lists what is on and what is off, separately", () => {
		process.env.RAPIDAPI_KEY = "key";
		const markdown = markdownFor(capabilitiesFrom(null));

		expect(markdown).toContain("Available:");
		expect(markdown).toContain("LinkedIn");
		expect(markdown).toContain("Not configured here");
		expect(markdown).toContain("Web research");
	});

	it("counts a stored Context key as configured", () => {
		process.env.RAPIDAPI_KEY = "key";

		const markdown = markdownFor(capabilitiesFrom("ctx"));

		expect(markdown).toContain("Company brand data");
		expect(markdown.indexOf("Company brand data")).toBeLessThan(
			markdown.indexOf("Not configured here"),
		);
	});

	it("does not warn about missing sources when everything is on", () => {
		for (const key of KEYS) process.env[key] = "key";

		expect(
			markdownFor(capabilitiesFrom("ctx", "/usr/bin/chromium")),
		).not.toContain("Not configured here");
	});
});

describe("the email preview capability", () => {
	const preview = (chrome: string | null) =>
		capabilitiesFrom(null, chrome).find((c) => c.id === EMAIL_PREVIEW);

	it("is off when no browser was found", () => {
		expect(preview(null)?.enabled).toBe(false);
	});

	it("is off by default, so a pure caller decides nothing by accident", () => {
		expect(
			capabilitiesFrom(null).find((c) => c.id === EMAIL_PREVIEW)?.enabled,
		).toBe(false);
	});

	it("is on when a browser was found", () => {
		expect(preview("/usr/bin/chromium")?.enabled).toBe(true);
	});

	it("points at the variable that provides the browser", () => {
		expect(preview(null)?.from).toBe("CHROME_EXECUTABLE_PATH");
	});
});
