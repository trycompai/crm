import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type { Request } from "express";
import type { ContextOptions, TRPCContext } from "nestjs-trpc";
import { RequestPrincipalError } from "../auth/request-principal";
import { RequestPrincipalService } from "../auth/request-principal.service";
import type { BaseTrpcContext } from "./context.types";

export async function createBaseTrpcContext(
	req: Request | undefined,
	principals: RequestPrincipalService,
): Promise<BaseTrpcContext> {
	try {
		const principal = req ? await principals.resolve(req) : null;
		return { req, principal, session: principal?.session ?? null };
	} catch (error) {
		if (!(error instanceof RequestPrincipalError)) throw error;
		if (error.challenge)
			req?.res?.setHeader("WWW-Authenticate", error.challenge);
		throw new TRPCError({
			code:
				error.status === 400
					? "BAD_REQUEST"
					: error.status === 403
						? "FORBIDDEN"
						: "UNAUTHORIZED",
			message: error.message,
		});
	}
}

@Injectable()
export class TrpcContext implements TRPCContext {
	constructor(private readonly principals: RequestPrincipalService) {}

	async create(opts: ContextOptions): Promise<BaseTrpcContext> {
		const req = "req" in opts ? opts.req : undefined;
		return createBaseTrpcContext(req, this.principals);
	}
}
