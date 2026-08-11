import { Module } from "@nestjs/common";
import { OperatingKernelCoreModule } from "../operating-kernel/operating-kernel-core.module";
import { TrpcModule } from "../trpc/trpc.module";
import { WorkRouter } from "./work.router";
import { WorkService } from "./work.service";

@Module({
	imports: [OperatingKernelCoreModule, TrpcModule],
	providers: [WorkRouter, WorkService],
	exports: [WorkService],
})
export class WorkModule {}
