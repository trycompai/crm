import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { CompaniesModule } from "../companies/companies.module";
import { TrpcModule } from "../trpc/trpc.module";
import {
	TrackingController,
	TrackingRetentionController,
} from "./tracking.controller";
import { TrackingRouter } from "./tracking.router";
import { TrackingService } from "./tracking.service";
import { TrackingConfigService } from "./tracking-config.service";
import { TrackingCounterService } from "./tracking-counter.service";
import { TrackingFilingService } from "./tracking-filing.service";
import { TrackingIngestService } from "./tracking-ingest.service";
import { TrackingRollupService } from "./tracking-rollup.service";

@Module({
	imports: [TrpcModule, AgentModule, CompaniesModule],
	controllers: [TrackingController, TrackingRetentionController],
	providers: [
		TrackingConfigService,
		TrackingCounterService,
		TrackingFilingService,
		TrackingIngestService,
		TrackingRollupService,
		TrackingService,
		TrackingRouter,
	],
	exports: [TrackingConfigService],
})
export class TrackingModule {}
