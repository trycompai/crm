import { createHash } from "node:crypto";

export type OutreachDigestInput = {
	externalInboxId: string;
	fromEmail: string;
	recipients: unknown;
	subject: string;
	plainTextBody: string;
	experimentKey: string | null;
	variant: string | null;
	sequenceStep: number | null;
	scheduledFor: Date | string | null;
};

export function outreachApprovalDigest(draft: OutreachDigestInput): string {
	return createHash("sha256")
		.update(
			JSON.stringify({
				externalInboxId: draft.externalInboxId,
				fromEmail: draft.fromEmail.toLowerCase(),
				recipients: draft.recipients,
				subject: draft.subject,
				plainTextBody: draft.plainTextBody,
				experimentKey: draft.experimentKey,
				variant: draft.variant,
				sequenceStep: draft.sequenceStep,
				scheduledFor:
					draft.scheduledFor instanceof Date
						? draft.scheduledFor.toISOString()
						: draft.scheduledFor,
			}),
		)
		.digest("hex");
}
