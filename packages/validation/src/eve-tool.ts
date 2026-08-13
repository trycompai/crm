import { z } from "zod";

const json = z.json();

const eveToolFields = z.record(z.string(), json);

export type EveToolFields = z.infer<typeof eveToolFields>;

export const eveToolInput = eveToolFields.nullable().catch(null);

export type EveToolInput = z.infer<typeof eveToolInput>;

export const eveToolOutput = eveToolFields.nullable().catch(null);

export type EveToolOutput = z.infer<typeof eveToolOutput>;

export const eveToolText = z.string().catch("");

const flag = z.boolean().nullable().catch(null);

const link = z
	.string()
	.regex(/^https?:\/\//)
	.nullable()
	.catch(null);

export const eveToolOutcome = z
	.object({
		reason: z.string().nullable().catch(null),
		applied: flag,
		written: flag,
		stored: flag,
		sourceUrl: link,
		profileUrl: link,
		url: link,
	})
	.nullable()
	.catch(null);

export type EveToolOutcome = z.infer<typeof eveToolOutcome>;
