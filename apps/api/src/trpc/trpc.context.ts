import { auth } from "@crm/auth";
import { bumpCounter, COUNTERS } from "@crm/telemetry";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { fromNodeHeaders } from "better-auth/node";
import type { Request, Response } from "express";
import type { ContextOptions, TRPCContext } from "nestjs-trpc";
import { z } from "zod";
import type { BaseTrpcContext } from "./context.types";

const betterAuthApiErrorShape = z
	.object({
		name: z.literal("APIError"),
		status: z.string(),
		message: z.string().optional(),
		body: z
			.object({
				details: z
					.object({ tryAgainIn: z.number().optional() })
					.nullable()
					.optional(),
			})
			.nullable()
			.optional(),
	})
	.nullable()
	.catch(null);

const AUTHENTICATION_FAILURE_STATUSES = new Set(["UNAUTHORIZED", "FORBIDDEN"]);

const RETRY_AFTER_HEADER = "Retry-After";

const MS_PER_SECOND = 1000;

export function retryAfterSeconds(
	tryAgainInMs: number | undefined,
): number | null {
	if (tryAgainInMs === undefined || !Number.isFinite(tryAgainInMs)) return null;

	return Math.max(0, Math.ceil(tryAgainInMs / MS_PER_SECOND));
}

export async function createBaseTrpcContext(
	req: Request | undefined,
	res?: Response,
): Promise<BaseTrpcContext> {
	if (!req) {
		return { req, session: null };
	}

	try {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});
		return { req, session };
	} catch (error) {
		const apiError = betterAuthApiErrorShape.parse(error);

		if (apiError?.status === "TOO_MANY_REQUESTS") {
			void bumpCounter(COUNTERS.apiKeyRateLimited);

			const seconds = retryAfterSeconds(apiError.body?.details?.tryAgainIn);
			if (seconds !== null) {
				res?.setHeader(RETRY_AFTER_HEADER, String(seconds));
			}

			throw new TRPCError({
				code: "TOO_MANY_REQUESTS",
				message: apiError.message ?? "Too many requests.",
			});
		}

		if (apiError && AUTHENTICATION_FAILURE_STATUSES.has(apiError.status)) {
			return { req, session: null };
		}

		throw error;
	}
}

@Injectable()
export class TrpcContext implements TRPCContext {
	async create(opts: ContextOptions): Promise<BaseTrpcContext> {
		const req = "req" in opts ? opts.req : undefined;
		const res = "res" in opts ? opts.res : undefined;
		return createBaseTrpcContext(req, res);
	}
}
