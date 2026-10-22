import { parseVendor } from "../vendor";

export const linear = parseVendor({
	slug: "linear",
	name: "Linear",
	presentation: {
		description: "Let deployed agents read and update Linear",
		bringsIn: "Issues, projects and teams selected by deployed agents",
		sendsReadOnly: "Nothing",
		sendsReadWrite: "Approved issue and project changes",
	},
	mcp: {
		resource: "https://mcp.linear.app/mcp",
		transport: "streamable-http",
	},
	auth: {
		kind: "mcp_oauth",
		authorizationServers: ["https://mcp.linear.app"],
	},
	access: {
		read_only: {
			url: "https://mcp.linear.app/mcp",
			scopes: ["read"],
		},
		read_write: {
			url: "https://mcp.linear.app/mcp",
			scopes: ["read", "write"],
		},
	},
	docsHosts: ["linear.app"],
	source: {
		providerDocs: "https://linear.app/docs/mcp",
		tools: "https://linear.app/docs/mcp",
		checkedAt: "2026-10-20",
	},
});
