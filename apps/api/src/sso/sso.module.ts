import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { SsoRouter } from "./sso.router";
import { SsoService } from "./sso.service";

@Module({
	imports: [TrpcModule],
	providers: [SsoService, SsoRouter],
	exports: [SsoService],
})
export class SsoModule {}
