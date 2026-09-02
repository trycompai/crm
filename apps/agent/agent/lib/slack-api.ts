import type { z } from "zod";
import { SLACK } from "./slack-config";

type Reply = { ok: boolean; error?: string };

export type SlackPostBody = {
	channel?: string;
	users?: string;
	emails?: string[];
	external_limited?: boolean;
	name?: string;
	is_private?: boolean;
};

export type SlackOutcome<T> =
	| { ok: true; data: T }
	| { ok: false; error: string };

const UNREADABLE = "unreadable_reply";
const RATELIMITED = "ratelimited";
const REJECTED = "rejected";
export const SLACK_UNREACHABLE = "unreachable";

async function reach<T extends Reply>(
	call: () => Promise<Response>,
	handle: (response: Response) => Promise<SlackOutcome<T>>,
): Promise<SlackOutcome<T>> {
	let response: Response;
	try {
		response = await call();
	} catch {
		return { ok: false, error: SLACK_UNREACHABLE };
	}

	return handle(response);
}

async function read<T extends Reply>(
	response: Response,
	schema: z.ZodType<T>,
	again: () => Promise<SlackOutcome<T>>,
	attempt: number,
): Promise<SlackOutcome<T>> {
	const parsed = schema.safeParse(await response.json().catch(() => null));
	if (!parsed.success) return { ok: false, error: UNREADABLE };
	if (parsed.data.ok) return { ok: true, data: parsed.data };

	if (
		parsed.data.error === RATELIMITED &&
		attempt < SLACK.request.maxAttempts
	) {
		const wait = Number(response.headers.get("retry-after") ?? "1");
		await new Promise((resolve) =>
			setTimeout(resolve, wait * SLACK.request.retryUnitMs),
		);
		return again();
	}

	return { ok: false, error: parsed.data.error ?? REJECTED };
}

export async function slackPost<T extends Reply>(
	token: string,
	method: string,
	body: SlackPostBody,
	schema: z.ZodType<T>,
	attempt = 1,
): Promise<SlackOutcome<T>> {
	return reach(
		() =>
			fetch(`https://slack.com/api/${method}`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${token}`,
					"content-type": "application/json; charset=utf-8",
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(SLACK.request.timeoutMs),
			}),
		(response) =>
			read(
				response,
				schema,
				() => slackPost(token, method, body, schema, attempt + 1),
				attempt,
			),
	);
}

export async function slackGet<T extends Reply>(
	token: string,
	method: string,
	query: Record<string, string>,
	schema: z.ZodType<T>,
	attempt = 1,
): Promise<SlackOutcome<T>> {
	const url = new URL(`https://slack.com/api/${method}`);
	for (const [key, value] of Object.entries(query)) {
		url.searchParams.set(key, value);
	}

	return reach(
		() =>
			fetch(url, {
				headers: { authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(SLACK.request.timeoutMs),
			}),
		(response) =>
			read(
				response,
				schema,
				() => slackGet(token, method, query, schema, attempt + 1),
				attempt,
			),
	);
}
