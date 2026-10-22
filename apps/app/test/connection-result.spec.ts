import { expect, test } from "bun:test";
import { agentResultOwnsResponse } from "@/components/agent-builder/agent-result";
import { providerCardOf, providerForTool } from "@/lib/connection-result";

const providers = [
	{ slug: "clerk", name: "Clerk" },
	{ slug: "cloudflare", name: "Cloudflare" },
	{ slug: "linear", name: "Linear" },
	{ slug: "notion", name: "Notion" },
	{ slug: "planetscale", name: "PlanetScale" },
	{ slug: "supabase", name: "Supabase" },
	{ slug: "future", name: "Future Cloud" },
] as const;

test("connected provider tools receive automatic result cards", () => {
	for (const tool of [
		"clerk__list_applications",
		"cloudflare__whoami",
		"linear__list_projects",
		"planetscale__planetscale_list_organizations",
		"supabase__list_projects",
		"future__list_things",
	]) {
		expect(agentResultOwnsResponse(tool, providers)).toBe(true);
	}

	expect(agentResultOwnsResponse("unknown__list_things", providers)).toBe(
		false,
	);
	expect(agentResultOwnsResponse("list_deals", providers)).toBe(false);
});

test("finds provider metadata from a namespaced tool", () => {
	expect(providerForTool("future__list_things", providers)).toEqual({
		slug: "future",
		name: "Future Cloud",
	});
	expect(providerForTool("other__list_things", providers)).toBeNull();
});

test("compiles Clerk applications without provider-specific code", () => {
	const result = providerCardOf({
		provider: providers[0],
		tool: "clerk__list_applications",
		output: `${JSON.stringify([
			{
				application_id: "app_1",
				name: "Sales",
				instances: [
					{
						instance_id: "ins_1",
						environment_type: "production",
						publishable_key: "pk_live_secret",
					},
				],
			},
		])}\n${JSON.stringify({ conversation_id: "conversation_1" })}`,
	});

	expect(result).toEqual({
		slug: "clerk",
		provider: "Clerk",
		title: "Applications",
		countLabel: "1 application",
		items: [
			{
				key: "app_1",
				title: "Sales",
				reference: "app_1",
				details: [{ label: "Instances", value: "1" }],
				tags: ["Production"],
			},
		],
	});
	expect(JSON.stringify(result)).not.toContain("pk_live_secret");
});

test("compiles common provider collections into one safe model", () => {
	const result = providerCardOf({
		provider: providers[5],
		tool: "supabase__list_projects",
		output: {
			projects: [
				{
					id: "project_1",
					name: "CRM",
					region: "us-west-1",
					status: "ACTIVE_HEALTHY",
					database: { version: "15.8.1", host: "hidden.example.com" },
					access_token: "secret-token",
					description: "x".repeat(500),
				},
			],
		},
	});

	expect(result?.title).toBe("Projects");
	expect(result?.items).toEqual([
		{
			key: "project_1",
			title: "CRM",
			reference: "project_1",
			details: [
				{ label: "Region", value: "us-west-1" },
				{ label: "Database", value: "15.8.1" },
			],
			tags: ["Active Healthy"],
		},
	]);
	expect(JSON.stringify(result)).not.toContain("secret-token");
	expect(JSON.stringify(result)).not.toContain("hidden.example.com");
});

test("turns generic PlanetScale data into concise organization details", () => {
	const result = providerCardOf({
		provider: providers[4],
		tool: "planetscale__planetscale_list_organizations",
		output: {
			data: [
				{
					id: "org_1",
					name: "Bounty",
					sso: false,
					has_card: true,
					created_at: "2026-01-02T14:01:53.640Z",
					updated_at: "2026-01-02T14:01:53.907Z",
					plan: "scaler_pro",
					type: "organization",
					mcp_access_level: "read_write",
					database_count: 6,
				},
			],
		},
	});

	expect(result).toEqual({
		slug: "planetscale",
		provider: "PlanetScale",
		title: "Organizations",
		countLabel: "1 organization",
		items: [
			{
				key: "org_1",
				title: "Bounty",
				reference: "org_1",
				details: [
					{ label: "Databases", value: "6" },
					{ label: "Plan", value: "Scaler Pro" },
					{ label: "Access", value: "Read Write" },
					{ label: "Updated", value: "Jan 2, 2026" },
				],
				tags: [],
			},
		],
	});
});

test("presents a single Notion account without a meaningless count", () => {
	const result = providerCardOf({
		provider: providers[3],
		tool: "notion__notion-get-self",
		output: {
			user: "Caleb Perry",
			workspace: "Comp AI",
		},
	});

	expect(result).toEqual({
		slug: "notion",
		provider: "Notion",
		title: "Account",
		items: [
			{
				key: "Caleb Perry-0",
				title: "Caleb Perry",
				details: [{ label: "Workspace", value: "Comp AI" }],
				tags: [],
			},
		],
	});
});

test("omits a generic item title when the provider returns nested account data", () => {
	const result = providerCardOf({
		provider: providers[3],
		tool: "notion__notion-get-self",
		output: {
			user: { name: "Caleb Perry" },
			workspace: { name: "Comp AI" },
		},
	});

	expect(result).toEqual({
		slug: "notion",
		provider: "Notion",
		title: "Account",
		items: [
			{
				key: "result-0",
				details: [
					{ label: "User", value: "Caleb Perry" },
					{ label: "Workspace", value: "Comp AI" },
				],
				tags: [],
			},
		],
	});
});

test("supports a future provider without a manual adapter", () => {
	const result = providerCardOf({
		provider: providers[6],
		tool: "future__list_workspaces",
		output: {
			workspaces: [
				{
					id: "workspace_1",
					name: "North America — Sales",
					state: "ready",
					url: "https://future.example/workspaces/1",
					owner: { name: "Caleb" },
				},
			],
		},
	});

	expect(result).toEqual({
		slug: "future",
		provider: "Future Cloud",
		title: "Workspaces",
		countLabel: "1 workspace",
		items: [
			{
				key: "workspace_1",
				title: "North America: Sales",
				reference: "workspace_1",
				href: "https://future.example/workspaces/1",
				details: [{ label: "Owner", value: "Caleb" }],
				tags: ["Ready"],
			},
		],
	});
});

test("blocks unsafe links and secret fields", () => {
	const result = providerCardOf({
		provider: providers[6],
		tool: "future__get_account",
		output: {
			id: "account_1",
			email: "user@example.com",
			url: "javascript:alert(1)",
			password: "hidden",
			apiKey: "hidden-too",
			billing_email: "billing@example.com",
		},
	});

	expect(result?.items[0]).toEqual({
		key: "account_1",
		title: "user@example.com",
		reference: "account_1",
		details: [],
		tags: [],
	});
	expect(JSON.stringify(result)).not.toContain("hidden");
	expect(JSON.stringify(result)).not.toContain("billing@example.com");
});

test("uses concise fallbacks for scalar and malformed output", () => {
	expect(
		providerCardOf({
			provider: providers[6],
			tool: "future__status",
			output: "Ready",
		})?.items[0]?.title,
	).toBe("Ready");
	expect(
		providerCardOf({
			provider: providers[6],
			tool: "future__status",
			output: "x".repeat(500),
		}),
	).toBeNull();
});
