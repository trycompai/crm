import type { StatusTone } from "@crm/ui/components/status-indicator";

export const PROSPECT_COUNTRY_LABELS: Record<string, string> = {
	AU: "Australia",
	GB: "United Kingdom",
	US: "United States",
};

export const PROSPECT_STATUS_LABELS: Record<string, string> = {
	CANDIDATE: "Candidate",
	RESEARCHING: "Researching",
	QUALIFIED: "Fit qualified",
	REVIEW: "Needs review",
	PROMOTED: "In CRM",
	DISQUALIFIED: "Disqualified",
};

export const PROSPECT_ROUTE_LABELS: Record<string, string> = {
	NONE: "No route",
	NAMED_PERSON_NEEDED: "Person needed",
	GENERIC_INBOX_BLOCKED: "Generic route blocked",
	DIRECT_ROUTE_REVIEW: "Direct route review",
	SEND_READY_REVIEW: "Permission review",
};

export function prospectStatusTone(status: string): StatusTone {
	if (status === "PROMOTED") return "success";
	if (status === "QUALIFIED") return "primary";
	if (status === "RESEARCHING") return "info";
	if (status === "DISQUALIFIED") return "error";
	if (status === "REVIEW") return "warning";
	return "neutral";
}

export function prospectRouteTone(status: string): StatusTone {
	if (status === "SEND_READY_REVIEW") return "success";
	if (status === "DIRECT_ROUTE_REVIEW") return "info";
	if (status === "GENERIC_INBOX_BLOCKED") return "error";
	if (status === "NAMED_PERSON_NEEDED") return "warning";
	return "neutral";
}
