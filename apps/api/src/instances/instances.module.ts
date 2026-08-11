import { Module } from "@nestjs/common";
import { OperatingKernelCoreModule } from "../operating-kernel/operating-kernel-core.module";
import { TrpcModule } from "../trpc/trpc.module";
import { InstancesRouter } from "./instances.router";
import { InstancesService } from "./instances.service";

@Module({
	imports: [OperatingKernelCoreModule, TrpcModule],
	providers: [InstancesService, InstancesRouter],
	exports: [InstancesService],
})
export class InstancesModule {}
