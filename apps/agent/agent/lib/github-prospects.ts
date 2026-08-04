const API = "https://api.github.com/search/code";

export type GitHubSignal = {
	owner: string;
	repositoryUrl: string;
	evidenceUrl: string;
	term: string;
};

export async function githubTechnologySignals(
	terms: string[],
): Promise<GitHubSignal[]> {
	const token = process.env.GITHUB_TOKEN?.trim();
	if (!token) return [];
	const signals: GitHubSignal[] = [];
	for (const term of terms.slice(0, 3)) {
		const url = new URL(API);
		url.searchParams.set("q", `"${term}" filename:package.json`);
		url.searchParams.set("per_page", "20");
		const response = await fetch(url, {
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${token}`,
				"X-GitHub-Api-Version": "2026-03-10",
				"User-Agent": "crm-prospecting-agent",
			},
		});
		if (!response.ok) continue;
		const body = (await response.json()) as {
			items?: {
				html_url?: string;
				repository?: { html_url?: string; owner?: { login?: string } };
			}[];
		};
		for (const item of body.items ?? []) {
			const owner = item.repository?.owner?.login;
			const repositoryUrl = item.repository?.html_url;
			if (!owner || !repositoryUrl || !item.html_url) continue;
			signals.push({ owner, repositoryUrl, evidenceUrl: item.html_url, term });
		}
	}
	return signals;
}
