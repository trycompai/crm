import { z } from "zod";
import { INPUT_REQUEST_KINDS } from "./agents";

const optionalText = z.string().optional().catch(undefined);

const builderQuestionOption = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	description: optionalText,
	style: z.enum(["danger", "default", "primary"]).optional().catch(undefined),
});

export type BuilderQuestionOption = z.infer<typeof builderQuestionOption>;

const askedQuestion = z
	.object({
		kind: z.enum(INPUT_REQUEST_KINDS),
		requestId: z.string().min(1),
		prompt: z.string().min(1),
		display: z
			.enum(["confirmation", "select", "text"])
			.optional()
			.catch(undefined),
		options: z
			.array(builderQuestionOption.nullable().catch(null))
			.catch([])
			.transform((entries) => entries.filter((entry) => entry !== null)),
		allowFreeform: z.boolean().optional().catch(undefined),
	})
	.transform((question) => ({
		kind: question.kind,
		requestId: question.requestId,
		prompt: question.prompt,
		display: question.display,
		options: question.options,
		allowFreeform:
			question.allowFreeform === true ||
			question.display === "text" ||
			question.options.length === 0,
	}));

export type BuilderQuestion = z.infer<typeof askedQuestion>;

export const builderQuestion = askedQuestion.nullable().catch(null);
