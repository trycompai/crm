import { z } from "zod";

const withReason = z.object({ reason: z.string() }).partial();
const jsonValue = z.json();

type JsonValue = z.infer<typeof jsonValue>;

export type Answer<T> =
	| { status: "ok"; data: T }
	| { status: "missing"; reason: string }
	| { status: "failed"; reason: string };

export async function readEdgar<Shape extends z.ZodTypeAny>(
	path: string,
	query: Record<string, string | number | undefined>,
	shape: Shape,
): Promise<Answer<z.infer<Shape>>> {
	const url = new URL(`/edgar/${path}`, window.location.origin);
	for (const [key, value] of Object.entries(query)) {
		if (value !== undefined && value !== "") {
			url.searchParams.set(key, String(value));
		}
	}

	const response = await fetch(url, {
		headers: { accept: "application/json" },
	});
	const body = await bodyOf(response);
	const reason = withReason.safeParse(body);
	const said = reason.success ? reason.data.reason : undefined;

	if (response.status === 404) {
		return { status: "missing", reason: said ?? "Nothing on file." };
	}
	if (!response.ok) {
		return {
			status: "failed",
			reason: said ?? `The SEC service answered HTTP ${response.status}.`,
		};
	}

	const parsed = shape.safeParse(body);
	return parsed.success
		? { status: "ok", data: parsed.data }
		: {
				status: "failed",
				reason: "The SEC service answered in a shape this page does not read.",
			};
}

async function bodyOf(response: Response): Promise<JsonValue | null> {
	try {
		return jsonValue.parse(await response.json());
	} catch {
		return null;
	}
}

const usd = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	maximumFractionDigits: 0,
});

const compact = new Intl.NumberFormat("en-US", {
	notation: "compact",
	maximumFractionDigits: 1,
});

export function money(value: number | null): string {
	return value === null ? "—" : usd.format(value);
}

export function count(value: number | null): string {
	return value === null ? "—" : compact.format(value);
}

export function percent(value: number | null): string {
	return value === null ? "—" : `${value.toFixed(2)}%`;
}
