import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { AgentAccessService } from "./agent-access.service";
import { AgentDefinitionsService } from "./agent-definitions.service";
import { AgentQueueService } from "./agent-queue.service";
import { AgentRunsService } from "./agent-runs.service";
import { AgentTriggerService } from "./agent-trigger.service";
import { AgentsRouter } from "./agents.router";
import { DispatchHeartbeatService } from "./dispatch-heartbeat.service";
import { ResearchKeyService } from "./research-key.service";

@Module({
	imports: [TrpcModule],
	providers: [
		AgentAccessService,
		AgentDefinitionsService,
		AgentQueueService,
		AgentRunsService,
		AgentTriggerService,
		AgentsRouter,
		DispatchHeartbeatService,
		ResearchKeyService,
	],
	exports: [
		AgentAccessService,
		AgentTriggerService,
		AgentQueueService,
		ResearchKeyService,
	],
})
export class AgentModule {}
