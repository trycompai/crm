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
	dealAttachContactInput,
	dealBulkInput,
	dealBulkOwnerInput,
	dealBulkStageInput,
	dealContactRoleInput,
	dealContactsInput,
	dealCreateInput,
	dealDetachContactInput,
	dealIdInput,
	dealListInput,
	dealUpdateArgs,
	setStageInput,
} from "./deals.contracts";
import { DealsService } from "./deals.service";

@Router({ alias: "deals" })
@UseMiddlewares(AuthMiddleware)
export class DealsRouter {
	constructor(@Inject(DealsService) private readonly deals: DealsService) {}

	@Query({ input: dealListInput })
	async list(@Input() input: z.infer<typeof dealListInput>) {
		return this.deals.list(input);
	}

	@Query({ input: dealIdInput })
	async byId(@Input("id") id: string) {
		return this.deals.byId(id);
	}

	@Mutation({ input: dealCreateInput })
	async create(@Input() input: z.infer<typeof dealCreateInput>) {
		return this.deals.create(input);
	}

	@Mutation({ input: dealUpdateArgs })
	async update(@Input() input: z.infer<typeof dealUpdateArgs>) {
		return this.deals.update(input.id, input.data);
	}

	@Mutation({ input: dealIdInput })
	async delete(@Input("id") id: string) {
		return this.deals.delete(id);
	}

	@Mutation({ input: setStageInput })
	async setStage(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setStageInput>,
	) {
		return this.deals.setStage(input, ctx.user.id);
	}

	@Query({ input: dealContactsInput })
	async contactOptions(@Input("dealId") dealId: string) {
		return this.deals.contactOptions(dealId);
	}

	@Mutation({ input: dealAttachContactInput })
	async attachContact(@Input() input: z.infer<typeof dealAttachContactInput>) {
		return this.deals.attachContact(input);
	}

	@Mutation({ input: dealDetachContactInput })
	async detachContact(@Input() input: z.infer<typeof dealDetachContactInput>) {
		return this.deals.detachContact(input);
	}

	@Mutation({ input: dealContactRoleInput })
	async setContactRole(@Input() input: z.infer<typeof dealContactRoleInput>) {
		return this.deals.setContactRole(input);
	}

	@Mutation({ input: dealBulkOwnerInput })
	async bulkAssignOwner(@Input() input: z.infer<typeof dealBulkOwnerInput>) {
		return this.deals.bulkAssignOwner(input);
	}

	@Mutation({ input: dealBulkStageInput })
	async bulkSetStage(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof dealBulkStageInput>,
	) {
		return this.deals.bulkSetStage(input, ctx.user.id);
	}

	@Mutation({ input: dealBulkInput })
	async bulkDelete(@Input("ids") ids: string[]) {
		return this.deals.bulkDelete(ids);
	}
}
