export type HubspotScopeGroup = "deals" | "people" | "shape";

export type HubspotScope = {
	scope: string;
	group: HubspotScopeGroup;
	grant: string;
	sensitive: boolean;
};

export const HUBSPOT_SCOPES: readonly HubspotScope[] = [
	{
		scope: "oauth",
		group: "shape",
		grant: "Confirm which HubSpot account this is",
		sensitive: false,
	},
	{
		scope: "crm.objects.deals.read",
		group: "deals",
		grant:
			"Read every deal in the account, its stage, its amount and its close date",
		sensitive: true,
	},
	{
		scope: "crm.schemas.deals.read",
		group: "shape",
		grant: "Read the deal property definitions, including your custom ones",
		sensitive: false,
	},
	{
		scope: "crm.objects.owners.read",
		group: "people",
		grant:
			"Read deal owners and their email addresses, to match them to CRM users",
		sensitive: true,
	},
	{
		scope: "crm.objects.companies.read",
		group: "deals",
		grant: "Read the company a deal belongs to",
		sensitive: true,
	},
	{
		scope: "crm.objects.contacts.read",
		group: "deals",
		grant: "Read the contacts associated with a deal",
		sensitive: true,
	},
];

export const HUBSPOT_REQUESTED_SCOPES = HUBSPOT_SCOPES.map(
	(entry) => entry.scope,
);

export const HUBSPOT_REQUIRED_SCOPES = [
	"oauth",
	"crm.objects.deals.read",
] as const;

export const HUBSPOT_SCOPE_GROUPS: ReadonlyArray<{
	id: HubspotScopeGroup;
	label: string;
	summary: string;
}> = [
	{
		id: "deals",
		label: "Deals it can read",
		summary:
			"Every deal in the account, with the company and the people on it. HubSpot does not narrow this to the person who connects.",
	},
	{
		id: "people",
		label: "People",
		summary:
			"Deal owners and their email addresses, so an owner in HubSpot can be matched to a user here.",
	},
	{
		id: "shape",
		label: "How the account is set up",
		summary:
			"Pipelines, stages and property definitions. This is what says which stage means won and which means lost.",
	},
];

export type HubspotScopeSummary = {
	id: HubspotScopeGroup;
	label: string;
	summary: string;
	total: number;
	broad: number;
};

export function summariseHubspotScopes(
	granted: readonly string[],
): HubspotScopeSummary[] {
	const held = describeHubspotScopes(granted);

	return HUBSPOT_SCOPE_GROUPS.map((group) => {
		const inGroup = held.filter((entry) => entry.group === group.id);
		return {
			...group,
			total: inGroup.length,
			broad: inGroup.filter((entry) => entry.sensitive).length,
		};
	}).filter((group) => group.total > 0);
}

export type HubspotScopeDrift = {
	extra: HubspotScope[];
	missing: HubspotScope[];
};

export function hubspotScopeDrift(
	granted: readonly string[],
): HubspotScopeDrift {
	const held = new Set(granted);
	return {
		extra: describeHubspotScopes(
			granted.filter((scope) => !HUBSPOT_REQUESTED_SCOPES.includes(scope)),
		),
		missing: HUBSPOT_SCOPES.filter((entry) => !held.has(entry.scope)),
	};
}

export function hubspotCanReadDeals(granted: readonly string[]): boolean {
	const held = new Set(granted);
	return HUBSPOT_REQUIRED_SCOPES.every((scope) => held.has(scope));
}

export function describeHubspotScopes(
	granted: readonly string[],
): HubspotScope[] {
	const known = new Map(HUBSPOT_SCOPES.map((entry) => [entry.scope, entry]));
	return granted.map(
		(scope) =>
			known.get(scope) ?? {
				scope,
				group: "shape" as const,
				grant: `An undocumented permission named ${scope}`,
				sensitive: true,
			},
	);
}
