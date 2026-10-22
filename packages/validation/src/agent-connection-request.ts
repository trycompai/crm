import { z } from "zod";

export const agentConnectionRequestStatus = z.enum([
	"not_connected",
	"needs_reauth",
	"error",
	"connected",
	"admins_only",
]);

export const agentConnectionRequest = z.object({
	vendor: z.string().trim().min(1),
	name: z.string().trim().min(1),
	status: agentConnectionRequestStatus,
});

export type AgentConnectionRequest = z.infer<typeof agentConnectionRequest>;
export type AgentConnectionRequestStatus = z.infer<
	typeof agentConnectionRequestStatus
>;
