import "@crm/env/load";

import { db } from "@crm/db";
import { readContextDevKey } from "@crm/db/settings";

export const CONTEXT_DEV = "CONTEXT_DEV";

export type Capability = {
	readonly id: string;
	readonly label: string;
	readonly gives: string;
	readonly enabled: boolean;
	readonly from: string;
};

export type EnableChecklistItem = {
	readonly id: string;
	readonly label: string;
	readonly source: string;
	readonly kind: "env" | "setting";
};

export const FULL_AGENTIC_CHECKLIST: readonly EnableChecklistItem[] = [
	{
		id: "RAPIDAPI_KEY",
		label: "LinkedIn",
		source: "RAPIDAPI_KEY",
		kind: "env",
	},
	{
		id: "PERPLEXITY_API_KEY",
		label: "Web research",
		source: "PERPLEXITY_API_KEY",
		kind: "env",
	},
	{
		id: CONTEXT_DEV,
		label: "Company brand data",
		source: "Settings → General",
		kind: "setting",
	},
	{
		id: "BLOB_READ_WRITE_TOKEN",
		label: "Picture storage",
		source: "BLOB_READ_WRITE_TOKEN",
		kind: "env",
	},
	{
		id: "AGENT_BRIDGE_SECRET",
		label: "Agent panel",
		source: "AGENT_BRIDGE_SECRET",
		kind: "env",
	},
] as const;

export const FULL_AGENTIC_ENV_VARS = FULL_AGENTIC_CHECKLIST.filter(
	(item) => item.kind === "env",
).map((item) => item.source);

export async function contextDevKey(): Promise<string | null> {
	try {
		return await readContextDevKey(db);
	} catch (error) {
		console.error(
			`[agent] could not read the Context.dev key from the database: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);

		return null;
	}
}

export async function capabilities(): Promise<readonly Capability[]> {
	return capabilitiesFrom(await contextDevKey());
}

export function capabilitiesFrom(
	contextDev: string | null,
): readonly Capability[] {
	const fromEnv = (id: string) => ({
		id,
		from: id,
		enabled: Boolean(process.env[id]?.trim()),
	});

	return [
		{
			...fromEnv("RAPIDAPI_KEY"),
			label: "LinkedIn",
			gives:
				"a person's real name, current title, employer and tenure, self-reported, and so authoritative on identity",
		},
		{
			...fromEnv("PERPLEXITY_API_KEY"),
			label: "Web research",
			gives:
				"open-web context with citations for research, not for identity matching",
		},
		{
			id: CONTEXT_DEV,
			from: "Settings → General",
			label: "Company brand data",
			gives:
				"a company's logo, industry, location and socials from its domain, and Context web search that finds LinkedIn candidate slugs for identity matching",
			enabled: contextDev !== null,
		},
		{
			...fromEnv("BLOB_READ_WRITE_TOKEN"),
			label: "Picture storage",
			gives:
				"somewhere to keep a logo or a profile photo. Without it a record has no picture at all, because the URLs these sources hand back expire and are never stored as they are",
		},
		{
			...fromEnv("AGENT_BRIDGE_SECRET"),
			label: "Agent panel",
			gives:
				"a rep can open a contact, company or deal Agent tab and talk to you live, and the API can poke dispatch without waiting for the schedule",
		},
	];
}

export async function enabled(id: string): Promise<boolean> {
	return (await capabilities()).some(
		(capability) => capability.id === id && capability.enabled,
	);
}

export function unavailable(env: string): {
	ok: false;
	configured: false;
	reason: string;
} {
	return {
		ok: false,
		configured: false,
		reason:
			`This install has no ${env}, so that source is unavailable. This is not a failure and retrying will not help — ` +
			"use what the CRM already knows, and say in your write-up what you could not check.",
	};
}

export async function logCapabilities(): Promise<void> {
	for (const capability of await capabilities()) {
		console.log(
			`[agent] ${capability.enabled ? "on " : "off"}  ${capability.label} (${capability.from})`,
		);
	}
}

export async function capabilitiesMarkdown(): Promise<string> {
	return markdownFor(await capabilities());
}

export function markdownFor(all: readonly Capability[]): string {
	const on = all.filter((capability) => capability.enabled);
	const off = all.filter((capability) => !capability.enabled);

	const lines = ["## What you can use here", ""];

	if (on.length === 0) {
		lines.push(
			"No outside sources are configured on this install. Everything you can",
			"learn is already in the CRM — email threads, meetings, signature",
			"blocks — and `read_crm_history` reads all of it for free. That is",
			"often enough to settle who somebody is. Record what it shows, and",
			"leave the rest empty.",
		);
		return lines.join("\n");
	}

	lines.push("Available:");
	for (const capability of on) {
		lines.push(`- **${capability.label}** — ${capability.gives}.`);
	}

	if (off.length > 0) {
		lines.push("", "Not configured here, so do not plan around them:");
		for (const capability of off) {
			lines.push(`- ${capability.label}`);
		}
		lines.push(
			"",
			"Their tools will tell you the same thing if you call them. Note what",
			"you could not check rather than guessing at it.",
		);
	}

	return lines.join("\n");
}

export function enableChecklistMarkdown(
	all: readonly Capability[] = capabilitiesFrom(null),
): string {
	const byId = new Map(all.map((capability) => [capability.id, capability]));
	const lines = [
		"## Full agentic mode enable checklist",
		"",
		"Env vars only (names, never values). Same value for `AGENT_BRIDGE_SECRET` on the app and the agent.",
		"",
	];

	for (const item of FULL_AGENTIC_CHECKLIST) {
		if (item.kind === "env") {
			const on = byId.get(item.id)?.enabled === true;
			lines.push(`- [${on ? "x" : " "}] \`${item.source}\` — ${item.label}`);
		} else {
			const on = byId.get(item.id)?.enabled === true;
			lines.push(
				`- [${on ? "x" : " "}] Context key at \`${item.source}\` — ${item.label} (not an env var)`,
			);
		}
	}

	return lines.join("\n");
}
