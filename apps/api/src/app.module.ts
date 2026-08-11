import { auth } from "@crm/auth";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule as BetterAuthModule } from "@thallesp/nestjs-better-auth";
import { ActivitiesModule } from "./activities/activities.module";
import { AgentModule } from "./agent/agent.module";
import { ApprovalModule } from "./approval/approval.module";
import { AuthModule } from "./auth/auth.module";
import { BackfillModule } from "./backfill/backfill.module";
import { AppCacheModule } from "./cache/cache.module";
import { CalendarModule } from "./calendar/calendar.module";
import { CompaniesModule } from "./companies/companies.module";
import { validateEnv } from "./config/env.validation";
import { ContactsModule } from "./contacts/contacts.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { CrmModule } from "./crm/crm.module";
import { CurrencyModule } from "./currency/currency.module";
import { CustomersModule } from "./customers/customers.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { DatabaseModule } from "./database/database.module";
import { DealsModule } from "./deals/deals.module";
import { FieldsModule } from "./fields/fields.module";
import { GoogleModule } from "./google/google.module";
import { HealthModule } from "./health/health.module";
import { InboundModule } from "./inbound/inbound.module";
import { InstancesModule } from "./instances/instances.module";
import { LoggingModule } from "./logging/logging.module";
import { logAuthRoute } from "./logging/request-logger.middleware";
import { MailboxModule } from "./mailbox/mailbox.module";
import { MarketingModule } from "./marketing/marketing.module";
import { MicrosoftModule } from "./microsoft/microsoft.module";
import { OutreachModule } from "./outreach/outreach.module";
import { ProspectsModule } from "./prospects/prospects.module";
import { SearchModule } from "./search/search.module";
import { ServiceModule } from "./service/service.module";
import { SettingsModule } from "./settings/settings.module";
import { SsoModule } from "./sso/sso.module";
import { SyncModule } from "./sync/sync.module";
import { TelemetryModule } from "./telemetry/telemetry.module";
import { TodayModule } from "./today/today.module";
import { TrpcModule } from "./trpc/trpc.module";
import { UsersModule } from "./users/users.module";
import { WorkModule } from "./work/work.module";
import { WorkspaceModule } from "./workspace/workspace.module";

@Module({
	imports: [
		LoggingModule,
		ConfigModule.forRoot({
			isGlobal: true,
			cache: true,
			validate: validateEnv,
		}),
		AppCacheModule,
		DatabaseModule,
		CrmModule,
		BetterAuthModule.forRoot({ auth, middleware: logAuthRoute }),
		AuthModule,
		HealthModule,
		CalendarModule,
		InboundModule,
		InstancesModule,
		TrpcModule,
		UsersModule,
		CompaniesModule,
		ContactsModule,
		ConversationsModule,
		CurrencyModule,
		CustomersModule,
		DealsModule,
		FieldsModule,
		ActivitiesModule,
		AgentModule,
		ApprovalModule,
		DashboardModule,
		SearchModule,
		MailboxModule,
		GoogleModule,
		MicrosoftModule,
		MarketingModule,
		OutreachModule,
		ProspectsModule,
		SyncModule,
		SettingsModule,
		ServiceModule,
		WorkspaceModule,
		WorkModule,
		SsoModule,
		BackfillModule,
		TelemetryModule,
		TodayModule,
	],
})
export class AppModule {}
