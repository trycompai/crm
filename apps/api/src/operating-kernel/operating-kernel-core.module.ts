import { Module } from "@nestjs/common";
import { ApprovalExecutionService } from "./approval-execution.service";
import { KernelIdempotencyService } from "./kernel-idempotency.service";
import { OperatingKernelAccessService } from "./operating-kernel-access.service";
import { OperatingKernelCleanupService } from "./operating-kernel-cleanup.service";
import { SubjectResolverService } from "./subject-resolver.service";

@Module({
	providers: [
		ApprovalExecutionService,
		OperatingKernelAccessService,
		OperatingKernelCleanupService,
		KernelIdempotencyService,
		SubjectResolverService,
	],
	exports: [
		ApprovalExecutionService,
		OperatingKernelAccessService,
		OperatingKernelCleanupService,
		KernelIdempotencyService,
		SubjectResolverService,
	],
})
export class OperatingKernelCoreModule {}
