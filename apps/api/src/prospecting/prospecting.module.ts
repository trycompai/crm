import { Module } from "@nestjs/common";
import { GoogleModule } from "../google/google.module";
import { TrpcModule } from "../trpc/trpc.module";
import { ProspectingController } from "./prospecting.controller";
import { ProspectingRouter } from "./prospecting.router";
import { ProspectingService } from "./prospecting.service";

@Module({
	imports: [TrpcModule, GoogleModule],
	controllers: [ProspectingController],
	providers: [ProspectingService, ProspectingRouter],
	exports: [ProspectingService],
})
export class ProspectingModule {}
