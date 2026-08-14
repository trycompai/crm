import { apiError } from "@crm/telemetry";
import {
	type ArgumentsHost,
	Catch,
	type ExceptionFilter,
	HttpException,
	HttpStatus,
	Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { getRequestContext } from "./request-context";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
	private readonly logger = new Logger("ExceptionsHandler");

	catch(exception: unknown, host: ArgumentsHost): void {
		if (host.getType() !== "http") {
			throw exception;
		}

		const http = host.switchToHttp();
		const request = http.getRequest<Request>();
		const response = http.getResponse<Response>();

		const status =
			exception instanceof HttpException
				? exception.getStatus()
				: HttpStatus.INTERNAL_SERVER_ERROR;
		const requestId = getRequestContext()?.requestId;

		this.log(exception, status, request);

		if (response.headersSent) {
			return;
		}

		response.status(status).json(body(exception, status, requestId));
	}

	private log(exception: unknown, status: number, request: Request): void {
		const payload = {
			message: describe(exception),
			method: request.method,
			path: request.originalUrl,
			statusCode: status,
			exception: exception?.constructor?.name,
		};

		if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
			this.logger.error(
				payload,
				exception instanceof Error ? exception.stack : undefined,
			);

			apiError({ error: exception, route: routePattern(request), status });
			return;
		}

		this.logger.debug(payload);
	}
}

function routePattern(request: Request): string | null {
	const route = (request as { route?: { path?: unknown } }).route;
	return typeof route?.path === "string" ? route.path : null;
}

function describe(exception: unknown): string {
	if (exception instanceof Error) {
		return exception.message;
	}

	return typeof exception === "string" ? exception : "Unknown exception";
}

interface ErrorBody {
	statusCode?: number;
	message?: unknown;
	requestId?: string;
	[field: string]: unknown;
}

function body(
	exception: unknown,
	status: number,
	requestId: string | undefined,
): ErrorBody {
	const reported = exceptionBody(exception, status);

	return requestId ? { ...reported, requestId } : reported;
}

function exceptionBody(exception: unknown, status: number): ErrorBody {
	if (!(exception instanceof HttpException)) {
		return { statusCode: status, message: "Internal server error" };
	}

	const original = exception.getResponse();

	return typeof original === "string"
		? { statusCode: status, message: original }
		: { ...original };
}
