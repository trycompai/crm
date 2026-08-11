import {
	Injectable,
	Logger,
	type OnApplicationBootstrap,
	type OnApplicationShutdown,
} from "@nestjs/common";
import { AGENT_DISPATCH } from "./agent-dispatch.config";
import { AgentTriggerService } from "./agent-trigger.service";

@Injectable()
export class DispatchHeartbeatService
	implements OnApplicationBootstrap, OnApplicationShutdown
{
	private readonly logger = new Logger(DispatchHeartbeatService.name);
	private timer: ReturnType<typeof setInterval> | null = null;

	constructor(private readonly trigger: AgentTriggerService) {}

	onApplicationBootstrap(): void {
		if (!this.trigger.canReachAgent()) {
			this.logger.log({
				message:
					"No agent bridge secret, so queued work waits for the agent's own schedule.",
			});
			return;
		}

		this.trigger.drainQueues();
		this.timer = setInterval(
			() => this.trigger.drainQueues(),
			AGENT_DISPATCH.heartbeat.everyMs,
		);
		this.timer.unref?.();
	}

	onApplicationShutdown(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}
}
