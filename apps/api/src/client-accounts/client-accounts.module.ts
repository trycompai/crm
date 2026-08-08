import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { ClientAccountsRouter } from "./client-accounts.router";
import { ClientAccountsService } from "./client-accounts.service";

@Module({
	imports: [TrpcModule],
	providers: [ClientAccountsService, ClientAccountsRouter],
	exports: [ClientAccountsService],
})
export class ClientAccountsModule {}
