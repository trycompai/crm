import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { ProspectsRouter } from "./prospects.router";
import { ProspectsService } from "./prospects.service";

@Module({
	imports: [AgentModule, TrpcModule],
	providers: [ProspectsService, ProspectsRouter],
	exports: [ProspectsService],
})
export class ProspectsModule {}
