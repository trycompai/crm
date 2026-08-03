import {
	OutreachStep,
	ProductKey,
	ProspectKind,
	ProspectStatus,
} from "@crm/db";
import { z } from "zod";
import { listInput } from "../trpc/list-input";

const productEnum = z.enum(
	Object.values(ProductKey) as [ProductKey, ...ProductKey[]],
);
const kindEnum = z.enum(
	Object.values(ProspectKind) as [ProspectKind, ...ProspectKind[]],
);
const statusEnum = z.enum(
	Object.values(ProspectStatus) as [ProspectStatus, ...ProspectStatus[]],
);
const stepEnum = z.enum(
	Object.values(OutreachStep) as [OutreachStep, ...OutreachStep[]],
);

export const prospectListInput = listInput.extend({
	product: z.union([z.literal("all"), productEnum]).default("all"),
	status: z.union([z.literal("all"), statusEnum]).default("all"),
});

export const prospectIdInput = z.object({ id: z.string().min(1) });

export const prospectDecisionInput = z.object({
	id: z.string().min(1),
	reason: z.string().trim().min(3).max(500),
});

export const prospectDraftInput = z.object({
	candidateId: z.string().min(1),
	step: stepEnum,
	recipientEmail: z.string().trim().email(),
	subject: z.string().trim().min(1).max(200),
	body: z.string().trim().min(1).max(10_000),
	scheduledAt: z.string().datetime().nullable().optional(),
});

export const outreachMessageIdInput = z.object({ id: z.string().min(1) });

export const complianceSnapshotInput = z.object({
	source: z.string().trim().url(),
	effectiveAt: z.string().datetime(),
	domains: z.array(z.string().trim().min(3).max(253)).min(1).max(250_000),
});

export const productUpdateInput = z.object({
	id: productEnum,
	active: z.boolean().optional(),
	discoveryDailyCap: z.number().int().min(0).max(500).optional(),
	outreachDailyCap: z.number().int().min(0).max(100).optional(),
	offerName: z.string().trim().min(1).max(120).optional(),
	offerPrice: z.string().trim().min(1).max(80).optional(),
	offerUrl: z.string().url().nullable().optional(),
	senderUserId: z.string().nullable().optional(),
	commercialReady: z.boolean().optional(),
});

export const inboundLead = z
	.object({
		eventId: z.string().min(8).max(200),
		product: productEnum,
		occurredAt: z.string().datetime(),
		lead: z
			.object({
				kind: kindEnum,
				email: z.string().trim().email(),
				name: z.string().trim().min(1).max(200).optional(),
				companyName: z.string().trim().min(1).max(200).optional(),
				domain: z.string().trim().min(3).max(253).optional(),
				countryCode: z.string().trim().length(2).optional(),
				consent: z
					.object({
						status: z.literal("granted"),
						capturedAt: z.string().datetime(),
						policyVersion: z.string().trim().min(1).max(100),
						source: z.string().trim().min(1).max(200),
					})
					.strict(),
			})
			.strict(),
	})
	.strict();

export const inboundSuppression = z
	.object({
		eventId: z.string().min(8).max(200),
		product: productEnum,
		occurredAt: z.string().datetime(),
		email: z.string().trim().email(),
		reason: z.string().trim().min(3).max(500),
	})
	.strict();

export type ProspectListInput = z.infer<typeof prospectListInput>;
export type ProspectDraftInput = z.infer<typeof prospectDraftInput>;
export type ProductUpdateInput = z.infer<typeof productUpdateInput>;
export type InboundLead = z.infer<typeof inboundLead>;
export type InboundSuppression = z.infer<typeof inboundSuppression>;
export type ComplianceSnapshotInput = z.infer<typeof complianceSnapshotInput>;
