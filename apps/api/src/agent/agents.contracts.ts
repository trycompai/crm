import { schemas } from "@crm/validation";
import { z } from "zod";

export const agentManifest = schemas.agents.capabilities.loose();

export const agentIdInput = z.object({ id: z.string().min(1) });

export const agentHistoryInput = agentIdInput.extend({
	limit: z.number().int().min(1).max(100).default(50),
});

export const agentUpdateInput = agentIdInput.extend({
	name: z.string().trim().min(1).max(120),
	description: z.string().trim().max(500).nullable(),
});

export type AgentUpdateInput = z.infer<typeof agentUpdateInput>;

export const agentRunNowInput = agentIdInput.extend({
	clientRequestId: z.uuid(),
});

export type AgentRunNowInput = z.infer<typeof agentRunNowInput>;

export const agentRetryRunInput = agentIdInput.extend({
	runId: z.string().min(1),
	clientRequestId: z.uuid(),
});

export type AgentRetryRunInput = z.infer<typeof agentRetryRunInput>;

export const agentCancelRunInput = agentIdInput.extend({
	runId: z.string().min(1),
});

export type AgentCancelRunInput = z.infer<typeof agentCancelRunInput>;

export const agentDeployInput = agentIdInput.extend({
	versionId: z.string().min(1),
	clientRequestId: z.uuid(),
});

export type AgentDeployInput = z.infer<typeof agentDeployInput>;

export const agentReviseInput = agentIdInput.extend({
	clientRequestId: z.uuid(),
	channel: z
		.object({
			id: z.string().trim().min(1).max(64),
			name: z.string().trim().min(1).max(120),
		})
		.optional(),
	actions: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
	resources: z
		.array(
			z.object({
				id: z.string().trim().min(1).max(160),
				kind: z.enum(["company", "contact", "deal", "integration"]),
				label: z.string().trim().min(1).max(160),
			}),
		)
		.max(50)
		.optional(),
});

export type AgentReviseInput = z.infer<typeof agentReviseInput>;

export const agentSaveFileInput = agentIdInput.extend({
	clientRequestId: z.uuid(),
	path: z.string().trim().min(1).max(400),
	content: z.string().max(500_000),
});

export type AgentSaveFileInput = z.infer<typeof agentSaveFileInput>;
