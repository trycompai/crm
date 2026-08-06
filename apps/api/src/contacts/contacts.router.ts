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
	contactBulkCompanyInput,
	contactBulkInput,
	contactBulkOwnerInput,
	contactCreateInput,
	contactIdInput,
	contactListInput,
	contactUpdateArgs,
	factDecisionInput,
} from "./contacts.contracts";
import { ContactsService } from "./contacts.service";

@Router({ alias: "contacts" })
@UseMiddlewares(AuthMiddleware)
export class ContactsRouter {
	constructor(
		@Inject(ContactsService) private readonly contacts: ContactsService,
	) {}

	@Query({ input: contactListInput })
	async list(@Input() input: z.infer<typeof contactListInput>) {
		return this.contacts.list(input);
	}

	@Query({ input: contactIdInput })
	async byId(@Input("id") id: string) {
		return this.contacts.byId(id);
	}

	@Mutation({ input: contactCreateInput })
	async create(@Input() input: z.infer<typeof contactCreateInput>) {
		return this.contacts.create(input);
	}

	@Mutation({ input: contactUpdateArgs })
	async update(@Input() input: z.infer<typeof contactUpdateArgs>) {
		return this.contacts.update(input.id, input.data);
	}

	@Mutation({ input: contactIdInput })
	async delete(@Input("id") id: string) {
		return this.contacts.delete(id);
	}

	@Mutation({ input: contactIdInput })
	async enrich(@Input("id") id: string) {
		return this.contacts.enrich(id);
	}

	@Mutation({ input: contactBulkOwnerInput })
	async bulkAssignOwner(@Input() input: z.infer<typeof contactBulkOwnerInput>) {
		return this.contacts.bulkAssignOwner(input);
	}

	@Mutation({ input: contactBulkCompanyInput })
	async bulkSetCompany(
		@Input() input: z.infer<typeof contactBulkCompanyInput>,
	) {
		return this.contacts.bulkSetCompany(input);
	}

	@Mutation({ input: contactBulkInput })
	async bulkEnrich(@Input("ids") ids: string[]) {
		return this.contacts.bulkEnrich(ids);
	}

	@Mutation({ input: contactBulkInput })
	async bulkDelete(@Input("ids") ids: string[]) {
		return this.contacts.bulkDelete(ids);
	}

	@Mutation({ input: factDecisionInput })
	async decideFact(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof factDecisionInput>,
	) {
		return this.contacts.decideFact(input, ctx.user.id);
	}
}
