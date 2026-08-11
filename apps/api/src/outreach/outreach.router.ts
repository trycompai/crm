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
	leadDiscoveryInput,
	leadDiscoveryTaskInput,
	outreachDraftInput,
	outreachPermissionInput,
	outreachProspectInput,
	outreachProspectMutationInput,
	outreachSequenceInput,
	outreachUpdateInput,
} from "./outreach.contracts";
import { OutreachService } from "./outreach.service";

@Router({ alias: "outreach" })
@UseMiddlewares(AuthMiddleware)
export class OutreachRouter {
	constructor(private readonly outreach: OutreachService) {}

	@Query()
	async supplyStatus() {
		return this.outreach.supplyStatus();
	}

	@Mutation({ input: leadDiscoveryInput })
	async findMore(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof leadDiscoveryInput>,
	) {
		return this.outreach.findMore(input, ctx.user.id);
	}

	@Query()
	async leadDiscoveryRuns() {
		return this.outreach.leadDiscoveryRuns();
	}

	@Mutation({ input: leadDiscoveryTaskInput })
	async cancelLeadDiscovery(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof leadDiscoveryTaskInput>,
	) {
		return this.outreach.cancelLeadDiscovery(
			input.taskId,
			ctx.user.id,
			input.clientRequestId,
		);
	}

	@Mutation({ input: leadDiscoveryTaskInput })
	async retryLeadDiscovery(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof leadDiscoveryTaskInput>,
	) {
		return this.outreach.retryLeadDiscovery(
			input.taskId,
			ctx.user.id,
			input.clientRequestId,
		);
	}

	@Mutation({ input: outreachProspectMutationInput })
	async prepare(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof outreachProspectMutationInput>,
	) {
		return this.outreach.prepare(
			input.prospectId,
			ctx.user.id,
			input.clientRequestId,
		);
	}

	@Mutation({ input: outreachPermissionInput })
	async setPermission(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof outreachPermissionInput>,
	) {
		return this.outreach.setPermission(
			input.prospectId,
			input.allowed,
			ctx.user.id,
			input.clientRequestId,
		);
	}

	@Query({ input: outreachProspectInput })
	async byProspect(@Input("prospectId") prospectId: string) {
		return this.outreach.byProspect(prospectId);
	}

	@Mutation({ input: outreachUpdateInput })
	async update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof outreachUpdateInput>,
	) {
		return this.outreach.update(input.draftId, input, ctx.user.id);
	}

	@Mutation({ input: outreachSequenceInput })
	async approveSequence(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof outreachSequenceInput>,
	) {
		return this.outreach.approveSequence(
			input.sequenceId,
			ctx.user.id,
			input.clientRequestId,
		);
	}

	@Mutation({ input: outreachSequenceInput })
	async rejectSequence(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof outreachSequenceInput>,
	) {
		return this.outreach.rejectSequence(
			input.sequenceId,
			ctx.user.id,
			input.clientRequestId,
		);
	}

	@Mutation({ input: outreachDraftInput })
	async deleteDraft(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof outreachDraftInput>,
	) {
		return this.outreach.deleteDraft(
			input.draftId,
			ctx.user.id,
			input.clientRequestId,
		);
	}

	@Mutation({ input: outreachSequenceInput })
	async deleteSequence(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof outreachSequenceInput>,
	) {
		return this.outreach.deleteSequence(
			input.sequenceId,
			ctx.user.id,
			input.clientRequestId,
		);
	}

	@Query()
	async performance() {
		return this.outreach.performance();
	}

	@Query()
	async sequences() {
		return this.outreach.sequences();
	}
}
