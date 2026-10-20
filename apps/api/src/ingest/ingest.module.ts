import { Module } from "@nestjs/common";
import { CompaniesModule } from "../companies/companies.module";
import { DealsModule } from "../deals/deals.module";
import { GuyanaOpportunityService } from "./guyana-opportunity.service";
import { IngestRouter } from "./ingest.router";
import { IngestService } from "./ingest.service";
import { OpportunityOpsService } from "./opportunity-ops.service";
import { SignalQualificationService } from "./signal-qualification.service";

@Module({
	imports: [CompaniesModule, DealsModule],
	providers: [
		IngestService,
		SignalQualificationService,
		OpportunityOpsService,
		GuyanaOpportunityService,
		IngestRouter,
	],
	exports: [
		IngestService,
		SignalQualificationService,
		OpportunityOpsService,
		GuyanaOpportunityService,
	],
})
export class IngestModule {}
