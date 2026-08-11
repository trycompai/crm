import type { ZodType, z } from "zod";
import * as agents from "./agents";
import * as slack from "./slack";

export const schemas = { agents, slack } as const;

export type { Handoff, HandoffChannel, Permission } from "./agents";
export type { AuthTest, Installation, JoinPayload, Reply } from "./slack";

export class InvalidInput extends Error {}

export function parse<Schema extends ZodType>(
	schema: Schema,
	value: unknown,
	subject: string,
): z.infer<Schema> {
	const result = schema.safeParse(value);

	if (!result.success) {
		throw new InvalidInput(
			`${subject}: ${result.error.issues
				.map((issue) =>
					issue.path.length > 0
						? `${issue.path.join(".")} ${issue.message}`
						: issue.message,
				)
				.join("; ")}`,
		);
	}

	return result.data;
}
