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
import {
	workAssignInput,
	workIdInput,
	workListInput,
	workMutationInput,
	workReasonInput,
	workWaitInput,
} from "./work.contracts";
import { WorkService } from "./work.service";

@Router({ alias: "work" })
@UseMiddlewares(AuthMiddleware)
export class WorkRouter {
	constructor(private readonly work: WorkService) {}

	@Query({ input: workListInput })
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof workListInput>,
	) {
		return this.work.list(input, ctx.user.id);
	}

	@Query({ input: workIdInput })
	async detail(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.work.detail(id, ctx.user.id);
	}

	@Mutation({ input: workMutationInput })
	async claim(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof workMutationInput>,
	) {
		return this.work.claim(input, ctx.user.id);
	}

	@Mutation({ input: workAssignInput })
	async assign(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof workAssignInput>,
	) {
		return this.work.assign(input, ctx.user.id);
	}

	@Mutation({ input: workMutationInput })
	async start(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof workMutationInput>,
	) {
		return this.work.start(input, ctx.user.id);
	}

	@Mutation({ input: workWaitInput })
	async wait(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof workWaitInput>,
	) {
		return this.work.wait(input, ctx.user.id);
	}

	@Mutation({ input: workReasonInput })
	async block(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof workReasonInput>,
	) {
		return this.work.block(input, ctx.user.id);
	}

	@Mutation({ input: workMutationInput })
	async complete(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof workMutationInput>,
	) {
		return this.work.complete(input, ctx.user.id);
	}

	@Mutation({ input: workReasonInput })
	async dismiss(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof workReasonInput>,
	) {
		return this.work.dismiss(input, ctx.user.id);
	}
}
