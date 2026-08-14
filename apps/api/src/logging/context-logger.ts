import { inspect } from "node:util";
import {
	ConsoleLogger,
	type ConsoleLoggerOptions,
	Injectable,
	type LogLevel,
} from "@nestjs/common";
import { getRequestContext } from "./request-context";

const PRODUCTION_LEVELS: LogLevel[] = ["fatal", "error", "warn", "log"];
const DEVELOPMENT_LEVELS: LogLevel[] = [
	"fatal",
	"error",
	"warn",
	"log",
	"debug",
	"verbose",
];

function consoleLoggerOptions(): ConsoleLoggerOptions {
	const isProduction = process.env.NODE_ENV === "production";

	return {
		json: isProduction,
		colors: !isProduction,
		timestamp: !isProduction,
		logLevels: isProduction ? PRODUCTION_LEVELS : DEVELOPMENT_LEVELS,
	};
}

type StructuredMessage = { message: string } & Record<string, unknown>;

interface JsonLogRecord {
	level: LogLevel;
	pid: number;
	timestamp: number;
	message: unknown;
	context?: string;
	stack?: unknown;
	requestId?: string;
	userId?: string;
}

@Injectable()
export class ContextLogger extends ConsoleLogger {
	constructor() {
		super(consoleLoggerOptions());
	}

	protected override getJsonLogObject(
		message: unknown,
		options: {
			context: string;
			logLevel: LogLevel;
			writeStreamType?: "stdout" | "stderr";
			errorStack?: unknown;
		},
	): JsonLogRecord {
		const base = super.getJsonLogObject(message, options);
		const request = getRequestContext();

		const record: JsonLogRecord = isStructuredMessage(message)
			? { ...withoutMessage(message), ...base, message: message.message }
			: base;

		if (!request) {
			return record;
		}

		const correlated: JsonLogRecord = {
			...record,
			requestId: request.requestId,
		};

		if (!request.userId) {
			return correlated;
		}

		return { ...correlated, userId: request.userId };
	}

	protected override stringifyMessage(
		message: unknown,
		logLevel: LogLevel,
	): string {
		if (!isStructuredMessage(message)) {
			return super.stringifyMessage(message, logLevel);
		}

		const fields = withoutMessage(message);
		const text = this.colorize(message.message, logLevel);

		return Object.keys(fields).length === 0
			? text
			: `${text} ${inspect(fields, this.inspectOptions)}`;
	}

	protected override formatContext(context: string): string {
		const request = getRequestContext();

		if (!context || !request) {
			return super.formatContext(context);
		}

		return super.formatContext(`${context} ${shortId(request.requestId)}`);
	}
}

function shortId(requestId: string): string {
	return requestId.slice(0, 8);
}

function isStructuredMessage(value: unknown): value is StructuredMessage {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);

	return (
		(prototype === Object.prototype || prototype === null) &&
		typeof (value as { message?: unknown }).message === "string"
	);
}

function withoutMessage(value: StructuredMessage): Record<string, unknown> {
	const { message: _message, ...fields } = value;

	return fields;
}
