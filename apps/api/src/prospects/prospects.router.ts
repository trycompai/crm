import { Inject } from "@nestjs/common";
import { Input, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	prospectDraftInput,
	prospectGapInput,
	prospectIdInput,
	prospectIdsInput,
	prospectListInput,
} from "./prospects.contracts";
import { ProspectsService } from "./prospects.service";

@Router({ alias: "prospects" })
@UseMiddlewares(AuthMiddleware)
export class ProspectsRouter {
	constructor(
		@Inject(ProspectsService) private readonly prospects: ProspectsService,
	) {}

	@Query({ input: prospectListInput })
	async list(@Input() input: z.infer<typeof prospectListInput>) {
		return this.prospects.list(input);
	}

	@Query({ input: prospectIdInput })
	async byId(@Input("id") id: string) {
		return this.prospects.byId(id);
	}

	@Mutation({ input: prospectIdInput })
	async research(@Input("id") id: string) {
		return this.prospects.research([id]);
	}

	@Mutation({ input: prospectIdsInput })
	async researchMany(@Input("ids") ids: string[]) {
		return this.prospects.research(ids);
	}

	@Mutation({ input: prospectGapInput })
	async researchGaps(@Input("limit") limit: number) {
		return this.prospects.researchGaps(limit);
	}

	@Mutation({ input: prospectDraftInput })
	async updateDraft(@Input() input: z.infer<typeof prospectDraftInput>) {
		return this.prospects.updateDraft(input);
	}

	@Mutation({ input: prospectIdInput })
	async deleteDraft(@Input("id") id: string) {
		return this.prospects.deleteDraft(id);
	}
}
