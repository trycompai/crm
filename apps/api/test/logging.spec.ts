import { describe, expect, it, spyOn } from "bun:test";
import { Logger } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { ContextLogger } from "../src/logging/context-logger";
import {
	getRequestContext,
	runInRequestContext,
	setRequestUserId,
} from "../src/logging/request-context";
import { RequestLoggerMiddleware } from "../src/logging/request-logger.middleware";

function withNodeEnv(value: string, fn: () => void): void {
	const env = process.env as { NODE_ENV: string };
	const previous = env.NODE_ENV;
	env.NODE_ENV = value;

	try {
		fn();
	} finally {
		env.NODE_ENV = previous;
	}
}

function captureStdout(fn: () => void): string {
	const chunks: string[] = [];
	const spy = spyOn(process.stdout, "write").mockImplementation((chunk) => {
		chunks.push(String(chunk));
		return true;
	});

	try {
		fn();
	} finally {
		spy.mockRestore();
	}

	return chunks.join("");
}

const context = { requestId: "abcdef1234567890", method: "GET", path: "/x" };

describe("ContextLogger", () => {
	it("hoists structured fields and the request context into JSON", () => {
		withNodeEnv("production", () => {
			const logger = new ContextLogger();

			const output = captureStdout(() => {
				runInRequestContext({ ...context }, () => {
					setRequestUserId("user-1");
					logger.log({ message: "Hello", statusCode: 200 }, "Ctx");
				});
			});

			expect(JSON.parse(output)).toMatchObject({
				level: "log",
				message: "Hello",
				statusCode: 200,
				context: "Ctx",
				requestId: "abcdef1234567890",
				userId: "user-1",
			});
		});
	});

	it("does not let a log payload overwrite the fields Nest owns", () => {
		withNodeEnv("production", () => {
			const logger = new ContextLogger();

			const output = captureStdout(() => {
				logger.log({ message: "Hello", level: "error", pid: -1 }, "Ctx");
			});
			const record = JSON.parse(output);

			expect(record.level).toBe("log");
			expect(record.pid).toBe(process.pid);
		});
	});

	it("omits correlation fields when there is no request", () => {
		withNodeEnv("production", () => {
			const logger = new ContextLogger();
			const output = captureStdout(() => logger.log("Standalone", "Ctx"));

			expect(JSON.parse(output).requestId).toBeUndefined();
		});
	});

	it("renders structured messages readably in development", () => {
		withNodeEnv("development", () => {
			const logger = new ContextLogger();

			const output = captureStdout(() => {
				runInRequestContext({ ...context }, () => {
					logger.log({ message: "Hello", statusCode: 200 }, "Ctx");
				});
			});

			expect(output).toContain("Hello");
			expect(output).toContain("statusCode");
			expect(output).not.toContain("Object(2)");
			expect(output).toContain("Ctx abcdef12");
		});
	});

	it("drops verbose output in production", () => {
		withNodeEnv("production", () => {
			const logger = new ContextLogger();

			expect(captureStdout(() => logger.verbose("Quiet", "Ctx"))).toBe("");
		});
	});
});

describe("request context", () => {
	it("is isolated per run and unset outside one", () => {
		expect(getRequestContext()).toBeUndefined();

		runInRequestContext({ ...context, requestId: "a" }, () => {
			expect(getRequestContext()?.requestId).toBe("a");
		});

		expect(getRequestContext()).toBeUndefined();
	});
});

type LoggedRequest = {
	message: string;
	path: string;
	statusCode: number;
	apiKeyPresented: boolean;
};

const LOG_LEVELS = ["log", "warn", "error", "verbose"] as const;

type LogLevel = (typeof LOG_LEVELS)[number];

type LoggedCall = { level: LogLevel; payload: LoggedRequest };

type MiddlewareRun = {
	requestId: string;
	seen: string | undefined;
	events: string[];
	finish: () => LoggedCall;
};

type RequestTarget = { originalUrl: string; path: string };

describe("RequestLoggerMiddleware", () => {
	function run(
		headers: Record<string, string>,
		target: RequestTarget = { originalUrl: "/things", path: "/things" },
		statusCode = 200,
	): MiddlewareRun {
		const middleware = new RequestLoggerMiddleware();
		let requestId = "";
		let seen: string | undefined;
		const listeners = new Map<string, () => void>();

		const request = {
			method: "GET",
			...target,
			ip: "127.0.0.1",
			get: (name: string) => headers[name.toLowerCase()],
		} as unknown as Request;

		const response = {
			statusCode,
			setHeader: (_name: string, value: string) => {
				requestId = value;
			},
			on: (event: string, listener: () => void) => {
				listeners.set(event, listener);
				return response;
			},
		} as unknown as Response;

		middleware.use(request, response, (() => {
			seen = getRequestContext()?.requestId;
		}) as NextFunction);

		const finish = (): LoggedCall => {
			const calls: LoggedCall[] = [];
			const spies = LOG_LEVELS.map((level) =>
				spyOn(Logger.prototype, level).mockImplementation(
					(payload: LoggedRequest) => {
						calls.push({ level, payload });
					},
				),
			);

			try {
				listeners.get("finish")?.();
				expect(calls).toHaveLength(1);
				return calls[0] as LoggedCall;
			} finally {
				for (const spy of spies) {
					spy.mockRestore();
				}
			}
		};

		return { requestId, seen, events: [...listeners.keys()], finish };
	}

	it("stamps a request id and exposes it to the handler", () => {
		const { requestId, seen } = run({});

		expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
		expect(seen).toBe(requestId);
	});

	it("reuses a caller-supplied id so a trace spans hops", () => {
		expect(run({ "x-request-id": "trace-abc.1" }).requestId).toBe(
			"trace-abc.1",
		);
	});

	it("ignores a malformed id rather than logging attacker-controlled text", () => {
		const { requestId } = run({ "x-request-id": "bad id\nlevel=error" });

		expect(requestId).not.toContain("\n");
		expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("logs the path without its query string", () => {
		const logged = run(
			{},
			{ originalUrl: "/api/test?token=secret&foo=bar", path: "/api/test" },
		).finish().payload;

		expect(logged.path).toBe("/api/test");
		expect(logged.message).not.toContain("?");
		expect(JSON.stringify(logged)).not.toContain("secret");
	});

	it("records that an api key was presented without logging it", () => {
		const logged = run({ "x-api-key": "crm_live_secret" }).finish().payload;

		expect(logged.apiKeyPresented).toBe(true);
		expect(JSON.stringify(logged)).not.toContain("crm_live_secret");
	});

	it("records that no api key was presented", () => {
		expect(run({}).finish().payload.apiKeyPresented).toBe(false);
	});

	it("logs once the response emits finish", () => {
		expect(run({}).events).toEqual(["finish"]);
	});

	it.each([
		[200, "/things", "log"],
		[404, "/things", "warn"],
		[500, "/things", "error"],
		[200, "/health", "verbose"],
		[503, "/health", "error"],
	] as const)("logs a %i on %s at %s", (statusCode, path, level) => {
		const logged = run({}, { originalUrl: path, path }, statusCode).finish();

		expect(logged.level).toBe(level);
		expect(logged.payload.statusCode).toBe(statusCode);
		expect(logged.payload.path).toBe(path);
	});
});
