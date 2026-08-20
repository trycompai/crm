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
	bulkResultOutput,
	contactBasicOutput,
	contactBulkCompanyInput,
	contactBulkInput,
	contactBulkOwnerInput,
	contactByIdOutput,
	contactCreateInput,
	contactEnrichOutput,
	contactIdInput,
	contactListInput,
	contactListOutput,
	contactNameOutput,
	contactUpdateArgs,
	decideFactOutput,
	factDecisionInput,
} from "./contacts.contracts";
import { ContactsService } from "./contacts.service";

@Router({ alias: "contacts" })
@UseMiddlewares(AuthMiddleware)
export class ContactsRouter {
	constructor(
		@Inject(ContactsService) private readonly contacts: ContactsService,
	) {}

	@Query({
		input: contactListInput,
		output: contactListOutput,
		meta: restMeta("POST", "/contacts/search", ["Contacts"]),
	})
	async list(@Input() input: z.infer<typeof contactListInput>) {
		return this.contacts.list(input);
	}

	@Query({
		input: contactIdInput,
		output: contactByIdOutput,
		meta: restMeta("GET", "/contacts/{id}", ["Contacts"]),
	})
	async byId(@Input("id") id: string) {
		return this.contacts.byId(id);
	}

	@Mutation({
		input: contactCreateInput,
		output: contactBasicOutput,
		meta: restMeta("POST", "/contacts", ["Contacts"]),
	})
	async create(@Input() input: z.infer<typeof contactCreateInput>) {
		return this.contacts.create(input);
	}

	@Mutation({
		input: contactUpdateArgs,
		output: contactBasicOutput,
		meta: restMeta("PATCH", "/contacts/{id}", ["Contacts"]),
	})
	async update(@Input() input: z.infer<typeof contactUpdateArgs>) {
		return this.contacts.update(input.id, input.data);
	}

	@Mutation({
		input: contactIdInput,
		output: contactNameOutput,
		meta: restMeta("POST", "/contacts/{id}/archive", ["Contacts"]),
	})
	async archive(@Input("id") id: string) {
		return this.contacts.archive(id);
	}

	@Mutation({
		input: contactIdInput,
		output: contactNameOutput,
		meta: restMeta("POST", "/contacts/{id}/restore", ["Contacts"]),
	})
	async restore(@Input("id") id: string) {
		return this.contacts.restore(id);
	}

	@Mutation({
		input: contactIdInput,
		output: contactNameOutput,
		meta: restMeta("DELETE", "/contacts/{id}", ["Contacts"]),
	})
	async purge(@Input("id") id: string) {
		return this.contacts.purge(id);
	}

	@Mutation({
		input: contactIdInput,
		output: contactEnrichOutput,
		meta: restMeta("POST", "/contacts/{id}/enrich", ["Contacts"]),
	})
	async enrich(@Input("id") id: string) {
		return this.contacts.enrich(id);
	}

	@Mutation({
		input: contactBulkOwnerInput,
		output: bulkResultOutput,
		meta: restMeta("POST", "/contacts/bulk-assign-owner", ["Contacts"]),
	})
	async bulkAssignOwner(@Input() input: z.infer<typeof contactBulkOwnerInput>) {
		return this.contacts.bulkAssignOwner(input);
	}

	@Mutation({
		input: contactBulkCompanyInput,
		output: bulkResultOutput,
		meta: restMeta("POST", "/contacts/bulk-set-company", ["Contacts"]),
	})
	async bulkSetCompany(
		@Input() input: z.infer<typeof contactBulkCompanyInput>,
	) {
		return this.contacts.bulkSetCompany(input);
	}

	@Mutation({
		input: contactBulkInput,
		output: bulkResultOutput,
		meta: restMeta("POST", "/contacts/bulk-enrich", ["Contacts"]),
	})
	async bulkEnrich(@Input("ids") ids: string[]) {
		return this.contacts.bulkEnrich(ids);
	}

	@Mutation({
		input: contactBulkInput,
		output: bulkResultOutput,
		meta: restMeta("POST", "/contacts/bulk-archive", ["Contacts"]),
	})
	async bulkArchive(@Input("ids") ids: string[]) {
		return this.contacts.bulkArchive(ids);
	}

	@Mutation({
		input: contactBulkInput,
		output: bulkResultOutput,
		meta: restMeta("POST", "/contacts/bulk-restore", ["Contacts"]),
	})
	async bulkRestore(@Input("ids") ids: string[]) {
		return this.contacts.bulkRestore(ids);
	}

	@Mutation({
		input: contactBulkInput,
		output: bulkResultOutput,
		meta: restMeta("POST", "/contacts/bulk-purge", ["Contacts"]),
	})
	async bulkPurge(@Input("ids") ids: string[]) {
		return this.contacts.bulkPurge(ids);
	}

	@Mutation({
		input: factDecisionInput,
		output: decideFactOutput,
		meta: restMeta("POST", "/contacts/decide-fact", ["Contacts"]),
	})
	async decideFact(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof factDecisionInput>,
	) {
		return this.contacts.decideFact(input, ctx.user.id);
	}
}
