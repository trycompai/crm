import type { DealStage } from "@crm/db/enums";
import { isClosedStage } from "@/lib/deal-stage";

export type DealNextActionKind =
	| "add-contact"
	| "set-value"
	| "set-close-date"
	| "log-activity"
	| "follow-up"
	| "advance"
	| "review-outcome";

export type DealNextAction = {
	kind: DealNextActionKind;
	label: string;
	description: string;
};

export function dealNextAction(deal: {
	amountCents: number | null;
	contactCount: number;
	expectedCloseDate: string | null;
	lastActivityAt: string | null;
	stage: DealStage;
}): DealNextAction {
	if (isClosedStage(deal.stage)) {
		return {
			kind: "review-outcome",
			label: "Review outcome",
			description:
				"This deal is closed. Capture the outcome clearly so the team can learn from it and report it accurately.",
		};
	}

	if (deal.contactCount === 0) {
		return {
			kind: "add-contact",
			label: "Add deal contact",
			description:
				"Nobody is attached to this opportunity. Add the champion or decision-maker before the deal advances.",
		};
	}

	if (deal.amountCents === null) {
		return {
			kind: "set-value",
			label: "Set deal value",
			description:
				"The opportunity has people but no commercial value. Add the expected amount so the pipeline can be trusted.",
		};
	}

	if (!deal.expectedCloseDate) {
		return {
			kind: "set-close-date",
			label: "Set close date",
			description:
				"Give the opportunity a realistic expected close date so the sales queue reflects timing, not just stage.",
		};
	}

	if (!deal.lastActivityAt) {
		return {
			kind: "log-activity",
			label: "Log first activity",
			description:
				"No interaction or next step is recorded yet. Add the first sales activity so the deal has an operating history.",
		};
	}

	const quietFor = Date.now() - new Date(deal.lastActivityAt).getTime();
	if (quietFor > 14 * 24 * 60 * 60 * 1_000) {
		return {
			kind: "follow-up",
			label: "Plan follow-up",
			description:
				"This opportunity has been quiet for more than two weeks. Review the history and record the next follow-up.",
		};
	}

	return {
		kind: "advance",
		label: "Advance the deal",
		description:
			"The core deal record is complete and active. Review the latest evidence and move the stage when the buyer has earned it.",
	};
}
