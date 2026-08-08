import { WorkflowStatus, WorkflowTriggerKind } from "@crm/db";
import { z } from "zod";
import { listInput } from "../trpc/list-input";

const statusEnum = z.enum(
	Object.values(WorkflowStatus) as [WorkflowStatus, ...WorkflowStatus[]],
);
const triggerEnum = z.enum(
	Object.values(WorkflowTriggerKind) as [
		WorkflowTriggerKind,
		...WorkflowTriggerKind[],
	],
);

export const WORKFLOW_ACTIONS = [
	"send_sms",
	"send_email",
	"set_stage",
	"add_tag",
	"wait",
	"notify_slack",
	"agent_task",
] as const;

export const workflowStepInput = z.object({
	action: z.enum(WORKFLOW_ACTIONS),
	to: z.string().optional(),
	body: z.string().optional(),
	subject: z.string().optional(),
	stage: z.string().optional(),
	tag: z.string().optional(),
	minutes: z.number().int().positive().optional(),
	message: z.string().optional(),
	prompt: z.string().optional(),
});

export type WorkflowStep = z.infer<typeof workflowStepInput>;

export const workflowListInput = listInput.extend({
	status: z.string().default("all"),
	trigger: z.string().default("all"),
});

export type WorkflowListInput = z.infer<typeof workflowListInput>;

export const workflowCreateInput = z.object({
	name: z.string().trim().min(1),
	description: z.string().nullable().optional(),
	status: statusEnum.optional(),
	triggerKind: triggerEnum,
	triggerConfig: z.unknown().optional(),
	steps: z.array(workflowStepInput).optional(),
	clientAccountId: z.string().nullable().optional(),
});

export const workflowUpdateInput = z.object({
	name: z.string().trim().min(1).optional(),
	description: z.string().nullable().optional(),
	status: statusEnum.optional(),
	triggerKind: triggerEnum.optional(),
	triggerConfig: z.unknown().optional(),
	steps: z.array(workflowStepInput).optional(),
	clientAccountId: z.string().nullable().optional(),
});

export const workflowUpdateArgs = z.object({
	id: z.string(),
	data: workflowUpdateInput,
});

export const workflowIdInput = z.object({ id: z.string() });

export const workflowRunInput = z.object({
	id: z.string(),
	context: z.unknown().optional(),
});
