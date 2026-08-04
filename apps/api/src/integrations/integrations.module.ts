import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";

@Module({
	imports: [AgentModule],
	controllers: [IntegrationsController],
	providers: [IntegrationsService],
})
export class IntegrationsModule {}
