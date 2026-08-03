import "@crm/env/load";

export type Capability = {
	readonly env: string;
	readonly label: string;
	readonly gives: string;
	readonly enabled: boolean;
};

export function capabilities(): readonly Capability[] {
	const set = (key: string) => Boolean(process.env[key]?.trim());

	return [
		{
			env: "HUNTER_API_KEY",
			label: "B2B prospect data",
			gives:
				"company discovery plus sourced and verified professional email addresses",
			enabled: set("HUNTER_API_KEY"),
		},
		{
			env: "BRAVE_SEARCH_API_KEY",
			label: "Prospecting web search",
			gives:
				"public company, hiring and technology signals from an independent web index",
			enabled: set("BRAVE_SEARCH_API_KEY"),
		},
		{
			env: "GITHUB_TOKEN",
			label: "GitHub discovery",
			gives:
				"authenticated public repository and code search for mobile technology signals",
			enabled: set("GITHUB_TOKEN"),
		},
		{
			env: "RAPIDAPI_KEY",
			label: "LinkedIn",
			gives:
				"a person's real name, current title, employer and tenure, self-reported, and so authoritative on identity",
			enabled: set("RAPIDAPI_KEY"),
		},
		{
			env: "PERPLEXITY_API_KEY",
			label: "Web research",
			gives:
				"open-web context with citations, and the search that finds a LinkedIn slug in the first place",
			enabled: set("PERPLEXITY_API_KEY"),
		},
		{
			env: "CONTEXT_DEV_API_KEY",
			label: "Company brand data",
			gives: "a company's logo, industry, location and socials from its domain",
			enabled: set("CONTEXT_DEV_API_KEY"),
		},
		{
			env: "BLOB_READ_WRITE_TOKEN",
			label: "Picture storage",
			gives:
				"somewhere to keep a logo or a profile photo. Without it a record has no picture at all, because the URLs these sources hand back expire and are never stored as they are",
			enabled: set("BLOB_READ_WRITE_TOKEN"),
		},
	];
}

export function enabled(env: string): boolean {
	return capabilities().some(
		(capability) => capability.env === env && capability.enabled,
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

export function capabilitiesMarkdown(): string {
	const all = capabilities();
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
