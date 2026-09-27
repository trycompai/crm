import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { auth } from "@crm/auth";
import { TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import {
	createBaseTrpcContext,
	retryAfterSeconds,
} from "../src/trpc/trpc.context";

function betterAuthError(
	status: string,
	message?: string,
	tryAgainInMs?: number,
): Error {
	const error = new Error(message ?? status);
	error.name = "APIError";
	return Object.assign(error, {
		status,
		...(tryAgainInMs !== undefined && {
			body: { details: { tryAgainIn: tryAgainInMs } },
		}),
	});
}

function fakeRequest(): Request {
	return { headers: {} } as unknown as Request;
}

function fakeResponse() {
	const headers = new Map<string, string>();
	const res = {
		setHeader: (name: string, value: string) => {
			headers.set(name, value);
		},
	} as unknown as Response;
	return { res, headers };
}

let getSessionSpy: ReturnType<typeof spyOn> | undefined;

afterEach(() => {
	getSessionSpy?.mockRestore();
	getSessionSpy = undefined;
});

describe("createBaseTrpcContext", () => {
	it("returns no session when there is no request", async () => {
		const context = await createBaseTrpcContext(undefined);

		expect(context.session).toBeNull();
	});

	it("returns the resolved session when auth.api.getSession succeeds", async () => {
		const fakeSession = { user: { id: "u1" } };
		getSessionSpy = spyOn(auth.api, "getSession").mockResolvedValue(
			fakeSession as never,
		);

		const context = await createBaseTrpcContext(fakeRequest());

		expect(context.session).toBe(fakeSession as never);
	});

	it("treats an expired or invalid session as no session, not an error", async () => {
		getSessionSpy = spyOn(auth.api, "getSession").mockRejectedValue(
			betterAuthError("UNAUTHORIZED"),
		);

		const context = await createBaseTrpcContext(fakeRequest());

		expect(context.session).toBeNull();
	});

	it("treats a malformed API key as no session, not an error", async () => {
		getSessionSpy = spyOn(auth.api, "getSession").mockRejectedValue(
			betterAuthError("FORBIDDEN"),
		);

		const context = await createBaseTrpcContext(fakeRequest());

		expect(context.session).toBeNull();
	});

	it("does not turn a rate-limited API key into an absent session", async () => {
		getSessionSpy = spyOn(auth.api, "getSession").mockRejectedValue(
			betterAuthError("TOO_MANY_REQUESTS", "Rate limit exceeded."),
		);

		await expect(createBaseTrpcContext(fakeRequest())).rejects.toBeInstanceOf(
			TRPCError,
		);
	});

	it("propagates a rate limit as a TOO_MANY_REQUESTS TRPCError, not UNAUTHORIZED", async () => {
		getSessionSpy = spyOn(auth.api, "getSession").mockRejectedValue(
			betterAuthError("TOO_MANY_REQUESTS", "Rate limit exceeded."),
		);

		try {
			await createBaseTrpcContext(fakeRequest());
			throw new Error("expected createBaseTrpcContext to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(TRPCError);
			expect((error as TRPCError).code).toBe("TOO_MANY_REQUESTS");
			expect((error as TRPCError).message).toBe("Rate limit exceeded.");
		}
	});

	it("does not silently swallow an unrecognised auth failure", async () => {
		getSessionSpy = spyOn(auth.api, "getSession").mockRejectedValue(
			new Error("boom"),
		);

		await expect(createBaseTrpcContext(fakeRequest())).rejects.toThrow("boom");
	});

	it("does not silently swallow an APIError with an unexpected status", async () => {
		getSessionSpy = spyOn(auth.api, "getSession").mockRejectedValue(
			betterAuthError("INTERNAL_SERVER_ERROR", "Database unavailable."),
		);

		await expect(createBaseTrpcContext(fakeRequest())).rejects.toThrow(
			"Database unavailable.",
		);
	});

	it("sets Retry-After, in seconds, when the rate limiter names a wait", async () => {
		getSessionSpy = spyOn(auth.api, "getSession").mockRejectedValue(
			betterAuthError("TOO_MANY_REQUESTS", "Rate limit exceeded.", 4_500),
		);
		const { res, headers } = fakeResponse();

		await expect(
			createBaseTrpcContext(fakeRequest(), res),
		).rejects.toBeInstanceOf(TRPCError);

		expect(headers.get("Retry-After")).toBe("5");
	});

	it("does not set Retry-After when the rate limiter names no wait", async () => {
		getSessionSpy = spyOn(auth.api, "getSession").mockRejectedValue(
			betterAuthError("TOO_MANY_REQUESTS", "Rate limit exceeded."),
		);
		const { res, headers } = fakeResponse();

		await expect(
			createBaseTrpcContext(fakeRequest(), res),
		).rejects.toBeInstanceOf(TRPCError);

		expect(headers.has("Retry-After")).toBe(false);
	});

	it("never sets Retry-After for a non-rate-limit failure", async () => {
		getSessionSpy = spyOn(auth.api, "getSession").mockRejectedValue(
			betterAuthError("UNAUTHORIZED"),
		);
		const { res, headers } = fakeResponse();

		await createBaseTrpcContext(fakeRequest(), res);

		expect(headers.size).toBe(0);
	});
});

describe("retryAfterSeconds", () => {
	it("returns null when there is nothing to wait for", () => {
		expect(retryAfterSeconds(undefined)).toBeNull();
	});

	it("rounds up to the next whole second", () => {
		expect(retryAfterSeconds(1)).toBe(1);
		expect(retryAfterSeconds(1_000)).toBe(1);
		expect(retryAfterSeconds(1_001)).toBe(2);
		expect(retryAfterSeconds(4_500)).toBe(5);
	});

	it("never returns a negative value", () => {
		expect(retryAfterSeconds(-5_000)).toBe(0);
	});

	it("treats zero as zero, not as absent", () => {
		expect(retryAfterSeconds(0)).toBe(0);
	});
});
