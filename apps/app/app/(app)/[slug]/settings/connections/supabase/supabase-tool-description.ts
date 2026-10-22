import { parse, print } from "graphql";
import { codeToHtml } from "shiki";

const GRAPHQL_SCHEMA_MARKER = "Below is the GraphQL schema for this tool:";

export async function presentSupabaseToolDescription(
	description: string | null,
) {
	const value = description?.trim() || "No description provided.";
	const markerIndex = value.indexOf(GRAPHQL_SCHEMA_MARKER);
	if (markerIndex < 0) return { prose: value };

	const prose = value.slice(0, markerIndex).trim();
	const schema = value.slice(markerIndex + GRAPHQL_SCHEMA_MARKER.length).trim();

	try {
		const formattedSchema = print(parse(schema));
		const highlightedHTML = await codeToHtml(formattedSchema, {
			defaultColor: false,
			lang: "graphql",
			themes: { dark: "github-dark", light: "github-light" },
		});

		return {
			prose,
			code: {
				highlightedHTML,
				label: "GraphQL schema",
				value: formattedSchema,
			},
		};
	} catch {
		return { prose: value };
	}
}
