import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	CONTEXT_DEV,
	capabilitiesFrom,
	enableChecklistMarkdown,
	enabled,
	FULL_AGENTIC_CHECKLIST,
	FULL_AGENTIC_ENV_VARS,
	markdownFor,
	unavailable,
} from "../agent/lib/capabilities";

const KEYS = [
	"RAPIDAPI_KEY",
	"PERPLEXITY_API_KEY",
	"BLOB_READ_WRITE_TOKEN",
	"AGENT_BRIDGE_SECRET",
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
		expect(await enabled("AGENT_BRIDGE_SECRET")).toBe(false);
	});

	it("turns one on without turning on the others", async () => {
		process.env.PERPLEXITY_API_KEY = "pplx-test";

		expect(await enabled("PERPLEXITY_API_KEY")).toBe(true);
		expect(await enabled("RAPIDAPI_KEY")).toBe(false);
		expect(await enabled("AGENT_BRIDGE_SECRET")).toBe(false);
	});

	it("treats blank and whitespace as unset", async () => {
		process.env.RAPIDAPI_KEY = "   ";
		process.env.AGENT_BRIDGE_SECRET = "\t  ";
		expect(await enabled("RAPIDAPI_KEY")).toBe(false);
		expect(await enabled("AGENT_BRIDGE_SECRET")).toBe(false);
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

	it("reports AGENT_BRIDGE_SECRET when set", async () => {
		process.env.AGENT_BRIDGE_SECRET = "bridge-secret";
		const bridge = capabilitiesFrom(null).find(
			(c) => c.id === "AGENT_BRIDGE_SECRET",
		);
		expect(bridge?.enabled).toBe(true);
		expect(bridge?.from).toBe("AGENT_BRIDGE_SECRET");
		expect(await enabled("AGENT_BRIDGE_SECRET")).toBe(true);
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
		expect(markdown).toContain("Agent panel");
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

		expect(markdownFor(capabilitiesFrom("ctx"))).not.toContain(
			"Not configured here",
		);
	});
});

describe("full agentic enable checklist", () => {
	it("names every production env var and the Context setting", () => {
		expect(FULL_AGENTIC_ENV_VARS).toEqual([
			"RAPIDAPI_KEY",
			"PERPLEXITY_API_KEY",
			"BLOB_READ_WRITE_TOKEN",
			"AGENT_BRIDGE_SECRET",
		]);
		expect(
			FULL_AGENTIC_CHECKLIST.find((item) => item.kind === "setting")?.source,
		).toBe("Settings → General");
	});

	it("lists env names only, never secret values", () => {
		process.env.RAPIDAPI_KEY = "super-secret-value";
		const text = enableChecklistMarkdown(capabilitiesFrom(null));

		expect(text).toContain("`RAPIDAPI_KEY`");
		expect(text).toContain("`PERPLEXITY_API_KEY`");
		expect(text).toContain("`BLOB_READ_WRITE_TOKEN`");
		expect(text).toContain("`AGENT_BRIDGE_SECRET`");
		expect(text).toContain("Settings → General");
		expect(text).not.toContain("super-secret-value");
		expect(text).toContain("[x] `RAPIDAPI_KEY`");
		expect(text).toContain("[ ] `PERPLEXITY_API_KEY`");
	});

	it("marks Context when a key is stored", () => {
		const text = enableChecklistMarkdown(capabilitiesFrom("ctx"));
		expect(text).toContain("[x] Context key at `Settings → General`");
	});
});
