import { Module } from "@nestjs/common";
import { OperatingKernelCoreModule } from "../operating-kernel/operating-kernel-core.module";
import { TrpcModule } from "../trpc/trpc.module";
import { ApprovalRouter } from "./approval.router";
import { ApprovalService } from "./approval.service";

@Module({
	imports: [OperatingKernelCoreModule, TrpcModule],
	providers: [ApprovalRouter, ApprovalService],
	exports: [ApprovalService],
})
export class ApprovalModule {}
