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
import {
	companyArchiveResultOutput,
	companyBulkInput,
	companyBulkOwnerInput,
	companyBulkResultOutput,
	companyCreateInput,
	companyDetailOutput,
	companyEnrichOutput,
	companyIdInput,
	companyListInput,
	companyListOutput,
	companyOptionOutput,
	companyOptionsInput,
	companyResearchOutput,
	companySetPrimaryContactOutput,
	companySummaryOutput,
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

	@Query({
		input: companyListInput,
		output: companyListOutput,
		meta: restMeta("POST", "/companies/search", ["Companies"]),
	})
	async list(@Input() input: z.infer<typeof companyListInput>) {
		return this.companies.list(input);
	}

	@Query({
		input: companyIdInput,
		output: companyDetailOutput,
		meta: restMeta("GET", "/companies/{id}", ["Companies"]),
	})
	async byId(@Input("id") id: string) {
		return this.companies.byId(id);
	}

	@Query({
		input: companyOptionsInput,
		output: companyOptionOutput,
		meta: restMeta("GET", "/companies/options", ["Companies"]),
	})
	async options(@Input("q") q: string) {
		return this.companies.options(q);
	}

	@Mutation({
		input: companyCreateInput,
		output: companySummaryOutput,
		meta: restMeta("POST", "/companies", ["Companies"]),
	})
	async create(@Input() input: z.infer<typeof companyCreateInput>) {
		return this.companies.create(input);
	}

	@Mutation({
		input: companyUpdateArgs,
		output: companySummaryOutput,
		meta: restMeta("PATCH", "/companies/{id}", ["Companies"]),
	})
	async update(@Input() input: z.infer<typeof companyUpdateArgs>) {
		return this.companies.update(input.id, input.data);
	}

	@Mutation({
		input: companyIdInput,
		output: companyArchiveResultOutput,
		meta: restMeta("POST", "/companies/{id}/archive", ["Companies"]),
	})
	async archive(@Input("id") id: string) {
		return this.companies.archive(id);
	}

	@Mutation({
		input: companyIdInput,
		output: companyArchiveResultOutput,
		meta: restMeta("POST", "/companies/{id}/restore", ["Companies"]),
	})
	async restore(@Input("id") id: string) {
		return this.companies.restore(id);
	}

	@Mutation({
		input: companyIdInput,
		output: companyArchiveResultOutput,
		meta: restMeta("DELETE", "/companies/{id}", ["Companies"]),
	})
	async purge(@Input("id") id: string) {
		return this.companies.purge(id);
	}

	@Mutation({
		input: companyBulkOwnerInput,
		output: companyBulkResultOutput,
		meta: restMeta("POST", "/companies/bulk-assign-owner", ["Companies"]),
	})
	async bulkAssignOwner(@Input() input: z.infer<typeof companyBulkOwnerInput>) {
		return this.companies.bulkAssignOwner(input);
	}

	@Mutation({
		input: companyBulkInput,
		output: companyBulkResultOutput,
		meta: restMeta("POST", "/companies/bulk-enrich", ["Companies"]),
	})
	async bulkEnrich(@Input("ids") ids: string[]) {
		return this.companies.bulkEnrich(ids);
	}

	@Mutation({
		input: companyBulkInput,
		output: companyBulkResultOutput,
		meta: restMeta("POST", "/companies/bulk-archive", ["Companies"]),
	})
	async bulkArchive(@Input("ids") ids: string[]) {
		return this.companies.bulkArchive(ids);
	}

	@Mutation({
		input: companyBulkInput,
		output: companyBulkResultOutput,
		meta: restMeta("POST", "/companies/bulk-restore", ["Companies"]),
	})
	async bulkRestore(@Input("ids") ids: string[]) {
		return this.companies.bulkRestore(ids);
	}

	@Mutation({
		input: companyBulkInput,
		output: companyBulkResultOutput,
		meta: restMeta("POST", "/companies/bulk-purge", ["Companies"]),
	})
	async bulkPurge(@Input("ids") ids: string[]) {
		return this.companies.bulkPurge(ids);
	}

	@Mutation({
		input: companyIdInput,
		output: companyEnrichOutput,
		meta: restMeta("POST", "/companies/{id}/enrich", ["Companies"]),
	})
	async enrich(@Input("id") id: string) {
		return this.companies.enrich(id);
	}

	@Mutation({
		input: companyIdInput,
		output: companyResearchOutput,
		meta: restMeta("POST", "/companies/{id}/research", ["Companies"]),
	})
	async research(@Ctx() ctx: AuthedTrpcContext, @Input("id") id: string) {
		return this.companies.research(id, ctx.user.id);
	}

	@Mutation({
		input: setPrimaryContactInput,
		output: companySetPrimaryContactOutput,
		meta: restMeta("POST", "/companies/{companyId}/set-primary-contact", [
			"Companies",
		]),
	})
	async setPrimaryContact(
		@Input() input: z.infer<typeof setPrimaryContactInput>,
	) {
		return this.companies.setPrimaryContact(input.companyId, input.contactId);
	}
}
