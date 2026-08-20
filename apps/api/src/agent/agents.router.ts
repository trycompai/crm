import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import { AgentDefinitionsService } from "./agent-definitions.service";
import { AgentRunsService } from "./agent-runs.service";
import {
	agentActivityOutput,
	agentArchiveOutput,
	agentByIdOutput,
	agentCancelRunInput,
	agentCancelRunOutput,
	agentDeployInput,
	agentDeployOutput,
	agentFilesOutput,
	agentHistoryInput,
	agentHistoryOutput,
	agentIdInput,
	agentListOutput,
	agentPauseOutput,
	agentRemoveOutput,
	agentRestoreOutput,
	agentResumeOutput,
	agentRetryRunInput,
	agentRetryRunOutput,
	agentReviseInput,
	agentReviseOutput,
	agentRunNowInput,
	agentRunNowOutput,
	agentSaveFileInput,
	agentSaveFileOutput,
	agentUpdateInput,
	agentUpdateOutput,
} from "./agents.contracts";

@Router({ alias: "agents" })
@UseMiddlewares(AuthMiddleware)
export class AgentsRouter {
	constructor(
		@Inject(AgentDefinitionsService)
		private readonly agents: AgentDefinitionsService,
		@Inject(AgentRunsService)
		private readonly runs: AgentRunsService,
	) {}

	@Query({
		output: agentListOutput,
		meta: restMeta("GET", "/agents", ["Agents"]),
	})
	async list(@Ctx() ctx: AuthedTrpcContext) {
		return this.agents.list(ctx.user.id);
	}

	@Mutation({
		input: agentReviseInput,
		output: agentReviseOutput,
		meta: restMeta("POST", "/agents/{id}/revise", ["Agents"]),
	})
	async revise(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentReviseInput>,
	) {
		return this.agents.revise(input, ctx.user.id);
	}

	@Query({
		input: agentIdInput,
		output: agentFilesOutput,
		meta: restMeta("GET", "/agents/{id}/files", ["Agents"]),
	})
	async files(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.agents.files(id, ctx.user.id);
	}

	@Mutation({
		input: agentSaveFileInput,
		output: agentSaveFileOutput,
		meta: restMeta("POST", "/agents/{id}/save-file", ["Agents"]),
	})
	async saveFile(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentSaveFileInput>,
	) {
		return this.agents.saveFile(input, ctx.user.id);
	}

	@Query({
		input: agentIdInput,
		output: agentByIdOutput,
		meta: restMeta("GET", "/agents/{id}", ["Agents"]),
	})
	async byId(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.agents.byId(id, ctx.user.id);
	}

	@Query({
		input: agentHistoryInput,
		output: agentHistoryOutput,
		meta: restMeta("GET", "/agents/{id}/history", ["Agents"]),
	})
	async history(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentHistoryInput>,
	) {
		return this.runs.list(input.id, input.limit, ctx.user.id);
	}

	@Query({
		input: agentHistoryInput,
		output: agentActivityOutput,
		meta: restMeta("GET", "/agents/{id}/activity", ["Agents"]),
	})
	async activity(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentHistoryInput>,
	) {
		return this.runs.activity(input.id, input.limit, ctx.user.id);
	}

	@Mutation({
		input: agentUpdateInput,
		output: agentUpdateOutput,
		meta: restMeta("PATCH", "/agents/{id}", ["Agents"]),
	})
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentUpdateInput>,
	) {
		return this.agents.update(input, ctx.user.id);
	}

	@Mutation({
		input: agentDeployInput,
		output: agentDeployOutput,
		meta: restMeta("POST", "/agents/{id}/deploy", ["Agents"]),
	})
	async deploy(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentDeployInput>,
	) {
		return this.agents.deploy(input, ctx.user.id);
	}

	@Mutation({
		input: agentIdInput,
		output: agentPauseOutput,
		meta: restMeta("POST", "/agents/{id}/pause", ["Agents"]),
	})
	async pause(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.agents.pause(id, ctx.user.id);
	}

	@Mutation({
		input: agentIdInput,
		output: agentResumeOutput,
		meta: restMeta("POST", "/agents/{id}/resume", ["Agents"]),
	})
	async resume(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.agents.resume(id, ctx.user.id);
	}

	@Mutation({
		input: agentIdInput,
		output: agentArchiveOutput,
		meta: restMeta("POST", "/agents/{id}/archive", ["Agents"]),
	})
	async archive(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.agents.archive(id, ctx.user.id);
	}

	@Mutation({
		input: agentIdInput,
		output: agentRestoreOutput,
		meta: restMeta("POST", "/agents/{id}/restore", ["Agents"]),
	})
	async restore(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.agents.restore(id, ctx.user.id);
	}

	@Mutation({
		input: agentIdInput,
		output: agentRemoveOutput,
		meta: restMeta("DELETE", "/agents/{id}", ["Agents"]),
	})
	async remove(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.agents.remove(id, ctx.user.id);
	}

	@Mutation({
		input: agentRunNowInput,
		output: agentRunNowOutput,
		meta: restMeta("POST", "/agents/{id}/run", ["Agents"]),
	})
	async runNow(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentRunNowInput>,
	) {
		return this.runs.runNow(input, ctx.user.id);
	}

	@Mutation({
		input: agentRetryRunInput,
		output: agentRetryRunOutput,
		meta: restMeta("POST", "/agents/{id}/runs/{runId}/retry", ["Agents"]),
	})
	async retryRun(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentRetryRunInput>,
	) {
		return this.runs.retryRun(input, ctx.user.id);
	}

	@Mutation({
		input: agentCancelRunInput,
		output: agentCancelRunOutput,
		meta: restMeta("POST", "/agents/{id}/runs/{runId}/cancel", ["Agents"]),
	})
	async cancelRun(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentCancelRunInput>,
	) {
		return this.runs.cancelRun(input, ctx.user.id);
	}
}
