import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { WorkflowsRouter } from "./workflows.router";
import { WorkflowsService } from "./workflows.service";

@Module({
	imports: [TrpcModule],
	providers: [WorkflowsService, WorkflowsRouter],
	exports: [WorkflowsService],
})
export class WorkflowsModule {}
