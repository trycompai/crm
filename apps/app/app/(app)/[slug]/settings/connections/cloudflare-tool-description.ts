import { codeToHtml } from "shiki";

const TYPESCRIPT_MARKER = "Available in your code:";

export async function presentCloudflareToolDescription(
	description: string | null,
) {
	const value = description?.trim() || "No description provided.";
	const markerIndex = value.indexOf(TYPESCRIPT_MARKER);
	if (markerIndex < 0) return { prose: value };

	const prose = value.slice(0, markerIndex).trim();
	const code = value.slice(markerIndex + TYPESCRIPT_MARKER.length).trim();
	if (!code) return { prose: value };

	const highlightedHTML = await codeToHtml(code, {
		defaultColor: false,
		lang: "typescript",
		themes: { dark: "github-dark", light: "github-light" },
	});

	return {
		prose,
		code: {
			highlightedHTML,
			label: "TypeScript API",
			value: code,
		},
	};
}
