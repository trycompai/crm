import "@crm/env/load";

import { db } from "@crm/db";
import { readHubspotConnection } from "@crm/db/hubspot";
import { readContextDevKey } from "@crm/db/settings";
import {
	HUBSPOT_CAPABILITY,
	HUBSPOT_CAPABILITY_SOURCE,
} from "./hubspot-config";

export const CONTEXT_DEV = "CONTEXT_DEV";

export const CONTEXT_DEV_PEOPLE = "CONTEXT_DEV_PEOPLE";

export const CONTEXT_DEV_SOURCE = "Context.dev key (Settings → General)";

export type Capability = {
	readonly id: string;
	readonly label: string;
	readonly gives: string;
	readonly enabled: boolean;
	readonly from: string;
};

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

export async function hubspotLive(): Promise<boolean> {
	try {
		const connection = await readHubspotConnection();
		return connection !== null && connection.revokedAt === null;
	} catch (error) {
		console.error(
			`[agent] could not read the HubSpot connection from the database: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);

		return false;
	}
}

export async function capabilities(): Promise<readonly Capability[]> {
	const [contextDev, hubspot] = await Promise.all([
		contextDevKey(),
		hubspotLive(),
	]);

	return capabilitiesFrom(contextDev, hubspot);
}

export function capabilitiesFrom(
	contextDev: string | null,
	hubspot = false,
): readonly Capability[] {
	const fromEnv = (id: string) => ({
		id,
		from: id,
		enabled: Boolean(process.env[id]?.trim()),
	});

	return [
		{
			...fromEnv("PERPLEXITY_API_KEY"),
			label: "Web research",
			gives:
				"open-web context with citations, and the search that finds a LinkedIn slug in the first place",
		},
		{
			id: CONTEXT_DEV,
			from: "Settings → General",
			label: "Company brand data",
			gives: "a company's logo, industry, location and socials from its domain",
			enabled: contextDev !== null,
		},
		{
			id: CONTEXT_DEV_PEOPLE,
			from: "Settings → General",
			label: "LinkedIn",
			gives:
				"a person read back from a LinkedIn URL you already hold — their real name, bio, current title and employer, every earlier role with its dates, their education and their other public profiles, all self-reported and so authoritative on identity",
			enabled: contextDev !== null,
		},
		{
			id: HUBSPOT_CAPABILITY,
			from: HUBSPOT_CAPABILITY_SOURCE,
			label: "HubSpot deals",
			gives:
				"every deal in the connected HubSpot account with the outcome HubSpot itself records — closed won, closed lost, or still open — plus the stage label, the amount, the close date and the reason a rep typed when they closed it",
			enabled: hubspot,
		},
		{
			...fromEnv("BLOB_READ_WRITE_TOKEN"),
			label: "Picture storage",
			gives:
				"somewhere to keep a logo or a profile photo. Without it a record has no picture at all, because the URLs these sources hand back expire and are never stored as they are",
		},
	];
}

export async function enabled(id: string): Promise<boolean> {
	return (await capabilities()).some(
		(capability) => capability.id === id && capability.enabled,
	);
}

export type UnavailableCapability = {
	ok: false;
	configured: false;
	reason: string;
};

export function unavailable(env: string): UnavailableCapability {
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
