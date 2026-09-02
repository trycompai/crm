import type { ZodType, z } from "zod";
import * as activityMeta from "./activity-meta";
import * as agentAction from "./agent-action";
import * as agentEvents from "./agent-events";
import * as agentManifest from "./agent-manifest";
import * as agents from "./agents";
import * as builderQuestion from "./builder-question";
import * as eveStream from "./eve-stream";
import * as eveTool from "./eve-tool";
import * as slack from "./slack";
import * as slackEvents from "./slack-events";

export const schemas = {
	activityMeta,
	agentAction,
	agentEvents,
	agentManifest,
	agents,
	builderQuestion,
	eveStream,
	eveTool,
	slack,
	slackEvents,
} as const;

export type { ActivityMeta, ActivityMetaFields } from "./activity-meta";
export type { AgentActionResult } from "./agent-action";
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
export type {
	BuilderQuestion,
	BuilderQuestionOption,
} from "./builder-question";
export type {
	EveRequestedActions,
	EveSettledAction,
	EveStreamEvent,
	EveTurnFailure,
	EveTurnReference,
} from "./eve-stream";
export type {
	EveToolFields,
	EveToolInput,
	EveToolOutcome,
	EveToolOutput,
} from "./eve-tool";
export type { AuthTest, JoinPayload, OauthAccess, Reply } from "./slack";
export type {
	EventCallback,
	SlackEnvelope,
	SlackEvent,
} from "./slack-events";

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
