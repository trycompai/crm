import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { CurrencyModule } from "../currency/currency.module";
import { FieldsModule } from "../fields/fields.module";
import { TrpcModule } from "../trpc/trpc.module";
import { DealScoreService } from "./deal-score.service";
import { DealsRouter } from "./deals.router";
import { DealsService } from "./deals.service";
import { StalledDealsService } from "./stalled-deals.service";

@Module({
	imports: [AgentModule, FieldsModule, TrpcModule, CurrencyModule],
	providers: [DealsService, DealsRouter, StalledDealsService, DealScoreService],
	exports: [DealsService, StalledDealsService, DealScoreService],
})
export class DealsModule {}
