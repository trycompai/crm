import { auth } from "@crm/auth";
import { Injectable } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import type { ContextOptions, TRPCContext } from "nestjs-trpc";
import type { BaseTrpcContext } from "./context.types";

export async function createBaseTrpcContext(
	req: Request | undefined,
): Promise<BaseTrpcContext> {
	const session = req
		? await auth.api
				.getSession({ headers: fromNodeHeaders(req.headers) })
				.catch(() => null)
		: null;
	return { req, session };
}

@Injectable()
export class TrpcContext implements TRPCContext {
	async create(opts: ContextOptions): Promise<BaseTrpcContext> {
		const req = "req" in opts ? opts.req : undefined;
		return createBaseTrpcContext(req);
	}
}
