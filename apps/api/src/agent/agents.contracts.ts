import { z } from "zod";

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

export const agentSetChannelInput = agentIdInput.extend({
	clientRequestId: z.uuid(),
	channelId: z.string().trim().min(1).max(64),
	channelName: z.string().trim().min(1).max(120),
});

export type AgentSetChannelInput = z.infer<typeof agentSetChannelInput>;
