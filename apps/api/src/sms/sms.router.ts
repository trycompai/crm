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
	smsMarkReadInput,
	smsSendInput,
	smsThreadIdInput,
	smsThreadListInput,
} from "./sms.contracts";
import { SmsService } from "./sms.service";

@Router({ alias: "sms" })
@UseMiddlewares(AuthMiddleware)
export class SmsRouter {
	constructor(@Inject(SmsService) private readonly sms: SmsService) {}

	@Query({ input: smsThreadListInput })
	async list(@Input() input: z.infer<typeof smsThreadListInput>) {
		return this.sms.list(input);
	}

	@Query({ input: smsThreadIdInput })
	async thread(@Input("id") id: string) {
		return this.sms.thread(id);
	}

	@Mutation({ input: smsSendInput })
	async send(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof smsSendInput>,
	) {
		return this.sms.send(input, ctx.user.id);
	}

	@Mutation({ input: smsMarkReadInput })
	async markRead(@Input("threadId") threadId: string) {
		return this.sms.markRead(threadId);
	}
}
