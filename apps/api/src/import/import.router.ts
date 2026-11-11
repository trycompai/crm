import { Inject } from "@nestjs/common";
import { Input, Mutation, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	importCommitOutput,
	importPreviewOutput,
	importRequestInput,
} from "./import.contracts";
import { ImportService } from "./import.service";

@Router({ alias: "import" })
@UseMiddlewares(AuthMiddleware)
export class ImportRouter {
	constructor(
		@Inject(ImportService) private readonly importer: ImportService,
	) {}

	@Mutation({
		input: importRequestInput,
		output: importPreviewOutput,
		meta: restMeta("POST", "/import/preview", ["Import"]),
	})
	async preview(@Input() input: z.infer<typeof importRequestInput>) {
		return this.importer.preview(input);
	}

	@Mutation({
		input: importRequestInput,
		output: importCommitOutput,
		meta: restMeta("POST", "/import/commit", ["Import"]),
	})
	async commit(@Input() input: z.infer<typeof importRequestInput>) {
		return this.importer.commit(input);
	}
}
