import { parseVendor } from "../vendor";

const SCOPES = ["workspace:admin", "offline_access"] as const;

export const prisma = parseVendor({
	slug: "prisma",
	name: "Prisma",
	presentation: {
		description: "Let deployed agents inspect and manage Prisma",
		bringsIn: "Databases, backups, storage and Compute deployments",
		sendsReadOnly: "Nothing",
		sendsReadWrite: "Approved database, storage and deployment changes",
	},
	mcp: { resource: "https://mcp.prisma.io/mcp", transport: "streamable-http" },
	auth: {
		kind: "mcp_oauth",
		authorizationServers: ["https://auth.prisma.io"],
	},
	access: {
		read_only: { url: "https://mcp.prisma.io/mcp", scopes: [...SCOPES] },
		read_write: { url: "https://mcp.prisma.io/mcp", scopes: [...SCOPES] },
	},
	docsHosts: ["www.prisma.io", "trust.prisma.io"],
	source: {
		providerDocs: "https://www.prisma.io/docs/ai/mcp-tools",
		tools: "https://www.prisma.io/docs/ai/mcp-tools",
		checkedAt: "2026-10-20",
	},
});
