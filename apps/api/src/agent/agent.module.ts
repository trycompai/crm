import { Module } from "@nestjs/common";
import { AgentQueueService } from "./agent-queue.service";
import { AgentTriggerService } from "./agent-trigger.service";
import { ResearchKeyService } from "./research-key.service";

@Module({
	providers: [AgentTriggerService, AgentQueueService, ResearchKeyService],
	exports: [AgentTriggerService, AgentQueueService, ResearchKeyService],
})
export class AgentModule {}
