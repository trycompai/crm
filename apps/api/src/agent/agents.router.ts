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
import { AgentDefinitionsService } from "./agent-definitions.service";
import { AgentRunsService } from "./agent-runs.service";
import {
	agentCancelRunInput,
	agentDeployInput,
	agentHistoryInput,
	agentIdInput,
	agentRetryRunInput,
	agentReviseInput,
	agentRunNowInput,
	agentSaveFileInput,
	agentUpdateInput,
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

	@Query()
	async list(@Ctx() ctx: AuthedTrpcContext) {
		return this.agents.list(ctx.user.id);
	}

	@Mutation({ input: agentReviseInput })
	async revise(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentReviseInput>,
	) {
		return this.agents.revise(input, ctx.user.id);
	}

	@Query({ input: agentIdInput })
	async files(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.agents.files(id, ctx.user.id);
	}

	@Mutation({ input: agentSaveFileInput })
	async saveFile(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentSaveFileInput>,
	) {
		return this.agents.saveFile(input, ctx.user.id);
	}

	@Query({ input: agentIdInput })
	async byId(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.agents.byId(id, ctx.user.id);
	}

	@Query({ input: agentHistoryInput })
	async history(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentHistoryInput>,
	) {
		return this.runs.list(input.id, input.limit, ctx.user.id);
	}

	@Query({ input: agentHistoryInput })
	async activity(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentHistoryInput>,
	) {
		return this.runs.activity(input.id, input.limit, ctx.user.id);
	}

	@Mutation({ input: agentUpdateInput })
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentUpdateInput>,
	) {
		return this.agents.update(input, ctx.user.id);
	}

	@Mutation({ input: agentDeployInput })
	async deploy(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentDeployInput>,
	) {
		return this.agents.deploy(input, ctx.user.id);
	}

	@Mutation({ input: agentIdInput })
	async pause(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.agents.pause(id, ctx.user.id);
	}

	@Mutation({ input: agentIdInput })
	async resume(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.agents.resume(id, ctx.user.id);
	}

	@Mutation({ input: agentIdInput })
	async archive(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.agents.archive(id, ctx.user.id);
	}

	@Mutation({ input: agentIdInput })
	async restore(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.agents.restore(id, ctx.user.id);
	}

	@Mutation({ input: agentIdInput })
	async remove(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.agents.remove(id, ctx.user.id);
	}

	@Mutation({ input: agentRunNowInput })
	async runNow(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentRunNowInput>,
	) {
		return this.runs.runNow(input, ctx.user.id);
	}

	@Mutation({ input: agentRetryRunInput })
	async retryRun(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentRetryRunInput>,
	) {
		return this.runs.retryRun(input, ctx.user.id);
	}

	@Mutation({ input: agentCancelRunInput })
	async cancelRun(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof agentCancelRunInput>,
	) {
		return this.runs.cancelRun(input, ctx.user.id);
	}
}
