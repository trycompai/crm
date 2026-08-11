import { Module } from "@nestjs/common";
import { OperatingKernelCoreModule } from "../operating-kernel/operating-kernel-core.module";
import { TrpcModule } from "../trpc/trpc.module";
import { ServiceRouter } from "./service.router";
import { ServiceService } from "./service.service";

@Module({
	imports: [OperatingKernelCoreModule, TrpcModule],
	providers: [ServiceService, ServiceRouter],
	exports: [ServiceService],
})
export class ServiceModule {}
