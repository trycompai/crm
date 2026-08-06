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
	companyBulkInput,
	companyBulkOwnerInput,
	companyCreateInput,
	companyIdInput,
	companyListInput,
	companyOptionsInput,
	companyUpdateArgs,
	setPrimaryContactInput,
} from "./companies.contracts";
import { CompaniesService } from "./companies.service";

@Router({ alias: "companies" })
@UseMiddlewares(AuthMiddleware)
export class CompaniesRouter {
	constructor(
		@Inject(CompaniesService) private readonly companies: CompaniesService,
	) {}

	@Query({ input: companyListInput })
	async list(@Input() input: z.infer<typeof companyListInput>) {
		return this.companies.list(input);
	}

	@Query({ input: companyIdInput })
	async byId(@Input("id") id: string) {
		return this.companies.byId(id);
	}

	@Query({ input: companyOptionsInput })
	async options(@Input("q") q: string) {
		return this.companies.options(q);
	}

	@Mutation({ input: companyCreateInput })
	async create(@Input() input: z.infer<typeof companyCreateInput>) {
		return this.companies.create(input);
	}

	@Mutation({ input: companyUpdateArgs })
	async update(@Input() input: z.infer<typeof companyUpdateArgs>) {
		return this.companies.update(input.id, input.data);
	}

	@Mutation({ input: companyIdInput })
	async delete(@Input("id") id: string) {
		return this.companies.delete(id);
	}

	@Mutation({ input: companyBulkOwnerInput })
	async bulkAssignOwner(@Input() input: z.infer<typeof companyBulkOwnerInput>) {
		return this.companies.bulkAssignOwner(input);
	}

	@Mutation({ input: companyBulkInput })
	async bulkEnrich(@Input("ids") ids: string[]) {
		return this.companies.bulkEnrich(ids);
	}

	@Mutation({ input: companyBulkInput })
	async bulkDelete(@Input("ids") ids: string[]) {
		return this.companies.bulkDelete(ids);
	}

	@Mutation({ input: companyIdInput })
	async enrich(@Input("id") id: string) {
		return this.companies.enrich(id);
	}

	@Mutation({ input: companyIdInput })
	async research(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.companies.research(id, ctx.user.id);
	}

	@Mutation({ input: setPrimaryContactInput })
	async setPrimaryContact(
		@Input() input: z.infer<typeof setPrimaryContactInput>,
	) {
		return this.companies.setPrimaryContact(input.companyId, input.contactId);
	}
}
