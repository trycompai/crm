import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { OutreachRouter } from "./outreach.router";
import { OutreachService } from "./outreach.service";

@Module({
	imports: [TrpcModule, AgentModule],
	providers: [OutreachService, OutreachRouter],
})
export class OutreachModule {}
