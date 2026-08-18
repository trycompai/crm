import { Inject } from "@nestjs/common";
import { Query, Router, UseMiddlewares } from "nestjs-trpc";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { EnrichmentService } from "./enrichment.service";

@Router({ alias: "enrichment" })
@UseMiddlewares(AuthMiddleware)
export class EnrichmentRouter {
	constructor(
		@Inject(EnrichmentService) private readonly enrichment: EnrichmentService,
	) {}

	@Query()
	async queue() {
		return this.enrichment.queue();
	}
}
