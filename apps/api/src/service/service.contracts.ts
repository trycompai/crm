import { z } from "zod";
import { listInput } from "../trpc/list-input";

export const serviceCaseStatuses = [
	"NEW",
	"OPEN",
	"PENDING_CUSTOMER",
	"PENDING_INTERNAL",
	"RESOLVED",
	"CLOSED",
] as const;

export const serviceCasePriorities = [
	"LOW",
	"NORMAL",
	"HIGH",
	"URGENT",
] as const;

export const serviceMatchStates = [
	"UNMATCHED",
	"MATCH_PROPOSED",
	"MATCHED",
	"EXCLUDED",
] as const;

export const serviceInboundSourceKinds = [
	"inboundSourceReceipt",
	"emailMessage",
	"websiteEnquiry",
	"granolaNote",
] as const;

export const serviceListInput = listInput.extend({
	status: z.enum(["all", ...serviceCaseStatuses]).default("all"),
	priority: z.enum(["all", ...serviceCasePriorities]).default("all"),
	matchState: z.enum(["all", ...serviceMatchStates]).default("all"),
	queue: z.string().trim().max(80).default("all"),
	customer: z.string().trim().max(120).default("all"),
});

export const serviceCaseIdInput = z.object({ id: z.string().min(1) });

export const serviceRecoverInboundInput = z.object({
	sourceType: z.enum(serviceInboundSourceKinds),
	sourceId: z.string().min(1),
	customerAccountId: z.string().min(1).optional(),
	clientRequestId: z.string().uuid(),
});

export type ServiceListInput = z.infer<typeof serviceListInput>;
export type ServiceRecoverInboundInput = z.infer<
	typeof serviceRecoverInboundInput
>;
