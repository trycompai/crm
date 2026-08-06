import type { EnrichmentStatus } from "@crm/db/enums";
import type { StatusTone } from "@crm/ui/components/status-indicator";

const PRESENTATION: Record<
	EnrichmentStatus,
	{ label: string; tone: StatusTone; busy?: boolean }
> = {
	PENDING: { label: "Not researched", tone: "neutral" },
	RUNNING: { label: "Researching", tone: "info", busy: true },
	COMPLETE: { label: "Enriched", tone: "success" },
	FAILED: { label: "Enrichment failed", tone: "error" },
	SKIPPED: { label: "Nothing found", tone: "neutral" },
};

const QUEUED = { label: "Queued", tone: "neutral" as StatusTone, busy: false };

export const ENRICHMENT_POLL_MS = 3_000;

export const ENRICHMENT_FACET_OPTIONS = (
	Object.keys(PRESENTATION) as EnrichmentStatus[]
).map((value) => ({ value, label: PRESENTATION[value].label }));

export function enrichmentPresentation(
	status: EnrichmentStatus,
	queued: boolean,
) {
	return status === "PENDING" && queued ? QUEUED : PRESENTATION[status];
}

export function isEnriching(status: EnrichmentStatus, queued = false): boolean {
	return status === "RUNNING" || (status === "PENDING" && queued);
}
