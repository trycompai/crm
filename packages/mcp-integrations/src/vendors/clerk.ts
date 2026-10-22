import { parseVendor } from "../vendor";

const READ_SCOPES = [
	"user:org:read",
	"applications:read",
	"users:read",
	"application_domains:read",
	"offline_access",
] as const;

export const clerk = parseVendor({
	slug: "clerk",
	name: "Clerk",
	presentation: {
		description: "Let deployed agents inspect and manage Clerk",
		bringsIn: "Applications, sign-in settings, domains and users",
		sendsReadOnly: "Nothing",
		sendsReadWrite: "Approved authentication and application changes",
	},
	mcp: { resource: "https://mcp.clerk.com/mcp", transport: "streamable-http" },
	auth: {
		kind: "mcp_oauth",
		authorizationServers: ["https://clerk.clerk.com"],
	},
	access: {
		read_only: { url: "https://mcp.clerk.com/mcp", scopes: [...READ_SCOPES] },
		read_write: {
			url: "https://mcp.clerk.com/mcp",
			scopes: [
				...READ_SCOPES,
				"applications:manage",
				"users:manage",
				"application_domains:manage",
			],
		},
	},
	riskyTools: ["list_users", "submit_feedback", "get_more_tools"],
	docsHosts: ["clerk.com"],
	source: {
		providerDocs: "https://clerk.com/docs/guides/ai/mcp/clerk-mcp-server",
		tools: "https://clerk.com/docs/guides/ai/mcp/clerk-mcp-server",
		checkedAt: "2026-10-20",
	},
});
