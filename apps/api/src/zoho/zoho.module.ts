import { zohoConfig } from "@crm/auth";
import { Module } from "@nestjs/common";
import { MailboxModule } from "../mailbox/mailbox.module";
import { TrpcModule } from "../trpc/trpc.module";
import { ZOHO_ENDPOINTS } from "./zoho.constants";
import { ZohoRouter } from "./zoho.router";
import { ZohoConnectionService } from "./zoho-connection.service";
import { ZohoMailClient } from "./zoho-mail.client";
import { ZohoMailSyncService } from "./zoho-mail-sync.service";
import { ZohoSyncService } from "./zoho-sync.service";

@Module({
	imports: [TrpcModule, MailboxModule],
	providers: [
		{
			// Resolved once at boot rather than read per call: which data centre
			// the account lives in cannot change while the process is running.
			provide: ZOHO_ENDPOINTS,
			useFactory: () => zohoConfig()?.endpoints ?? null,
		},
		ZohoMailClient,
		ZohoMailSyncService,
		ZohoSyncService,
		ZohoConnectionService,
		ZohoRouter,
	],
	exports: [ZohoSyncService, ZohoConnectionService],
})
export class ZohoModule {}
