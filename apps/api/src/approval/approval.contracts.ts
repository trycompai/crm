import { z } from "zod";
import {
	kernelListInput,
	subjectTypeInput,
} from "../operating-kernel/operating-kernel.contracts";

const approvalStatuses = [
	"PENDING",
	"APPROVED",
	"REJECTED",
	"EXPIRED",
	"INVALIDATED",
	"EXECUTED",
	"CANCELLED",
] as const;

const approvalRisks = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const approvalSorts = [
	"requestedAt",
	"expiresAt",
	"updatedAt",
	"status",
	"risk",
	"action",
] as const;

export const approvalListInput = kernelListInput.extend({
	status: z.enum(["all", ...approvalStatuses]).default("all"),
	risk: z.enum(["all", ...approvalRisks]).default("all"),
	targetType: z.union([z.literal("all"), subjectTypeInput]).default("all"),
	action: z.string().trim().max(120).default(""),
	sort: z.enum(approvalSorts).default("requestedAt"),
});

export const approvalIdInput = z.object({ id: z.string().min(1) });

export const approvalMutationInput = approvalIdInput.extend({
	expectedVersion: z.number().int().min(0),
	contentDigest: z.string().trim().length(64),
	invalidationVersion: z.number().int().min(0),
	clientRequestId: z.string().uuid(),
});

export type ApprovalListInput = z.infer<typeof approvalListInput>;
export type ApprovalMutationInput = z.infer<typeof approvalMutationInput>;
