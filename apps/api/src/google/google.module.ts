import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { MailboxModule } from "../mailbox/mailbox.module";
import { TrpcModule } from "../trpc/trpc.module";
import { CalendarClient } from "./calendar.client";
import { CalendarSyncService } from "./calendar-sync.service";
import { ConversationService } from "./conversation.service";
import { GmailClient } from "./gmail.client";
import { GmailSyncService } from "./gmail-sync.service";
import { GoogleRouter } from "./google.router";
import { GoogleConnectionService } from "./google-connection.service";
import { GoogleSyncService } from "./google-sync.service";

@Module({
	imports: [TrpcModule, MailboxModule, AgentModule],
	providers: [
		CalendarClient,
		CalendarSyncService,
		GmailClient,
		GmailSyncService,
		GoogleSyncService,
		GoogleConnectionService,
		ConversationService,
		GoogleRouter,
	],
	exports: [GoogleSyncService, GoogleConnectionService],
})
export class GoogleModule {}
