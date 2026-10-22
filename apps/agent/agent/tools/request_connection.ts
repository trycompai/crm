import { db } from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { vendors } from "@crm/mcp-integrations/catalog";
import { agentConnectionRequest } from "@crm/validation/agent-connection-request";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { connectionRequestStatus } from "../lib/chat-mcp";
import { attribute, purposeOf } from "../lib/session-purpose";

const vendorSlugs = vendors.map((vendor) => vendor.slug) as [
	string,
	...string[],
];

export default defineTool({
	description:
		"Show the user a card to connect a platform. Call this once when a platform is disconnected or needs authorization. Then stop and wait.",
	inputSchema: z.object({
		vendor: z.enum(vendorSlugs).describe("The platform connection name."),
	}),
	label: { start: () => "Check a platform connection" },
	async execute({ vendor }, ctx) {
		if (
			purposeOf(ctx) !== "builder" ||
			attribute(ctx, "commandType") !== "CHAT"
		) {
			throw new Error("Connection cards are available only in private chat.");
		}
		const entry = vendors.find((candidate) => candidate.slug === vendor);
		if (!entry) throw new Error("The MCP platform is unavailable.");
		const connection = await db.mcpConnection.findUnique({
			where: {
				organizationId_platformSlug: {
					organizationId: WORKSPACE_ID,
					platformSlug: vendor,
				},
			},
			select: { status: true, lastErrorCode: true },
		});
		return agentConnectionRequest.parse({
			vendor: entry.slug,
			name: entry.name,
			status: connectionRequestStatus(connection),
		});
	},
});
