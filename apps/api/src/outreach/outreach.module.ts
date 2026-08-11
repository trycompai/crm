import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { OperatingKernelCoreModule } from "../operating-kernel/operating-kernel-core.module";
import { TrpcModule } from "../trpc/trpc.module";
import { OutreachRouter } from "./outreach.router";
import { OutreachService } from "./outreach.service";

@Module({
	imports: [TrpcModule, AgentModule, OperatingKernelCoreModule],
	providers: [OutreachService, OutreachRouter],
})
export class OutreachModule {}
