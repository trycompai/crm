import { Inject } from "@nestjs/common";
import { Input, Query, Router, UseMiddlewares } from "nestjs-trpc";
import { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import { SearchService } from "./search.service";

const quickInput = z.object({ q: z.string().default("") });

const searchHitOutput = z.object({
	kind: z.enum(["company", "contact", "deal"]),
	id: z.string(),
	label: z.string(),
	detail: z.string().nullable(),
	iconUrl: z.string().nullable(),
	iconDarkUrl: z.string().nullable(),
	iconTone: z.string().nullable(),
	imageUrl: z.string().nullable(),
});

const quickOutput = z.object({ hits: z.array(searchHitOutput) });

@Router({ alias: "search" })
@UseMiddlewares(AuthMiddleware)
export class SearchRouter {
	constructor(@Inject(SearchService) private readonly search: SearchService) {}

	@Query({
		input: quickInput,
		output: quickOutput,
		meta: restMeta("GET", "/search", ["Search"]),
	})
	async quick(@Input("q") q: string) {
		return this.search.quick(q);
	}
}
