import { z } from "zod";
import { AGENT_ACTION_TYPES } from "./agent-manifest";

const present = z.string().trim().min(1);

export const result = z.discriminatedUnion("type", [
	z.object({
		type: z.literal(AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE),
		activityId: present,
	}),
	z.object({
		type: z.literal(AGENT_ACTION_TYPES.RUN_SUMMARY),
	}),
	z.object({
		type: z.literal(AGENT_ACTION_TYPES.SLACK_MESSAGE_POST),
		channel: present,
		ts: present,
	}),
	z.object({
		type: z.literal(AGENT_ACTION_TYPES.SLACK_CHANNEL_OPEN),
		channelId: present,
	}),
	z.object({
		type: z.literal(AGENT_ACTION_TYPES.SLACK_CHANNEL_INVITE),
		invite_id: present.optional(),
		url: present.optional(),
		email: z.email(),
		kind: z.enum(["member", "connect"]),
	}),
]);

export const storedResult = result.nullable();

export const agentActionResult = result;

export type AgentActionResult = z.infer<typeof result>;

function issues(error: z.ZodError): string {
	return error.issues
		.map((issue) =>
			issue.path.length > 0
				? `${issue.path.join(".")} ${issue.message}`
				: issue.message,
		)
		.join("; ");
}

export function parseAgentActionResult(value: unknown): AgentActionResult {
	const parsed = result.safeParse(value);
	if (parsed.success) return parsed.data;
	throw new Error(`This agent action result: ${issues(parsed.error)}`);
}

export function readAgentActionResult(
	type: string,
	value: unknown,
): AgentActionResult | null {
	if (value === null || value === undefined) return null;

	const parsed = storedResult.safeParse(value);
	if (!parsed.success) {
		throw new Error(`This agent action result: ${issues(parsed.error)}`);
	}
	if (parsed.data === null) return null;
	if (parsed.data.type !== type) {
		throw new Error(
			`This agent action result: type ${parsed.data.type} does not match action ${type}`,
		);
	}
	return parsed.data;
}
