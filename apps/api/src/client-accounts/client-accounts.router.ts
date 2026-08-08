import { Inject } from "@nestjs/common";
import { Input, Mutation, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	clientAccountCreateInput,
	clientAccountIdInput,
	clientAccountListInput,
	clientAccountUpdateArgs,
} from "./client-accounts.contracts";
import { ClientAccountsService } from "./client-accounts.service";

@Router({ alias: "clientAccounts" })
@UseMiddlewares(AuthMiddleware)
export class ClientAccountsRouter {
	constructor(
		@Inject(ClientAccountsService)
		private readonly clients: ClientAccountsService,
	) {}

	@Query({ input: clientAccountListInput })
	async list(@Input() input: z.infer<typeof clientAccountListInput>) {
		return this.clients.list(input);
	}

	@Query({ input: clientAccountIdInput })
	async byId(@Input("id") id: string) {
		return this.clients.byId(id);
	}

	@Query()
	async options() {
		return this.clients.options();
	}

	@Mutation({ input: clientAccountCreateInput })
	async create(@Input() input: z.infer<typeof clientAccountCreateInput>) {
		return this.clients.create(input);
	}

	@Mutation({ input: clientAccountUpdateArgs })
	async update(@Input() input: z.infer<typeof clientAccountUpdateArgs>) {
		return this.clients.update(input.id, input.data);
	}

	@Mutation({ input: clientAccountIdInput })
	async delete(@Input("id") id: string) {
		return this.clients.delete(id);
	}
}
