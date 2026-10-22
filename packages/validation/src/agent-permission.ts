import { z } from "zod";

export const agentPermissionMode = z.enum(["manual", "auto", "bypass"]);

export type AgentPermissionMode = z.infer<typeof agentPermissionMode>;

export const builderToolApproval = z
	.object({
		kind: z.literal("tool-approval"),
		requestId: z.string().min(1),
		prompt: z.string().trim().min(1),
		action: z.object({
			kind: z.literal("tool-call"),
			callId: z.string().min(1),
			toolName: z.string().min(1),
			input: z.record(z.string(), z.json()),
		}),
		options: z.array(
			z.object({
				id: z.string().min(1),
				label: z.string().min(1),
				description: z.string().optional(),
				style: z.enum(["primary", "danger", "default"]).optional(),
			}),
		),
	})
	.nullable()
	.catch(null);

export type BuilderToolApproval = NonNullable<
	z.infer<typeof builderToolApproval>
>;
