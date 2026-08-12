import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TASK_KINDS } from "@crm/db/agent-tasks";
import {
	AGENT_TOOLS,
	ALLOWED_PROPERTIES,
	bucket,
	dayBucket,
	EVIDENCE_KINDS,
	OTHER,
	permitted,
	permittedAgentActionStatus,
	permittedAgentRunStatus,
	permittedAgentTriggerType,
	permittedErrorClass,
	permittedEvidenceKind,
	permittedLifecycleRole,
	permittedMethod,
	permittedModelId,
	permittedRoute,
	permittedTaskKind,
	permittedTeamActionType,
	permittedTool,
} from "../src/allowlist";

const REPO = join(import.meta.dir, "..", "..", "..");

describe("permitted", () => {
	it("keeps a property on the list", () => {
		expect(permitted({ crm_version: "1.0.0" })).toEqual({
			crm_version: "1.0.0",
		});
	});

	it("drops a property that is not on the list", () => {
		expect(
			permitted({
				crm_version: "1.0.0",
				contact_email: "ada@example.test",
				company_name: "Acme",
			}),
		).toEqual({ crm_version: "1.0.0" });
	});

	it("drops everything when nothing is on the list", () => {
		expect(
			permitted({ email: "ada@example.test", note: "called them" }),
		).toEqual({});
	});

	it("drops undefined rather than sending a null it did not mean", () => {
		expect(permitted({ crm_version: undefined })).toEqual({});
	});

	it("keeps a deliberate null", () => {
		expect(permitted({ postgres_version: null })).toEqual({
			postgres_version: null,
		});
	});

	it("names every property exactly once", () => {
		expect(new Set(ALLOWED_PROPERTIES).size).toBe(ALLOWED_PROPERTIES.length);
	});

	it("keeps team-agent fleet properties", () => {
		expect(
			permitted({
				team_runs_by_status: { SUCCEEDED: 2 },
				team_cost_usd: 0.12,
				contact_email: "hidden@example.test",
			}),
		).toEqual({
			team_runs_by_status: { SUCCEEDED: 2 },
			team_cost_usd: 0.12,
		});
	});
});

describe("team agent permits", () => {
	it("keeps known run statuses, trigger types, and roles", () => {
		expect(permittedAgentRunStatus("SUCCEEDED")).toBe("SUCCEEDED");
		expect(permittedAgentTriggerType("EVENT")).toBe("EVENT");
		expect(permittedLifecycleRole("qualify")).toBe("qualify");
		expect(permittedTeamActionType("crm.activity.create")).toBe(
			"crm.activity.create",
		);
		expect(permittedAgentActionStatus("FAILED")).toBe("FAILED");
	});

	it("buckets unknown team keys as other", () => {
		expect(permittedAgentRunStatus("HACKED")).toBe(OTHER);
		expect(permittedAgentTriggerType("sms")).toBe(OTHER);
		expect(permittedLifecycleRole("send")).toBe(OTHER);
		expect(permittedTeamActionType("crm.email.send")).toBe(OTHER);
		expect(permittedAgentActionStatus("DONE")).toBe(OTHER);
	});
});

describe("permittedTool", () => {
	it("keeps an authored tool", () => {
		expect(permittedTool("read_crm_history")).toBe("read_crm_history");
	});

	it("keeps an eve builtin", () => {
		expect(permittedTool("web_search")).toBe("web_search");
	});

	it("buckets anything it does not know", () => {
		expect(permittedTool("exfiltrate_ada@example.test")).toBe(OTHER);
		expect(permittedTool(null)).toBe(OTHER);
	});

	it("lists every tool in apps/agent/agent/tools", () => {
		const files = readdirSync(join(REPO, "apps", "agent", "agent", "tools"))
			.filter((name) => name.endsWith(".ts"))
			.map((name) => name.replace(/\.ts$/, ""));

		expect([...AGENT_TOOLS].sort()).toEqual(files.sort());
	});
});

describe("permittedEvidenceKind", () => {
	it("keeps a kind the agent prices", () => {
		expect(permittedEvidenceKind("crm.signature-block")).toBe(
			"crm.signature-block",
		);
	});

	it("buckets anything else", () => {
		expect(permittedEvidenceKind("ada@example.test")).toBe(OTHER);
	});

	it("mirrors the WEIGHTS map in lib/evidence.ts", () => {
		const source = readFileSync(
			join(REPO, "apps", "agent", "agent", "lib", "evidence.ts"),
			"utf8",
		);

		const start = source.indexOf("export const WEIGHTS");
		const block = source.slice(start, source.indexOf("\n};", start));

		const kinds = [...block.matchAll(/^\t"?([a-z][a-z0-9.-]*)"?:\s*\{/gm)].map(
			(match) => match[1] as string,
		);

		expect(kinds.length).toBeGreaterThan(0);
		expect([...EVIDENCE_KINDS].sort()).toEqual(kinds.sort());
	});
});

describe("permittedMethod", () => {
	it("keeps a slug a tool wrote", () => {
		expect(permittedMethod("linkedin.profile")).toBe("linkedin.profile");
		expect(permittedMethod("crm.thread")).toBe("crm.thread");
	});

	it("buckets anything that could carry a person", () => {
		expect(permittedMethod("ada@example.test")).toBe(OTHER);
		expect(permittedMethod("Ada Okafor, VP Sales at Acme")).toBe(OTHER);
		expect(permittedMethod("https://example.test/ada")).toBe(OTHER);
		expect(permittedMethod("a".repeat(80))).toBe(OTHER);
		expect(permittedMethod(null)).toBe(OTHER);
	});
});

describe("permittedTaskKind", () => {
	it("keeps every kind the dispatcher knows", () => {
		for (const kind of TASK_KINDS) {
			expect(permittedTaskKind(kind)).toBe(kind);
		}
	});

	it("buckets anything else", () => {
		expect(permittedTaskKind("contact:ada@example.test")).toBe(OTHER);
	});
});

describe("permittedRoute", () => {
	it("keeps a route pattern", () => {
		expect(permittedRoute("/internal/sync/google")).toBe(
			"/internal/sync/google",
		);
		expect(permittedRoute("/trpc/contacts.list")).toBe("/trpc/contacts.list");
		expect(permittedRoute("/contacts/:id")).toBe("/contacts/:id");
	});

	it("buckets a URL with an address in the query string", () => {
		expect(permittedRoute("/contacts?email=ada@example.test")).toBe(OTHER);
		expect(permittedRoute("https://crm.example.test/contacts")).toBe(OTHER);
		expect(permittedRoute(null)).toBe(OTHER);
	});
});

describe("permittedErrorClass", () => {
	it("takes the class, never the message", () => {
		expect(
			permittedErrorClass(new TypeError("ada@example.test is not a fn")),
		).toBe("TypeError");
	});

	it("takes an eve error code", () => {
		expect(permittedErrorClass({ code: "model_overloaded" })).toBe(
			"model_overloaded",
		);
	});

	it("buckets a free-text string", () => {
		expect(permittedErrorClass("could not reach ada@example.test")).toBe(OTHER);
		expect(permittedErrorClass({})).toBe(OTHER);
	});
});

describe("permittedModelId", () => {
	it("keeps a model slug", () => {
		expect(permittedModelId("zai/glm-5.2-fast")).toBe("zai/glm-5.2-fast");
	});

	it("buckets anything else", () => {
		expect(permittedModelId("the model said hello to ada")).toBe(OTHER);
	});
});

describe("buckets", () => {
	it("never reports an exact size", () => {
		expect(bucket(0)).toBe("0");
		expect(bucket(1)).toBe("1-9");
		expect(bucket(9)).toBe("1-9");
		expect(bucket(10)).toBe("10-49");
		expect(bucket(4_999)).toBe("1000-4999");
		expect(bucket(1_000_000)).toBe("25000+");
	});

	it("bands recheck intervals by day", () => {
		expect(dayBucket(0)).toBe("0-1");
		expect(dayBucket(7)).toBe("2-7");
		expect(dayBucket(30)).toBe("8-30");
		expect(dayBucket(365)).toBe("180+");
	});
});
