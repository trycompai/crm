import "@crm/env/load";

import { db } from "@crm/db";
import { readContextDevKey } from "@crm/db/settings";

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
			...fromEnv("HUNTER_API_KEY"),
			label: "Contact details via Hunter",
			gives:
				"a person's work email from their name and their employer's domain, with the public pages Hunter saw it on, and a deliverability check on an address you already hold",
		},
		{
			...fromEnv("APOLLO_API_KEY"),
			label: "Contact details via Apollo",
			gives:
				"a person's work email with Apollo's verification status, their title and a work phone",
		},
		{
			...fromEnv("LUSHA_API_KEY"),
			label: "Contact details via Lusha",
			gives: "a person's work email, direct and mobile phones and their title",
		},
		{
			...fromEnv("DROPCONTACT_API_KEY"),
			label: "Contact details via Dropcontact",
			gives:
				"a person's work email with its qualification, a phone and their title, from a GDPR-compliant source",
		},
		{
			id: "ZOOMINFO_USERNAME",
			from: "ZOOMINFO_USERNAME + ZOOMINFO_PASSWORD",
			label: "Contact details via ZoomInfo",
			gives:
				"a person's work email, direct and mobile phones and their title from ZoomInfo's database",
			enabled: Boolean(
				process.env.ZOOMINFO_USERNAME?.trim() &&
					process.env.ZOOMINFO_PASSWORD?.trim(),
			),
		},
		{
			...fromEnv("EDGAR_URL"),
			label: "SEC EDGAR research",
			gives:
				"US public companies from SEC filings: profile, filings, 5%+ shareholders, insider transactions, the proxy statement with its executives and their pay, all free and with a filing URL to cite",
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
