import { Injectable, Logger } from "@nestjs/common";

export type MailboxResult<T> =
	| { outcome: "ok"; data: T }
	| { outcome: "cursor-invalid"; reason: string }
	| { outcome: "unauthorized"; reason: string }
	| { outcome: "rate-limited"; reason: string; retryAfterMs: number }
	| { outcome: "failed"; reason: string; retryable: boolean };

const DEFAULT_TIMEOUT_MS = 20_000;

const MIN_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 15 * 60_000;

@Injectable()
export class MailboxApiClient {
	private readonly logger = new Logger(MailboxApiClient.name);

	async get<T>(
		url: string,
		accessToken: string,
		params: Record<string, string | number | boolean | undefined> = {},
	): Promise<MailboxResult<T>> {
		const target = new URL(url);
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined) target.searchParams.set(key, String(value));
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

		try {
			const response = await fetch(target, {
				headers: { authorization: `Bearer ${accessToken}` },
				signal: controller.signal,
			});

			return await this.interpret<T>(response, target.pathname);
		} catch (error) {
			const aborted = error instanceof Error && error.name === "AbortError";
			return {
				outcome: "failed",
				reason: aborted
					? `Timed out after ${DEFAULT_TIMEOUT_MS}ms.`
					: error instanceof Error
						? error.message
						: String(error),
				retryable: true,
			};
		} finally {
			clearTimeout(timeout);
		}
	}

	private async interpret<T>(
		response: Response,
		path: string,
	): Promise<MailboxResult<T>> {
		if (response.ok) {
			return { outcome: "ok", data: (await response.json()) as T };
		}

		const detail = await this.reason(response);

		switch (response.status) {
			case 401:
				return { outcome: "unauthorized", reason: detail };

			case 404:
			case 410:
				return { outcome: "cursor-invalid", reason: detail };

			case 403:
				if (/rate|quota|userRateLimitExceeded|limitExceeded/i.test(detail)) {
					return {
						outcome: "rate-limited",
						reason: detail,
						retryAfterMs: this.backoffFrom(response),
					};
				}
				return { outcome: "failed", reason: detail, retryable: false };

			case 429:
				return {
					outcome: "rate-limited",
					reason: detail,
					retryAfterMs: this.backoffFrom(response),
				};

			default: {
				const retryable = response.status >= 500;
				this.logger.warn({
					message: "Mailbox API call failed",
					path,
					status: response.status,
					retryable,
				});
				return { outcome: "failed", reason: detail, retryable };
			}
		}
	}

	private backoffFrom(response: Response): number {
		const header = response.headers.get("retry-after");
		const seconds = header ? Number(header) : Number.NaN;
		const suggested = Number.isFinite(seconds)
			? seconds * 1000
			: MIN_BACKOFF_MS;

		return Math.min(Math.max(suggested, MIN_BACKOFF_MS), MAX_BACKOFF_MS);
	}

	private async reason(response: Response): Promise<string> {
		try {
			const body = (await response.json()) as {
				error?: { message?: string; status?: string; code?: string };
			};
			return (
				body.error?.message ??
				body.error?.status ??
				body.error?.code ??
				`HTTP ${response.status}`
			);
		} catch {
			return `HTTP ${response.status}`;
		}
	}
}
