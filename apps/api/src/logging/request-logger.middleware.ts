import { randomUUID } from "node:crypto";
import { Injectable, Logger, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { type RequestContext, runInRequestContext } from "./request-context";

const REQUEST_ID_HEADER = "x-request-id";

const QUIET_PATHS = new Set(["/health"]);

const TRACKING_COLLECTOR_PATH = "/api/t/e";

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
	private readonly logger = new Logger("HTTP");

	use(request: Request, response: Response, next: NextFunction): void {
		const collector = request.path === TRACKING_COLLECTOR_PATH;
		const requestId = collector
			? randomUUID()
			: (incomingRequestId(request) ?? randomUUID());
		response.setHeader(REQUEST_ID_HEADER, requestId);

		const context: RequestContext = {
			requestId,
			method: request.method,
			path: collector ? TRACKING_COLLECTOR_PATH : request.originalUrl,
		};
		const startedAt = process.hrtime.bigint();

		runInRequestContext(context, () => {
			response.on("finish", () => {
				runInRequestContext(context, () => {
					this.logCompleted(request, response, context, startedAt, collector);
				});
			});

			next();
		});
	}

	private logCompleted(
		request: Request,
		response: Response,
		context: RequestContext,
		startedAt: bigint,
		collector: boolean,
	): void {
		const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
		const { statusCode } = response;
		const roundedDurationMs = Number(durationMs.toFixed(1));

		if (collector) {
			this.logger.log({
				message: "Tracking collector request completed",
				route: TRACKING_COLLECTOR_PATH,
				statusCode,
				durationMs: roundedDurationMs,
			});
			return;
		}

		const userId = sessionUserId(request);

		if (userId) {
			context.userId = userId;
		}

		const payload = {
			message: `${context.method} ${context.path} ${statusCode} ${durationMs.toFixed(1)}ms`,
			method: context.method,
			path: context.path,
			statusCode,
			durationMs: roundedDurationMs,
			ip: request.ip,
			userAgent: request.get("user-agent"),
		};

		if (statusCode >= 500) {
			this.logger.error(payload);
			return;
		}

		if (statusCode >= 400) {
			this.logger.warn(payload);
			return;
		}

		if (QUIET_PATHS.has(request.path)) {
			this.logger.verbose(payload);
			return;
		}

		this.logger.log(payload);
	}
}

function incomingRequestId(request: Request): string | undefined {
	const header = request.get(REQUEST_ID_HEADER);

	if (!header || header.length > 200 || !/^[\w.:-]+$/.test(header)) {
		return undefined;
	}

	return header;
}

const sharedInstance = new RequestLoggerMiddleware();

export function logAuthRoute(
	request: Request,
	response: Response,
	next: NextFunction,
): void {
	sharedInstance.use(request, response, next);
}

function sessionUserId(request: Request): string | undefined {
	const { session } = request as Request & {
		session?: { user?: { id?: string } };
	};

	return session?.user?.id;
}
