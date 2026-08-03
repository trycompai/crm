import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { CompaniesModule } from "../companies/companies.module";
import { TrpcModule } from "../trpc/trpc.module";
import { CalendarClient } from "./calendar.client";
import { CalendarSyncService } from "./calendar-sync.service";
import { ConversationService } from "./conversation.service";
import { GmailClient } from "./gmail.client";
import { GmailSyncService } from "./gmail-sync.service";
import { GoogleRouter } from "./google.router";
import { GoogleApiClient } from "./google-api.client";
import { GoogleConnectionService } from "./google-connection.service";
import { GoogleMatchService } from "./google-match.service";
import { GoogleSyncService } from "./google-sync.service";
import { GoogleTokenService } from "./google-token.service";
import { SyncController } from "./sync.controller";
import { SyncStateService } from "./sync-state.service";

@Module({
	imports: [TrpcModule, AgentModule, CompaniesModule],
	controllers: [SyncController],
	providers: [
		GoogleApiClient,
		GoogleTokenService,
		SyncStateService,
		GoogleMatchService,
		CalendarClient,
		CalendarSyncService,
		GmailClient,
		GmailSyncService,
		GoogleSyncService,
		GoogleConnectionService,
		ConversationService,
		GoogleRouter,
	],
	exports: [
		GoogleSyncService,
		GoogleConnectionService,
		GoogleTokenService,
		GmailClient,
	],
})
export class GoogleModule {}
