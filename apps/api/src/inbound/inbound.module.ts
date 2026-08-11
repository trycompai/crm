import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { InboundRouter } from "./inbound.router";
import { InboundService } from "./inbound.service";

@Module({
	imports: [TrpcModule, AgentModule],
	providers: [InboundService, InboundRouter],
})
export class InboundModule {}
