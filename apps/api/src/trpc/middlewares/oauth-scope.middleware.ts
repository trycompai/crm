import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type {
	MiddlewareOptions,
	MiddlewareResponse,
	TRPCMiddleware,
} from "nestjs-trpc";
import type { BaseTrpcContext } from "../context.types";

@Injectable()
export class OAuthScopeMiddleware implements TRPCMiddleware {
	async use(opts: MiddlewareOptions): Promise<MiddlewareResponse> {
		const ctx = opts.ctx as BaseTrpcContext;
		const principal = ctx.principal;
		if (principal?.credentialKind !== "oauth") return opts.next();

		const requiredScope = opts.type === "mutation" ? "crm.write" : "crm.read";
		if (!principal.scopes.has(requiredScope)) {
			ctx.req?.res?.setHeader(
				"WWW-Authenticate",
				`Bearer realm="compcrm", error="insufficient_scope", scope="${requiredScope}"`,
			);
			throw new TRPCError({
				code: "FORBIDDEN",
				message: `The token requires ${requiredScope}.`,
			});
		}

		return opts.next();
	}
}
