import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import {
	MarketingDrainController,
	MarketingPublicController,
} from "./marketing.controller";
import {
	MarketingCampaignsRouter,
	MarketingRouter,
	MarketingSegmentsRouter,
	MarketingTemplatesRouter,
} from "./marketing.router";
import { MarketingActivityService } from "./marketing-activity.service";
import { MarketingAttachmentsService } from "./marketing-attachments.service";
import { MarketingCampaignsService } from "./marketing-campaigns.service";
import { MarketingComposeService } from "./marketing-compose.service";
import { MarketingDrainService } from "./marketing-drain.service";
import { MarketingSegmentsService } from "./marketing-segments.service";
import { MarketingSettingsService } from "./marketing-settings.service";
import { MarketingTemplatesService } from "./marketing-templates.service";
import { ResendService } from "./resend.service";
import { ResendOauthController } from "./resend-oauth.controller";
import { ResendOauthService } from "./resend-oauth.service";

@Module({
	imports: [TrpcModule, AgentModule],
	controllers: [
		MarketingDrainController,
		MarketingPublicController,
		ResendOauthController,
	],
	providers: [
		ResendOauthService,
		ResendService,
		MarketingActivityService,
		MarketingComposeService,
		MarketingSettingsService,
		MarketingSegmentsService,
		MarketingTemplatesService,
		MarketingAttachmentsService,
		MarketingCampaignsService,
		MarketingDrainService,
		MarketingRouter,
		MarketingCampaignsRouter,
		MarketingSegmentsRouter,
		MarketingTemplatesRouter,
	],
	exports: [MarketingComposeService, MarketingSettingsService],
})
export class MarketingModule {}
