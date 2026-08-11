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
	activityCreateInput,
	completeInput,
	granolaNotesInput,
	myTasksInput,
	timelineCountsInput,
	timelineInput,
} from "./activities.contracts";
import { ActivitiesService } from "./activities.service";

@Router({ alias: "activities" })
@UseMiddlewares(AuthMiddleware)
export class ActivitiesRouter {
	constructor(
		@Inject(ActivitiesService) private readonly activities: ActivitiesService,
	) {}

	@Query({ input: timelineInput })
	async timeline(@Input() input: z.infer<typeof timelineInput>) {
		return this.activities.timeline(input);
	}

	@Query({ input: timelineCountsInput })
	async timelineCounts(@Input() input: z.infer<typeof timelineCountsInput>) {
		return this.activities.timelineCounts(input);
	}

	@Query({ input: myTasksInput })
	async myTasks(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof myTasksInput>,
	) {
		return this.activities.myTasks(input, ctx.user.id);
	}

	@Query({ input: granolaNotesInput })
	async granolaNotes(@Input() input: z.infer<typeof granolaNotesInput>) {
		return this.activities.granolaNotes(input.activityId);
	}

	@Mutation({ input: activityCreateInput })
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof activityCreateInput>,
	) {
		return this.activities.create(input, ctx.user.id);
	}

	@Mutation({ input: completeInput })
	async complete(@Input() input: z.infer<typeof completeInput>) {
		return this.activities.complete(input.id, input.completed);
	}
}
