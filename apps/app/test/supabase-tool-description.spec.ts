import { describe, expect, test } from "bun:test";
import { presentSupabaseToolDescription } from "../app/(app)/[slug]/settings/connections/supabase/supabase-tool-description";

describe("Supabase tool descriptions", () => {
	test("formats a labeled GraphQL schema", async () => {
		const description = [
			"Search the Supabase documentation using GraphQL.",
			"",
			"Below is the GraphQL schema for this tool:",
			"",
			"schema{query:RootQueryType}type RootQueryType{schema:String!}",
		].join("\n");

		expect(await presentSupabaseToolDescription(description)).toMatchObject({
			prose: "Search the Supabase documentation using GraphQL.",
			code: {
				highlightedHTML: expect.stringContaining("shiki"),
				label: "GraphQL schema",
				value: [
					"schema {",
					"  query: RootQueryType",
					"}",
					"",
					"type RootQueryType {",
					"  schema: String!",
					"}",
				].join("\n"),
			},
		});
	});

	test("keeps ordinary descriptions as prose", async () => {
		expect(await presentSupabaseToolDescription("Lists all projects.")).toEqual(
			{
				prose: "Lists all projects.",
			},
		);
	});

	test("keeps an invalid schema visible", async () => {
		const description =
			"Search docs.\n\nBelow is the GraphQL schema for this tool:\n\nnot graphql";

		expect(await presentSupabaseToolDescription(description)).toEqual({
			prose: description,
		});
	});
});
