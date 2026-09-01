import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { HubspotRouter } from "./hubspot.router";
import { HubspotConnectionService } from "./hubspot-connection.service";

@Module({
	imports: [TrpcModule, AgentModule],
	providers: [HubspotConnectionService, HubspotRouter],
	exports: [HubspotConnectionService],
})
export class HubspotModule {}
