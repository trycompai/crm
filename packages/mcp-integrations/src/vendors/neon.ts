import { parseVendor } from "../vendor";

export const neon = parseVendor({
	slug: "neon",
	name: "Neon",
	presentation: {
		description: "Let deployed agents inspect and manage Neon",
		bringsIn: "Projects, branches, roles, backups and network settings",
		sendsReadOnly: "Nothing",
		sendsReadWrite: "Approved database and project changes",
	},
	mcp: { resource: "https://mcp.neon.tech/mcp", transport: "streamable-http" },
	auth: {
		kind: "mcp_oauth",
		authorizationServers: ["https://mcp.neon.tech"],
	},
	access: {
		read_only: { url: "https://mcp.neon.tech/mcp", scopes: ["read"] },
		read_write: {
			url: "https://mcp.neon.tech/mcp",
			scopes: ["read", "write"],
		},
	},
	riskyTools: ["describe_branch", "fetch"],
	docsHosts: ["neon.com"],
	source: {
		providerDocs: "https://neon.com/docs/ai/neon-mcp-server",
		tools:
			"https://github.com/neondatabase/mcp-server-neon/tree/185d5ee7a1ed26e2abe86b45fc669925153ebca3/mcp/tools",
		checkedAt: "2026-10-20",
	},
});
