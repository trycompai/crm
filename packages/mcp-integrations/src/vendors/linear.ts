import { parseVendor } from "../vendor";

export const linear = parseVendor({
	slug: "linear",
	name: "Linear",
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
		integrationsSh: "https://integrations.sh/linear.app/linear/",
		tools: "https://linear.app/docs/mcp",
		checkedAt: "2026-10-20",
	},
});
