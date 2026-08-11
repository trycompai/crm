import { Module } from "@nestjs/common";
import { OperatingKernelCoreModule } from "../operating-kernel/operating-kernel-core.module";
import { TrpcModule } from "../trpc/trpc.module";
import { MarketingRouter } from "./marketing.router";
import { MarketingService } from "./marketing.service";

@Module({
	imports: [OperatingKernelCoreModule, TrpcModule],
	providers: [MarketingService, MarketingRouter],
	exports: [MarketingService],
})
export class MarketingModule {}
