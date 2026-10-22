import { z } from "zod";

export const COMPANY_IMPORT = {
	maxFileBytes: 5 * 1024 * 1024,
	maxRows: 5000,
	faviconConcurrency: 8,
} as const;

export const companyImportRow = z.object({
	name: z.string(),
	phone: z.string().optional(),
	city: z.string().optional(),
	stateCode: z.string().optional(),
	industry: z.string().optional(),
	subIndustry: z.string().optional(),
	website: z.string().optional(),
	description: z.string().optional(),
});

export type CompanyImportRow = z.infer<typeof companyImportRow>;

export const companyImportInput = z.object({
	rows: z.array(companyImportRow).min(1).max(COMPANY_IMPORT.maxRows),
});

export type CompanyImportInput = z.infer<typeof companyImportInput>;
