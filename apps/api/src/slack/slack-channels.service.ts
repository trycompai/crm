import {
	BadRequestException,
	Injectable,
	Logger,
	ServiceUnavailableException,
} from "@nestjs/common";
import { bridge } from "../agent/bridge";

const CREATE_TIMEOUT_MS = 20_000;

@Injectable()
export class SlackChannelsService {
	private readonly logger = new Logger(SlackChannelsService.name);

	async create(name: string, isPrivate: boolean) {
		const agent = bridge();

		if (!agent) {
			throw new ServiceUnavailableException(
				"This install has no AGENT_BRIDGE_SECRET, so nothing can reach Slack.",
			);
		}

		let response: Response;

		try {
			response = await fetch(agent.url("/internal/crm/slack/create-channel"), {
				method: "POST",
				headers: {
					authorization: `Bearer ${agent.secret}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					type: "slack.channel.create",
					channelName: name,
					isPrivate,
				}),
				signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
			});
		} catch (error) {
			this.logger.error(
				{ message: "Could not reach the agent to create a channel", name },
				error instanceof Error ? error.stack : String(error),
			);
			throw new ServiceUnavailableException(
				"The agent is not answering, so the channel was not created.",
			);
		}

		const body = (await response.json().catch(() => null)) as {
			channel?: { id: string; name: string };
			error?: string;
		} | null;

		if (!response.ok || !body?.channel) {
			throw new BadRequestException(
				body?.error ?? "Slack refused to create that channel.",
			);
		}

		return { channel: body.channel };
	}
}
