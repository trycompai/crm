import type { EnrichmentStatus } from "@crm/db/enums";
import { isEnriching } from "@/lib/enrichment-status";

export type ProspectNextActionKind =
	| "research"
	| "working"
	| "start-deal"
	| "manage-deals"
	| "complete-account"
	| "review-draft"
	| "review-evidence"
	| "review-disqualification";

export type ProspectNextAction = {
	kind: ProspectNextActionKind;
	label: string;
	description: string;
};

export function prospectNextAction(prospect: {
	companyId: string | null;
	contactId: string | null;
	dealCount: number;
	enrichmentStatus: EnrichmentStatus;
	hasDraft: boolean;
	jobPostingCount: number;
	namedPerson: string | null;
	queued: boolean;
	readiness?: {
		state: string;
		summary: string;
		actions: {
			canApproveRoute: boolean;
			canPrepareSequence: boolean;
			canApproveSequence: boolean;
		};
	};
	role: string | null;
	routeStatus: string;
	status: string;
}): ProspectNextAction {
	if (isEnriching(prospect.enrichmentStatus, prospect.queued)) {
		return {
			kind: "working",
			label: "Agent researching",
			description:
				"Public sources, live demand, the decision-maker and a safe work route are being checked now.",
		};
	}

	if (prospect.status === "DISQUALIFIED") {
		return {
			kind: "review-disqualification",
			label: "Review disqualification",
			description:
				"This prospect is out of the active queue. Review the evidence before deciding whether it deserves another research pass.",
		};
	}

	if (prospect.status === "PROMOTED" && !prospect.companyId) {
		return {
			kind: "review-evidence",
			label: "Review CRM handoff",
			description:
				"This prospect is marked as promoted but has no linked account. Review the evidence and repair the handoff before sales uses it.",
		};
	}

	if (prospect.readiness?.actions.canApproveRoute) {
		return {
			kind: "review-draft",
			label: "Approve route",
			description:
				"The current evidence supports a named public work route. Review it before granting outreach permission.",
		};
	}

	if (prospect.readiness?.actions.canPrepareSequence) {
		return {
			kind: "review-draft",
			label: "Prepare sequence",
			description:
				"The route is approved. Prepare three review-only A/B/C steps before any sequence can be approved.",
		};
	}

	if (
		prospect.readiness?.actions.canApproveSequence ||
		prospect.readiness?.state === "execution_disabled"
	) {
		return {
			kind: "review-draft",
			label: "Review sequence",
			description: prospect.readiness.summary,
		};
	}

	if (prospect.companyId && prospect.contactId) {
		if (prospect.dealCount === 0) {
			return {
				kind: "start-deal",
				label: "Start first deal",
				description:
					"The account and named contact are in the CRM. Open the first commercial opportunity so ownership, value and next steps are tracked.",
			};
		}

		return {
			kind: "manage-deals",
			label: "Manage deals",
			description:
				"This account is already in sales. Open its deal workspace to move the opportunity, add value and keep the next close current.",
		};
	}

	if (prospect.companyId) {
		return {
			kind: "complete-account",
			label: "Complete the account",
			description:
				"The company exists in the CRM, but there is no linked named contact yet. Resolve that gap before creating a deal.",
		};
	}

	if (!prospect.namedPerson || !prospect.role) {
		return {
			kind: "research",
			label: "Find decision-maker",
			description:
				"The company signal is not enough for sales. Research the current person whose remit owns the evidenced problem.",
		};
	}

	if (prospect.jobPostingCount === 0) {
		return {
			kind: "research",
			label: "Verify live demand",
			description:
				"A named person exists, but no official job posting is retained. Refresh the public demand signal before progressing.",
		};
	}

	if (
		prospect.routeStatus === "NONE" ||
		prospect.routeStatus === "NAMED_PERSON_NEEDED" ||
		prospect.routeStatus === "GENERIC_INBOX_BLOCKED"
	) {
		return {
			kind: "research",
			label: "Find public work route",
			description:
				"The person is known, but the CRM has no usable public work route. Research it without guessing or using a personal address.",
		};
	}

	if (prospect.hasDraft) {
		return {
			kind: "review-draft",
			label: "Review draft",
			description:
				"The evidence, person and route are ready for a human review. Check the draft against the source material before any approval.",
		};
	}

	return {
		kind: "review-evidence",
		label: "Review evidence",
		description:
			"The core account is researched. Review what is observed, what is inferred and which remaining gap blocks conversion.",
	};
}
