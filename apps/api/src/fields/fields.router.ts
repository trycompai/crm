import { Inject } from "@nestjs/common";
import { Input, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	fieldBackfillOutput,
	fieldByKeyInput,
	fieldCoverageOutput,
	fieldCreateInput,
	fieldDeleteOutput,
	fieldEntityInput,
	fieldFiltersOutput,
	fieldIdInput,
	fieldListInput,
	fieldListOutput,
	fieldReorderInput,
	fieldReorderOutput,
	fieldUpdateArgs,
	serializedFieldOutput,
} from "./fields.contracts";
import { FieldsService } from "./fields.service";

@Router({ alias: "fields" })
@UseMiddlewares(AuthMiddleware)
export class FieldsRouter {
	constructor(@Inject(FieldsService) private readonly fields: FieldsService) {}

	@Query({
		input: fieldListInput,
		output: fieldListOutput,
		meta: restMeta("GET", "/fields", ["Fields"]),
	})
	async list(@Input() input: z.infer<typeof fieldListInput>) {
		return this.fields.list(input.entity, input.includeArchived);
	}

	@Query({
		input: fieldByKeyInput,
		output: serializedFieldOutput,
		meta: restMeta("GET", "/fields/{entity}/{key}", ["Fields"]),
	})
	async byKey(@Input() input: z.infer<typeof fieldByKeyInput>) {
		return this.fields.byKey(input.entity, input.key);
	}

	@Query({
		input: fieldEntityInput,
		output: fieldFiltersOutput,
		meta: restMeta("GET", "/fields/{entity}/filterable", ["Fields"]),
	})
	async filters(@Input() input: z.infer<typeof fieldEntityInput>) {
		return this.fields.filters(input.entity);
	}

	@Query({
		input: fieldIdInput,
		output: fieldCoverageOutput,
		meta: restMeta("GET", "/fields/{id}/coverage", ["Fields"]),
	})
	async coverage(@Input("id") id: string) {
		return this.fields.coverage(id);
	}

	@Mutation({
		input: fieldCreateInput,
		output: serializedFieldOutput,
		meta: restMeta("POST", "/fields", ["Fields"]),
	})
	async create(@Input() input: z.infer<typeof fieldCreateInput>) {
		return this.fields.create(input);
	}

	@Mutation({
		input: fieldUpdateArgs,
		output: serializedFieldOutput,
		meta: restMeta("PATCH", "/fields/{id}", ["Fields"]),
	})
	async update(@Input() input: z.infer<typeof fieldUpdateArgs>) {
		return this.fields.update(input.id, input.data);
	}

	@Mutation({
		input: fieldReorderInput,
		output: fieldReorderOutput,
		meta: restMeta("POST", "/fields/reorder", ["Fields"]),
	})
	async reorder(@Input() input: z.infer<typeof fieldReorderInput>) {
		return this.fields.reorder(input);
	}

	@Mutation({
		input: fieldIdInput,
		output: serializedFieldOutput,
		meta: restMeta("POST", "/fields/{id}/archive", ["Fields"]),
	})
	async archive(@Input("id") id: string) {
		return this.fields.archive(id);
	}

	@Mutation({
		input: fieldIdInput,
		output: serializedFieldOutput,
		meta: restMeta("POST", "/fields/{id}/restore", ["Fields"]),
	})
	async restore(@Input("id") id: string) {
		return this.fields.restore(id);
	}

	@Mutation({
		input: fieldIdInput,
		output: fieldDeleteOutput,
		meta: restMeta("DELETE", "/fields/{id}", ["Fields"]),
	})
	async delete(@Input("id") id: string) {
		return this.fields.delete(id);
	}

	@Mutation({
		input: fieldIdInput,
		output: fieldBackfillOutput,
		meta: restMeta("POST", "/fields/{id}/backfill", ["Fields"]),
	})
	async backfill(@Input("id") id: string) {
		return this.fields.backfill(id);
	}
}
