export type CrmEventRecordKind = "company" | "contact" | "deal";

type CrmEventDefinition = {
	label: string;
	description: string;
	recordKind: CrmEventRecordKind;
};

export const CRM_EVENT_CATALOG = {
	"company.created": {
		label: "Company created",
		description: "A company is added to the CRM",
		recordKind: "company",
	},
	"contact.created": {
		label: "Contact created",
		description: "A contact is added to the CRM",
		recordKind: "contact",
	},
	"deal.created": {
		label: "Deal created",
		description: "A deal is added to the CRM",
		recordKind: "deal",
	},
	"deal.stage.changed": {
		label: "Deal stage changed",
		description: "A deal moves from one pipeline stage to another",
		recordKind: "deal",
	},
	"deal.opened": {
		label: "Deal opened",
		description: "A closed deal returns to the open pipeline",
		recordKind: "deal",
	},
	"deal.closed": {
		label: "Deal closed",
		description: "An open deal moves to a closed stage",
		recordKind: "deal",
	},
} as const satisfies Record<string, CrmEventDefinition>;

export type CrmEventType = keyof typeof CRM_EVENT_CATALOG;

export const CRM_EVENT_TYPES = Object.keys(CRM_EVENT_CATALOG) as [
	CrmEventType,
	...CrmEventType[],
];

export function isCrmEventType(value: unknown): value is CrmEventType {
	return typeof value === "string" && Object.hasOwn(CRM_EVENT_CATALOG, value);
}
