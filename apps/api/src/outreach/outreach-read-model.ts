import type { EmailDraftStatus, EmailEventType } from "@crm/db";

type ProviderEvent = {
	eventType: EmailEventType;
};

export type OutreachStepReasonInput = {
	status: EmailDraftStatus;
	sendError: string | null;
	hasInboundReply: boolean;
	events: readonly ProviderEvent[];
};

export type OutreachExecutionContext = {
	approvalStatus: string | null;
	approvalExpired: boolean;
	sendingPaused: boolean;
	inboxEnabled: boolean;
	inboxError: string | null;
	routeSuppressed: boolean;
	hasApprovalDigest: boolean;
};

export function approvalSnapshotSequenceId(snapshot: unknown): string | null {
	if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
		return null;
	}
	const value = (snapshot as Record<string, unknown>).sequenceId;
	return typeof value === "string" ? value : null;
}

export function outreachStepStopReason(
	input: OutreachStepReasonInput,
): string | null {
	if (input.hasInboundReply) return "Reply received; future steps are stopped.";
	const eventType = input.events[0]?.eventType ?? null;
	if (eventType === "COMPLAINED")
		return "Complaint recorded; outreach must stay stopped.";
	if (eventType === "BOUNCED") return "Bounce recorded; route needs review.";
	if (eventType === "REJECTED")
		return "Provider rejection recorded; route needs review.";
	if (input.status === "REJECTED") {
		return input.sendError || "Stopped by operator.";
	}
	if (input.sendError) return input.sendError;
	return null;
}

export function outreachExecutionDisabledReason(
	input: OutreachExecutionContext,
): string | null {
	if (input.routeSuppressed)
		return "Recipient or domain is suppressed; execution is disabled.";
	if (input.approvalExpired)
		return "Approval expired; review the sequence again.";
	if (input.approvalStatus === "INVALIDATED")
		return "Approval was invalidated by a later change.";
	if (input.approvalStatus === "REJECTED")
		return "Approval was rejected by an operator.";
	if (input.approvalStatus === "PENDING")
		return "Awaiting approval before any execution.";
	if (!input.approvalStatus) return "No durable approval is linked yet.";
	if (!input.hasApprovalDigest)
		return "Approval digest is missing from one or more steps.";
	if (input.sendingPaused)
		return "Global or outreach send kill switch is enabled.";
	if (!input.inboxEnabled) return "AgentMail inbox is disabled or unavailable.";
	if (input.inboxError) return `AgentMail inbox error: ${input.inboxError}`;
	return "Provider execution remains disabled until final execution gates are opened.";
}
