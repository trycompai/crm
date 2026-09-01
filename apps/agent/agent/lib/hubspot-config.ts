const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const HUBSPOT_READS = {
	deals: {
		pageSize: 100,
		maxPageSize: 200,
		properties: [
			"dealname",
			"dealstage",
			"pipeline",
			"amount",
			"deal_currency_code",
			"closedate",
			"createdate",
			"hs_lastmodifieddate",
			"hs_is_closed_won",
			"hs_is_closed_lost",
			"closed_won_reason",
			"closed_lost_reason",
			"hubspot_owner_id",
		],
	},

	pipelines: {
		staleMs: 30 * MINUTE_MS,
	},

	search: {
		resultCeiling: 10_000,
	},

	request: {
		timeoutMs: 20 * SECOND_MS,
		retries: 2,
		backoffMs: 1_500,
	},
} as const;

export const HUBSPOT_CAPABILITY = "HUBSPOT_CONNECTION";

export const HUBSPOT_CAPABILITY_SOURCE = "Settings → Connections";
