import { z } from "zod";

export const setAgentModelInput = z.object({
	modelId: z.string().trim().min(1).max(200).nullable(),
});

export type SetAgentModelInput = z.infer<typeof setAgentModelInput>;

export const setResearchKeyInput = z.object({
	apiKey: z
		.string()
		.trim()
		.min(8, "That does not look like a Context API key — it is too short.")
		.max(500, "That does not look like a Context API key — it is too long.")
		.refine(
			(value) => !/\s/.test(value),
			"An API key has no spaces in it. Paste the whole key on its own.",
		),
});

export type SetResearchKeyInput = z.infer<typeof setResearchKeyInput>;
