import { Inject } from "@nestjs/common";
import { Input, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	workflowCreateInput,
	workflowIdInput,
	workflowListInput,
	workflowRunInput,
	workflowUpdateArgs,
} from "./workflows.contracts";
import { WorkflowsService } from "./workflows.service";

@Router({ alias: "workflows" })
@UseMiddlewares(AuthMiddleware)
export class WorkflowsRouter {
	constructor(
		@Inject(WorkflowsService) private readonly workflows: WorkflowsService,
	) {}

	@Query({ input: workflowListInput })
	async list(@Input() input: z.infer<typeof workflowListInput>) {
		return this.workflows.list(input);
	}

	@Query({ input: workflowIdInput })
	async byId(@Input("id") id: string) {
		return this.workflows.byId(id);
	}

	@Mutation({ input: workflowCreateInput })
	async create(@Input() input: z.infer<typeof workflowCreateInput>) {
		return this.workflows.create(input);
	}

	@Mutation({ input: workflowUpdateArgs })
	async update(@Input() input: z.infer<typeof workflowUpdateArgs>) {
		return this.workflows.update(input.id, input.data);
	}

	@Mutation({ input: workflowIdInput })
	async delete(@Input("id") id: string) {
		return this.workflows.delete(id);
	}

	@Mutation({ input: workflowRunInput })
	async runNow(@Input() input: z.infer<typeof workflowRunInput>) {
		return this.workflows.enqueueRun(input.id, input.context);
	}
}
