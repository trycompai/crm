import { Inject } from "@nestjs/common";
import { Input, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	fieldByKeyInput,
	fieldCreateInput,
	fieldIdInput,
	fieldListInput,
	fieldReorderInput,
	fieldUpdateArgs,
} from "./fields.contracts";
import { FieldsService } from "./fields.service";

@Router({ alias: "fields" })
@UseMiddlewares(AuthMiddleware)
export class FieldsRouter {
	constructor(@Inject(FieldsService) private readonly fields: FieldsService) {}

	@Query({ input: fieldListInput })
	async list(@Input() input: z.infer<typeof fieldListInput>) {
		return this.fields.list(input.entity, input.includeArchived);
	}

	@Query({ input: fieldByKeyInput })
	async byKey(@Input() input: z.infer<typeof fieldByKeyInput>) {
		return this.fields.byKey(input.entity, input.key);
	}

	@Query({ input: fieldIdInput })
	async coverage(@Input("id") id: string) {
		return this.fields.coverage(id);
	}

	@Mutation({ input: fieldCreateInput })
	async create(@Input() input: z.infer<typeof fieldCreateInput>) {
		return this.fields.create(input);
	}

	@Mutation({ input: fieldUpdateArgs })
	async update(@Input() input: z.infer<typeof fieldUpdateArgs>) {
		return this.fields.update(input.id, input.data);
	}

	@Mutation({ input: fieldReorderInput })
	async reorder(@Input() input: z.infer<typeof fieldReorderInput>) {
		return this.fields.reorder(input);
	}

	@Mutation({ input: fieldIdInput })
	async archive(@Input("id") id: string) {
		return this.fields.archive(id);
	}

	@Mutation({ input: fieldIdInput })
	async restore(@Input("id") id: string) {
		return this.fields.restore(id);
	}

	@Mutation({ input: fieldIdInput })
	async delete(@Input("id") id: string) {
		return this.fields.delete(id);
	}

	@Mutation({ input: fieldIdInput })
	async backfill(@Input("id") id: string) {
		return this.fields.backfill(id);
	}
}
