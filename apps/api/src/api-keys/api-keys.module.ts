import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { ApiKeysRouter } from "./api-keys.router";
import { ApiKeysService } from "./api-keys.service";

@Module({
	imports: [TrpcModule],
	providers: [ApiKeysService, ApiKeysRouter],
	exports: [ApiKeysService],
})
export class ApiKeysModule {}
