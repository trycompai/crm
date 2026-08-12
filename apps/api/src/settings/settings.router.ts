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
import { setAgentModelInput, setResearchKeyInput } from "./settings.contracts";
import { SettingsService } from "./settings.service";

@Router({ alias: "settings" })
@UseMiddlewares(AuthMiddleware)
export class SettingsRouter {
	constructor(
		@Inject(SettingsService) private readonly settings: SettingsService,
	) {}

	@Query()
	async agentModel() {
		return this.settings.agentModel();
	}

	@Query()
	async modelCatalog() {
		return this.settings.modelCatalog();
	}

	@Query()
	async aiGatewayStatus() {
		return this.settings.aiGatewayStatus();
	}

	@Mutation({ input: setAgentModelInput })
	async setAgentModel(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setAgentModelInput>,
	) {
		return this.settings.setAgentModel(ctx.user.id, input.modelId);
	}

	@Query()
	async researchKey() {
		return this.settings.researchKey();
	}

	@Mutation({ input: setResearchKeyInput })
	async setResearchKey(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof setResearchKeyInput>,
	) {
		return this.settings.setResearchKey(ctx.user.id, input.apiKey);
	}
}
