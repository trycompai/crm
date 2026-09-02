import { verifySlackSignature } from "@crm/auth";
import { schemas } from "@crm/validation";
import {
	Body,
	Controller,
	Headers,
	HttpCode,
	Logger,
	Post,
	UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiExcludeEndpoint } from "@nestjs/swagger";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { AgentTriggerService } from "../agent/agent-trigger.service";
import type { EnvironmentVariables } from "../config/env.validation";

export const SLACK_EVENTS_PATH = "/webhooks/slack/events";

@Controller("webhooks/slack")
export class SlackEventsController {
	private readonly logger = new Logger(SlackEventsController.name);
	private readonly secret: string | undefined;

	constructor(
		private readonly agent: AgentTriggerService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.secret = config.get("SLACK_SIGNING_SECRET", { infer: true });
	}

	@Post("events")
	@HttpCode(200)
	@AllowAnonymous()
	@ApiExcludeEndpoint()
	async events(
		@Body() raw: Buffer,
		@Headers("x-slack-request-timestamp") timestamp: string | undefined,
		@Headers("x-slack-signature") signature: string | undefined,
	): Promise<{ challenge: string } | { ok: true }> {
		const body = Buffer.isBuffer(raw)
			? raw.toString("utf8")
			: String(raw ?? "");

		const verdict = verifySlackSignature({
			body,
			timestamp,
			signature,
			secret: this.secret,
		});

		if (!verdict.ok) {
			this.logger.warn({
				message: "A Slack event was refused",
				reason: verdict.reason,
			});
			throw new UnauthorizedException("The Slack signature did not verify.");
		}

		const payload = schemas.slackEvents.readSlackEventBody(body);
		if (!payload) return { ok: true };

		const envelope = schemas.slackEvents.slackEnvelope.safeParse(payload);

		if (!envelope.success) return { ok: true };

		if (envelope.data.type === "url_verification") {
			return { challenge: envelope.data.challenge };
		}

		const { event, event_id, team_id } = envelope.data;

		if (!schemas.slackEvents.isActionable(event)) return { ok: true };

		const { stored } = await this.agent.slackEventReceived({
			eventId: event_id,
			type: event.type,
			teamId: team_id,
			channelId: event.channel,
			messageTs: event.ts,
			payload,
		});

		this.logger.log({
			message: stored ? "Slack event stored" : "Slack event already seen",
			type: event.type,
		});

		return { ok: true };
	}
}
