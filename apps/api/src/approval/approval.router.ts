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
	approvalIdInput,
	approvalListInput,
	approvalMutationInput,
} from "./approval.contracts";
import { ApprovalService } from "./approval.service";

@Router({ alias: "approval" })
@UseMiddlewares(AuthMiddleware)
export class ApprovalRouter {
	constructor(private readonly approvals: ApprovalService) {}

	@Query({ input: approvalListInput })
	async list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof approvalListInput>,
	) {
		return this.approvals.list(input, ctx.user.id);
	}

	@Query({ input: approvalIdInput })
	async detail(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.approvals.detail(id, ctx.user.id);
	}

	@Mutation({ input: approvalMutationInput })
	async approve(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof approvalMutationInput>,
	) {
		return this.approvals.approve(input, ctx.user.id);
	}

	@Mutation({ input: approvalMutationInput })
	async reject(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof approvalMutationInput>,
	) {
		return this.approvals.reject(input, ctx.user.id);
	}

	@Mutation({ input: approvalMutationInput })
	async invalidate(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof approvalMutationInput>,
	) {
		return this.approvals.invalidate(input, ctx.user.id);
	}
}
