import { parseVendor } from "../vendor";

const READ_SCOPES = [
	"specs:read",
	"finds:read",
	"projects:read",
	"account:read",
] as const;

export const specstream = parseVendor({
	slug: "specstream",
	name: "SpecStream",
	presentation: {
		description:
			"Let deployed agents find company data with a source on every value",
		bringsIn: "Lists of companies and people, each value with its source URL",
		sendsReadOnly: "Nothing",
		sendsReadWrite: "Requests you approve, priced before they run",
	},
	mcp: {
		resource: "https://api.specstream.ai/mcp",
		transport: "streamable-http",
	},
	auth: {
		kind: "mcp_oauth",
		authorizationServers: ["https://specstream.ai"],
	},
	access: {
		read_only: {
			url: "https://api.specstream.ai/mcp",
			scopes: [...READ_SCOPES],
		},
		read_write: {
			url: "https://api.specstream.ai/mcp",
			scopes: [...READ_SCOPES, "specs:write", "finds:write", "finds:spend"],
		},
	},
	riskyTools: [
		"authorize_capacity_work",
		"quote_capacity_work",
		"create_capacity_schedule",
		"update_capacity_schedule",
		"send_to_destination",
		"create_destination_sync",
		"update_destination_sync",
		"share_find",
		"share_collection",
		"export_find",
	],
	docsHosts: ["specstream.ai"],
	source: {
		providerDocs: "https://specstream.ai/docs/mcp?utm_source=crm",
		tools: "https://specstream.ai/docs/mcp?utm_source=crm",
		checkedAt: "2026-11-04",
	},
});
