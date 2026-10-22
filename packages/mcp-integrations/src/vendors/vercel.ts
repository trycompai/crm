import { parseVendor } from "../vendor";

const SCOPES = ["openid", "email", "profile", "offline_access"] as const;

export const vercel = parseVendor({
	slug: "vercel",
	name: "Vercel",
	presentation: {
		description: "Let deployed agents inspect and manage Vercel",
		bringsIn: "Projects, deployments, domains, certificates and firewalls",
		sendsReadOnly: "Nothing",
		sendsReadWrite: "Approved firewall and project changes",
	},
	mcp: { resource: "https://mcp.vercel.com/", transport: "streamable-http" },
	auth: {
		kind: "mcp_oauth",
		authorizationServers: ["https://vercel.com"],
		endpointOrigins: ["https://api.vercel.com"],
	},
	access: {
		read_only: { url: "https://mcp.vercel.com/", scopes: [...SCOPES] },
		read_write: { url: "https://mcp.vercel.com/", scopes: [...SCOPES] },
	},
	riskyTools: [
		"list_projects",
		"get_project",
		"list_teams",
		"get_team",
		"get_access_to_vercel_url",
		"web_fetch_vercel_url",
	],
	docsHosts: ["vercel.com"],
	source: {
		providerDocs: "https://vercel.com/docs/agent-resources/vercel-mcp",
		tools: "https://vercel.com/docs/agent-resources/vercel-mcp/tools",
		checkedAt: "2026-10-20",
	},
});
