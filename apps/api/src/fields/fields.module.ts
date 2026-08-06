import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { FieldsRouter } from "./fields.router";
import { FieldsService } from "./fields.service";

@Module({
	imports: [TrpcModule, AgentModule],
	providers: [FieldsService, FieldsRouter],
	exports: [FieldsService],
})
export class FieldsModule {}
