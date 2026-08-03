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
import {
	complianceSnapshotInput,
	outreachMessageIdInput,
	productUpdateInput,
	prospectDecisionInput,
	prospectDraftInput,
	prospectIdInput,
	prospectListInput,
} from "./prospecting.contracts";
import { ProspectingService } from "./prospecting.service";

@Router({ alias: "prospecting" })
@UseMiddlewares(AuthMiddleware)
export class ProspectingRouter {
	constructor(
		@Inject(ProspectingService)
		private readonly prospecting: ProspectingService,
	) {}

	@Query()
	products() {
		return this.prospecting.products();
	}

	@Query({ input: prospectListInput })
	list(@Input() input: z.infer<typeof prospectListInput>) {
		return this.prospecting.list(input);
	}

	@Query({ input: prospectIdInput })
	byId(@Input("id") id: string) {
		return this.prospecting.byId(id);
	}

	@Mutation({ input: prospectIdInput })
	approve(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.prospecting.approveCandidate(id, ctx.user.id);
	}

	@Mutation({ input: prospectDecisionInput })
	reject(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof prospectDecisionInput>,
	) {
		return this.prospecting.rejectCandidate(
			input.id,
			input.reason,
			ctx.user.id,
		);
	}

	@Mutation({ input: prospectDecisionInput })
	suppress(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof prospectDecisionInput>,
	) {
		return this.prospecting.suppressCandidate(
			input.id,
			input.reason,
			ctx.user.id,
		);
	}

	@Mutation({ input: prospectDraftInput })
	saveDraft(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof prospectDraftInput>,
	) {
		return this.prospecting.saveDraft(input, ctx.user.id);
	}

	@Mutation({ input: outreachMessageIdInput })
	approveMessage(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.prospecting.approveMessage(id, ctx.user.id);
	}

	@Mutation({ input: outreachMessageIdInput })
	sendApproved(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.prospecting.sendApproved(id, ctx.user.id);
	}

	@Mutation({ input: productUpdateInput })
	updateProduct(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof productUpdateInput>,
	) {
		return this.prospecting.updateProduct(input, ctx.user.id);
	}

	@Mutation({ input: complianceSnapshotInput })
	importPortugueseDgc(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof complianceSnapshotInput>,
	) {
		return this.prospecting.importPortugueseDgc(input, ctx.user.id);
	}

	@Mutation({ input: prospectIdInput })
	convert(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.prospecting.convert(id, ctx.user.id);
	}
}
