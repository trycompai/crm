import { Inject } from "@nestjs/common";
import { Input, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	formCreateInput,
	formIdInput,
	formListInput,
	formSubmissionListInput,
	formUpdateArgs,
} from "./forms.contracts";
import { FormsService } from "./forms.service";

@Router({ alias: "forms" })
@UseMiddlewares(AuthMiddleware)
export class FormsRouter {
	constructor(@Inject(FormsService) private readonly forms: FormsService) {}

	@Query({ input: formListInput })
	async list(@Input() input: z.infer<typeof formListInput>) {
		return this.forms.list(input);
	}

	@Query({ input: formIdInput })
	async byId(@Input("id") id: string) {
		return this.forms.byId(id);
	}

	@Mutation({ input: formCreateInput })
	async create(@Input() input: z.infer<typeof formCreateInput>) {
		return this.forms.create(input);
	}

	@Mutation({ input: formUpdateArgs })
	async update(@Input() input: z.infer<typeof formUpdateArgs>) {
		return this.forms.update(input.id, input.data);
	}

	@Mutation({ input: formIdInput })
	async delete(@Input("id") id: string) {
		return this.forms.delete(id);
	}

	@Query({ input: formSubmissionListInput })
	async submissions(@Input() input: z.infer<typeof formSubmissionListInput>) {
		return this.forms.submissions(input.formId, input.page, input.pageSize);
	}
}
