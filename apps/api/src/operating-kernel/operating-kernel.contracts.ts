import { z } from "zod";
import { listInput } from "../trpc/list-input";

export const subjectTypeInput = z.enum([
	"WORKSPACE",
	"USER",
	"COMPANY",
	"CONTACT",
	"PROSPECT",
	"DEAL",
	"EMAIL_DRAFT",
	"WORK_ITEM",
	"CUSTOMER_ACCOUNT",
	"CUSTOMER_INSTANCE",
	"PROVIDER_ACCOUNT",
]);

export type KernelSubjectType = z.infer<typeof subjectTypeInput>;

export const subjectRefInput = z.object({
	type: subjectTypeInput,
	id: z.string().min(1),
});

export type SubjectRef = {
	type: string;
	id: string;
};

export type SubjectSummary = SubjectRef & {
	label: string | null;
	missing: boolean;
};

export type OwnerSummary = {
	id: string;
	name: string;
	email: string;
	image: string | null;
};

export const ownerFilterInput = z.enum(["all", "me", "unassigned"]);

export const isoDateInput = z.string().datetime({ offset: true });

export const kernelListInput = listInput.extend({
	q: z.string().trim().max(200).default(""),
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).max(100).default(25),
});

export type KernelListInput = z.infer<typeof kernelListInput>;

export function isoDate(value: Date | null): string | null {
	return value?.toISOString() ?? null;
}

export function memberCanReviewApproval(risk: string, action: string): boolean {
	return (
		(risk === "LOW" || risk === "MEDIUM") &&
		(action.startsWith("outreach.") || action.startsWith("marketing."))
	);
}
