import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { CustomersRouter } from "./customers.router";
import { CustomersService } from "./customers.service";

@Module({
	imports: [TrpcModule],
	providers: [CustomersService, CustomersRouter],
	exports: [CustomersService],
})
export class CustomersModule {}
