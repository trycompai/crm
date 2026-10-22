import { z } from "zod";
import { inputRequest } from "./agents";

export const builderSessionLimit = inputRequest
	.extend({ kind: z.literal("session-limit") })
	.nullable()
	.catch(null);

export type BuilderSessionLimit = NonNullable<
	z.infer<typeof builderSessionLimit>
>;
