import type { ZodType, z } from "zod";
import * as agentEvents from "./agent-events";
import * as agentManifest from "./agent-manifest";
import * as agents from "./agents";
import * as slack from "./slack";

export const schemas = { agentEvents, agentManifest, agents, slack } as const;

export type { CrmEventTask } from "./agent-events";
export type {
	AgentActionType,
	AgentManifest,
	AgentManifestAction,
	AgentManifestResource,
	AgentManifestSummary,
	AgentManifestTrigger,
	AgentTriggerConfig,
	SlackDestination,
} from "./agent-manifest";
export type {
	Handoff,
	HandoffChannel,
	InputOption,
	InputRequest,
	InputRequested,
	Permission,
} from "./agents";
export type { AuthTest, Installation, JoinPayload, Reply } from "./slack";

export class InvalidInput extends Error {
	override readonly name = "InvalidInput";
}

export function parse<Schema extends ZodType>(
	schema: Schema,
	value: unknown,
	subject: string,
): z.infer<Schema> {
	const result = schema.safeParse(value);

	if (!result.success) {
		throw new InvalidInput(
			`${subject}: ${result.error.issues
				.map((issue) =>
					issue.path.length > 0
						? `${issue.path.join(".")} ${issue.message}`
						: issue.message,
				)
				.join("; ")}`,
		);
	}

	return result.data;
}
