import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { BackfillModule } from "../backfill/backfill.module";
import { TrpcModule } from "../trpc/trpc.module";
import { ModelCatalogService } from "./model-catalog.service";
import { SettingsRouter } from "./settings.router";
import { SettingsService } from "./settings.service";

@Module({
	imports: [TrpcModule, AgentModule, BackfillModule],
	providers: [ModelCatalogService, SettingsService, SettingsRouter],
	exports: [SettingsService],
})
export class SettingsModule {}
