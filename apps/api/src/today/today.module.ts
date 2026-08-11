import { Module } from "@nestjs/common";
import { ApprovalModule } from "../approval/approval.module";
import { OperatingKernelCoreModule } from "../operating-kernel/operating-kernel-core.module";
import { TrpcModule } from "../trpc/trpc.module";
import { TodayRouter } from "./today.router";
import { TodayService } from "./today.service";

@Module({
	imports: [ApprovalModule, OperatingKernelCoreModule, TrpcModule],
	providers: [TodayRouter, TodayService],
})
export class TodayModule {}
