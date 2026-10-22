import { parseVendor } from "../vendor";

const SCOPES = ["default"] as const;

export const notion = parseVendor({
	slug: "notion",
	name: "Notion",
	presentation: {
		description: "Let deployed agents work with Notion",
		bringsIn: "Pages, databases, comments and workspace search results",
		sendsReadOnly: "Nothing",
		sendsReadWrite: "Approved page, database and comment changes",
	},
	mcp: {
		resource: "https://mcp.notion.com/mcp",
		transport: "streamable-http",
	},
	auth: {
		kind: "mcp_oauth",
		authorizationServers: ["https://mcp.notion.com"],
		consentPrompt: true,
	},
	access: {
		read_only: {
			url: "https://mcp.notion.com/mcp",
			scopes: [...SCOPES],
		},
		read_write: {
			url: "https://mcp.notion.com/mcp",
			scopes: [...SCOPES],
		},
	},
	docsHosts: ["developers.notion.com", "www.notion.com"],
	source: {
		providerDocs: "https://developers.notion.com/guides/mcp/overview",
		tools: "https://developers.notion.com/guides/mcp/mcp-supported-tools",
		checkedAt: "2026-10-21",
	},
});
