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
	outreachDraftInput,
	outreachPermissionInput,
	outreachProspectInput,
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
	async findMore(@Input() input: z.infer<typeof leadDiscoveryInput>) {
		return this.outreach.findMore(input.count, input.countryCodes);
	}

	@Mutation({ input: outreachProspectInput })
	async prepare(@Input("prospectId") prospectId: string) {
		return this.outreach.prepare(prospectId);
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
		);
	}

	@Query({ input: outreachProspectInput })
	async byProspect(@Input("prospectId") prospectId: string) {
		return this.outreach.byProspect(prospectId);
	}

	@Mutation({ input: outreachUpdateInput })
	async update(@Input() input: z.infer<typeof outreachUpdateInput>) {
		return this.outreach.update(input.draftId, input);
	}

	@Mutation({ input: outreachSequenceInput })
	async approveSequence(
		@Ctx() ctx: AuthedTrpcContext,
		@Input("sequenceId") sequenceId: string,
	) {
		return this.outreach.approveSequence(sequenceId, ctx.user.id);
	}

	@Mutation({ input: outreachSequenceInput })
	async rejectSequence(@Input("sequenceId") sequenceId: string) {
		return this.outreach.rejectSequence(sequenceId);
	}

	@Mutation({ input: outreachDraftInput })
	async deleteDraft(@Input("draftId") draftId: string) {
		return this.outreach.deleteDraft(draftId);
	}

	@Mutation({ input: outreachSequenceInput })
	async deleteSequence(@Input("sequenceId") sequenceId: string) {
		return this.outreach.deleteSequence(sequenceId);
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
