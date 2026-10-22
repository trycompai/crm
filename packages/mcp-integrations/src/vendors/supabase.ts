import { parseVendor } from "../vendor";

const READ_SCOPES = [
	"organizations:read",
	"projects:read",
	"database:read",
	"analytics:read",
	"secrets:read",
	"edge_functions:read",
	"environment:read",
	"storage:read",
] as const;

export const supabase = parseVendor({
	slug: "supabase",
	name: "Supabase",
	presentation: {
		description: "Let deployed agents inspect and manage Supabase",
		bringsIn: "Projects, database structure and diagnostics",
		sendsReadOnly: "Nothing",
		sendsReadWrite: "Approved database and project changes",
	},
	mcp: {
		resource: "https://mcp.supabase.com/mcp",
		transport: "streamable-http",
	},
	auth: {
		kind: "mcp_oauth",
		authorizationServers: ["https://api.supabase.com"],
	},
	access: {
		read_only: {
			url: "https://mcp.supabase.com/mcp?read_only=true",
			scopes: [...READ_SCOPES],
		},
		read_write: {
			url: "https://mcp.supabase.com/mcp",
			scopes: [
				...READ_SCOPES,
				"projects:write",
				"database:write",
				"edge_functions:write",
				"environment:write",
				"storage:write",
			],
		},
	},
	riskyTools: [
		"apply_migration",
		"confirm_cost",
		"create_branch",
		"create_edge_function_secret",
		"create_project",
		"delete_branch",
		"deploy_edge_function",
		"execute_sql",
		"get_publishable_keys",
		"merge_branch",
		"pause_project",
		"query_logs",
		"rebase_branch",
		"reset_branch",
		"restore_project",
		"update_storage_config",
	],
	docsHosts: ["supabase.com"],
	source: {
		providerDocs: "https://supabase.com/docs/guides/ai-tools/mcp",
		tools: "https://supabase.com/docs/guides/ai-tools/mcp",
		checkedAt: "2026-10-20",
	},
});
