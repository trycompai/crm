import { CRM_EVENT_CATALOG, CRM_EVENT_TYPES } from "@crm/db/crm-events";
import { z } from "zod";

export const crmEventTask = z
	.object({
		type: z.enum(CRM_EVENT_TYPES),
		record: z.object({
			kind: z.string().trim(),
			id: z.string().trim().min(1),
		}),
		occurredAt: z
			.string()
			.trim()
			.min(1)
			.refine((value) => !Number.isNaN(new Date(value).getTime())),
		data: z.record(z.string(), z.json()).catch({}),
	})
	.refine(
		(task) => CRM_EVENT_CATALOG[task.type].recordKind === task.record.kind,
	);

export type CrmEventTask = z.infer<typeof crmEventTask>;

export const agentRunInput = z.object({
	event: z.object({ type: z.enum(CRM_EVENT_TYPES) }).optional(),
	record: z
		.object({
			kind: z.enum(["company", "contact", "deal"]),
			id: z.string().trim().min(1),
		})
		.optional(),
});

export type AgentRunInput = z.infer<typeof agentRunInput>;

export function runRecord(value: unknown): AgentRunInput["record"] {
	return agentRunInput.safeParse(value).data?.record;
}
