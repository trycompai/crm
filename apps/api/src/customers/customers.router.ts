import { Inject } from "@nestjs/common";
import { Input, Query, Router, UseMiddlewares } from "nestjs-trpc";
import type { z } from "zod";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { customerIdInput, customerListInput } from "./customers.contracts";
import { CustomersService } from "./customers.service";

@Router({ alias: "customers" })
@UseMiddlewares(AuthMiddleware)
export class CustomersRouter {
	constructor(
		@Inject(CustomersService) private readonly customers: CustomersService,
	) {}

	@Query({ input: customerListInput })
	async list(@Input() input: z.infer<typeof customerListInput>) {
		return this.customers.list(input);
	}

	@Query({ input: customerIdInput })
	async byId(@Input("id") id: string) {
		return this.customers.byId(id);
	}
}
