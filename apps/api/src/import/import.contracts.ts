import { z } from "zod";

export const importRowInput = z.record(z.string(), z.string());

export type ImportRowInput = z.infer<typeof importRowInput>;

export const importRequestInput = z.object({
	rows: z
		.array(importRowInput)
		.min(1, "O CSV precisa de pelo menos uma linha."),
});

export type ImportRequestInput = z.infer<typeof importRequestInput>;

const importRowErrorOutput = z.object({
	rowIndex: z.number(),
	message: z.string(),
});

export const importPreviewOutput = z.object({
	totalRows: z.number(),
	companiesToCreate: z.number(),
	companiesToUpdate: z.number(),
	contactsToCreate: z.number(),
	contactsToUpdate: z.number(),
	unrecognizedHeaders: z.array(z.string()),
	errors: z.array(importRowErrorOutput),
});

export type ImportPreviewOutput = z.infer<typeof importPreviewOutput>;

export const importCommitOutput = z.object({
	companiesCreated: z.number(),
	companiesUpdated: z.number(),
	contactsCreated: z.number(),
	contactsUpdated: z.number(),
});

export type ImportCommitOutput = z.infer<typeof importCommitOutput>;
