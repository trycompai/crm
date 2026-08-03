import { auth } from "@crm/auth";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule as BetterAuthModule } from "@thallesp/nestjs-better-auth";
import { ActivitiesModule } from "./activities/activities.module";
import { AuthModule } from "./auth/auth.module";
import { BackfillModule } from "./backfill/backfill.module";
import { AppCacheModule } from "./cache/cache.module";
import { CompaniesModule } from "./companies/companies.module";
import { validateEnv } from "./config/env.validation";
import { ContactsModule } from "./contacts/contacts.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { CrmModule } from "./crm/crm.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { DatabaseModule } from "./database/database.module";
import { DealsModule } from "./deals/deals.module";
import { GoogleModule } from "./google/google.module";
import { HealthModule } from "./health/health.module";
import { LoggingModule } from "./logging/logging.module";
import { logAuthRoute } from "./logging/request-logger.middleware";
import { ProspectingModule } from "./prospecting/prospecting.module";
import { SearchModule } from "./search/search.module";
import { SettingsModule } from "./settings/settings.module";
import { TrpcModule } from "./trpc/trpc.module";
import { UsersModule } from "./users/users.module";

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
		TrpcModule,
		UsersModule,
		CompaniesModule,
		ContactsModule,
		ConversationsModule,
		DealsModule,
		ActivitiesModule,
		DashboardModule,
		SearchModule,
		GoogleModule,
		SettingsModule,
		BackfillModule,
		ProspectingModule,
	],
})
export class AppModule {}
