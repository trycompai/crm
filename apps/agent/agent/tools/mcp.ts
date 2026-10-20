import { db } from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import { parseAgentManifest } from "@crm/validation/agent-manifest";
import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import {
	authorizeMcpTool,
	callMcpTool,
	mcpModelOutput,
} from "../lib/mcp-runtime";
import { attribute, purposeOf } from "../lib/session-purpose";

const inputSchema = z.record(z.string(), z.json());

export default defineDynamic({
	events: {
		"session.started": async (_event, ctx) => {
			if (purposeOf(ctx) !== "team-agent") return null;
			const runId = attribute(ctx, "runId");
			if (!runId) return null;
			const run = await db.agentRun.findUnique({
				where: { id: runId },
				select: { version: { select: { manifest: true } } },
			});
			if (!run) return null;
			const manifest = parseAgentManifest(run.version.manifest);
			if (manifest.mcp.length === 0) return null;
			const connections = await db.mcpConnection.findMany({
				where: {
					organizationId: WORKSPACE_ID,
					platformSlug: {
						in: manifest.mcp.map((grant) => grant.platformSlug),
					},
					status: "CONNECTED",
				},
				select: {
					id: true,
					platformSlug: true,
					accessMode: true,
					toolSnapshots: {
						where: { reviewState: "REVIEWED" },
						select: {
							name: true,
							description: true,
							inputSchema: true,
							fingerprint: true,
							callKind: true,
						},
					},
				},
			});

			return Object.fromEntries(
				connections.flatMap((connection) => {
					const grant = manifest.mcp.find(
						(item) => item.platformSlug === connection.platformSlug,
					);
					if (!grant) return [];
					return connection.toolSnapshots.flatMap((snapshot) => {
						const tool = grant.tools.find(
							(item) =>
								item.name === snapshot.name &&
								item.fingerprint === snapshot.fingerprint,
						);
						if (!tool) return [];
						if (
							connection.accessMode === "READ_ONLY" &&
							tool.callKind !== "read"
						) {
							return [];
						}
						const schema = inputSchema.parse(snapshot.inputSchema);
						const platformSlug = connection.platformSlug;
						const connectionId = connection.id;
						const toolName = snapshot.name;
						return [
							[
								`${platformSlug}__${toolName}`,
								defineTool({
									description: snapshot.description ?? tool.summary,
									inputSchema: schema,
									approval: (context) =>
										authorizeMcpTool(platformSlug, context),
									async execute(arguments_) {
										return callMcpTool({
											connectionId,
											platformSlug,
											toolName,
											arguments: inputSchema.parse(arguments_),
										});
									},
									toModelOutput: mcpModelOutput,
								}),
							] as const,
						];
					});
				}),
			);
		},
	},
});
