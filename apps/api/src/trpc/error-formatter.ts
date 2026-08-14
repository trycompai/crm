import type { TRPCDefaultErrorShape, TRPCErrorFormatter } from "@trpc/server";
import { z } from "zod";

const issueShape = z
	.object({
		message: z.string().catch(""),
		path: z.array(z.unknown()).catch([]),
	})
	.catch({ message: "", path: [] });

type Issue = z.infer<typeof issueShape>;

const pathSegment = z.string().nullable().catch(null);

const failedParse = z
	.object({ issues: z.array(issueShape).min(1) })
	.nullable()
	.catch(null);

/**
 * tRPC stringifies a failed input parse into the whole `ZodError`, so a form
 * that sends eight characters too few shows the reader a JSON array with
 * `code`, `minimum`, `inclusive` and a `path` in it. The sentence we wrote for
 * that rule is in there, and it is the only part anybody wants.
 *
 * Read by duck-typing rather than `instanceof ZodError`: the error crosses a
 * package boundary, and two copies of zod in a workspace would silently stop
 * matching and put the JSON back on screen.
 */
function issuesIn(cause: unknown): Issue[] | null {
	return failedParse.parse(cause)?.issues ?? null;
}

function sentence(issue: Issue): string | null {
	const message = issue.message.trim();
	if (message === "") return null;

	// Zod's own defaults ("Required", "Invalid input") name nothing, so they are
	// only useful with the field in front of them. Ours are whole sentences.
	if (/[.!?]$/.test(message)) return message;

	const field = issue.path
		.flatMap((part) => {
			const segment = pathSegment.parse(part);
			return segment === null ? [] : [segment];
		})
		.at(-1);

	return field ? `${field}: ${message}` : message;
}

export function readableInputError(
	message: string,
	cause: unknown,
): string | null {
	const issues = issuesIn(cause);
	if (!issues) return null;

	const sentences = [...new Set(issues.map(sentence).filter(Boolean))];

	return sentences.length > 0 ? sentences.join(" ") : message;
}

export const formatTrpcError: TRPCErrorFormatter<
	object,
	TRPCDefaultErrorShape
> = ({ shape, error }) => {
	const readable = readableInputError(shape.message, error.cause);

	return readable ? { ...shape, message: readable } : shape;
};
