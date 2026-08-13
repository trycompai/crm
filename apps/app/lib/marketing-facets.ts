import { FACET_LIMITS } from "@crm/db/marketing/facet-limits";
import type {
	FacetSpec,
	RuleRow,
	RuleTreeValue,
} from "@crm/ui/components/rule-tree";
import { DEAL_STAGE_OPTIONS } from "@/lib/deal-stage";

const DOMAIN_SEPARATOR = ",";

export const FACETS: FacetSpec[] = [
	{
		id: "contact.hasEmail",
		group: "Contact",
		label: "Has an email address",
		field: { kind: "none" },
	},
	{
		id: "contact.owner",
		group: "Contact",
		label: "Owned by",
		field: { kind: "choice", key: "userId", options: [] },
	},
	{
		id: "contact.source",
		group: "Contact",
		label: "Came from",
		field: {
			kind: "choice",
			key: "source",
			options: [
				{ value: "MANUAL", label: "Added manually" },
				{ value: "IMPORT", label: "An import" },
				{ value: "EMAIL", label: "Email" },
				{ value: "CALENDAR", label: "Calendar" },
				{ value: "TRACKING", label: "The website" },
			],
		},
	},
	{
		id: "contact.titleContains",
		group: "Contact",
		label: "Job title contains",
		field: { kind: "text", key: "value", placeholder: "Head of" },
	},
	{
		id: "contact.createdWithin",
		group: "Contact",
		label: "Added within",
		field: { kind: "number", key: "days", suffix: "days" },
	},
	{
		id: "company.industry",
		group: "Company",
		label: "Industry is",
		field: { kind: "text", key: "value", placeholder: "Fintech" },
	},
	{
		id: "company.country",
		group: "Company",
		label: "Country is",
		field: { kind: "text", key: "value", placeholder: "United Kingdom" },
	},
	{
		id: "company.domainIn",
		group: "Company",
		label: "Domain is one of",
		field: {
			kind: "list",
			key: "domains",
			separator: DOMAIN_SEPARATOR,
			placeholder: "acme.com, globex.com",
		},
	},
	{
		id: "field.equals",
		group: "Custom fields",
		label: "Custom field",
		field: { kind: "pair", key: "key", extraKey: "value", options: [] },
	},
	{
		id: "activity.within",
		group: "Activity",
		label: "Active within",
		field: { kind: "number", key: "days", suffix: "days" },
	},
	{
		id: "activity.notWithin",
		group: "Activity",
		label: "Quiet for at least",
		field: { kind: "number", key: "days", suffix: "days" },
	},
	{
		id: "deal.atStage",
		group: "Deals",
		label: "Has a deal at stage",
		field: { kind: "choice", key: "stage", options: DEAL_STAGE_OPTIONS },
	},
	{
		id: "deal.hasNoOpen",
		group: "Deals",
		label: "Has no open deal",
		field: { kind: "none" },
	},
	{
		id: "deal.closedWonWithin",
		group: "Deals",
		label: "Closed won within",
		field: { kind: "number", key: "days", suffix: "days" },
	},
	{
		id: "mailbox.repliedWithin",
		group: "Mailbox",
		label: "Replied within",
		field: { kind: "number", key: "days", suffix: "days" },
	},
	{
		id: "mailbox.neverReplied",
		group: "Mailbox",
		label: "Never replied",
		field: { kind: "none" },
	},
	{
		id: "meeting.bookedWithin",
		group: "Meetings",
		label: "Booked a meeting within",
		field: { kind: "number", key: "days", suffix: "days" },
	},
	{
		id: "meeting.notBookedWithin",
		group: "Meetings",
		label: "No meeting booked within",
		field: { kind: "number", key: "days", suffix: "days" },
	},
	{
		id: "tracking.visitedPath",
		group: "Website",
		label: "Visited a page starting",
		field: { kind: "text", key: "path", placeholder: "/pricing" },
	},
	{
		id: "tracking.submittedForm",
		group: "Website",
		label: "Submitted a form on",
		field: { kind: "text", key: "path", placeholder: "/contact" },
	},
	{
		id: "marketing.noSendWithin",
		group: "Marketing",
		label: "Had no marketing email within",
		field: { kind: "number", key: "days", suffix: "days" },
	},
	{
		id: "marketing.openedCampaign",
		group: "Marketing",
		label: "Opened the campaign",
		field: { kind: "choice", key: "campaignId", options: [] },
	},
	{
		id: "marketing.clickedCampaign",
		group: "Marketing",
		label: "Clicked in the campaign",
		field: { kind: "choice", key: "campaignId", options: [] },
	},
	{
		id: "marketing.inCampaign",
		group: "Marketing",
		label: "Is walking the campaign",
		field: { kind: "choice", key: "campaignId", options: [] },
	},
];

const CAMPAIGN_FACETS = new Set([
	"marketing.openedCampaign",
	"marketing.clickedCampaign",
	"marketing.inCampaign",
]);

export const TEXT_FIELD_TYPES = new Set([
	"TEXT",
	"LONG_TEXT",
	"URL",
	"EMAIL",
	"PHONE",
]);

type Facet = Record<string, unknown> & { facet: string };

export const UNSUPPORTED_RULE = {
	nested: "a group inside a group",
	negated: "a not around a whole group",
	unreadable: "a rule it cannot read",
} as const;

const UNSUPPORTED_LABELS: string[] = Object.values(UNSUPPORTED_RULE);

const WHOLE_NUMBER = /^-?\d+$/;

export type RuleProblem = { ruleId: string; message: string };

type RuleResult = { facet: Facet } | { message: string };

function unitOf(field: FacetSpec["field"]): string {
	return field.kind === "number" && field.suffix ? field.suffix : "";
}

function checkRule(rule: RuleRow): RuleResult {
	const spec = FACETS.find((facet) => facet.id === rule.facet);

	if (!spec) {
		const what = UNSUPPORTED_LABELS.includes(rule.facet)
			? rule.facet
			: `"${rule.facet}"`;

		return {
			message: `This editor cannot show ${what}, so it will not write these rules. Remove that rule to edit them here, or ask the co-pilot to change them.`,
		};
	}

	if (spec.field.kind === "none") return { facet: { facet: rule.facet } };

	const raw = rule.value.trim();
	if (raw === "") return { message: `${spec.label} needs a value.` };

	const overLimit = (candidate: string) =>
		candidate.length > FACET_LIMITS.text.max;
	const tooLong = {
		message: `${spec.label} takes up to ${FACET_LIMITS.text.max} characters.`,
	};

	if (spec.field.kind === "list") {
		const items = raw
			.split(spec.field.separator)
			.map((item) => item.trim())
			.filter(Boolean);

		if (items.length === 0) return { message: `${spec.label} needs a value.` };
		if (items.some(overLimit)) {
			return {
				message: `${spec.label} takes up to ${FACET_LIMITS.text.max} characters per entry.`,
			};
		}

		return { facet: { facet: rule.facet, [spec.field.key]: items } };
	}

	if (spec.field.kind === "pair") {
		const extra = (rule.extra ?? "").trim();
		if (extra === "") return { message: `${spec.label} needs a value.` };
		if (overLimit(raw) || overLimit(extra)) return tooLong;

		return {
			facet: {
				facet: rule.facet,
				[spec.field.key]: raw,
				[spec.field.extraKey]: extra,
			},
		};
	}

	if (spec.field.kind === "number") {
		const unit = unitOf(spec.field);

		if (!WHOLE_NUMBER.test(raw)) {
			return {
				message: `${spec.label} takes a whole number${unit ? ` of ${unit}` : ""}.`,
			};
		}

		const days = Number(raw);
		if (days < FACET_LIMITS.days.min || days > FACET_LIMITS.days.max) {
			return {
				message: `${spec.label} takes ${FACET_LIMITS.days.min} to ${FACET_LIMITS.days.max}${unit ? ` ${unit}` : ""}.`,
			};
		}

		return { facet: { facet: rule.facet, [spec.field.key]: days } };
	}

	if (spec.field.kind === "choice") {
		const options = spec.field.options;

		if (options.length > 0 && !options.some((option) => option.value === raw)) {
			return { message: `${spec.label} needs a choice from its list.` };
		}

		return { facet: { facet: rule.facet, [spec.field.key]: raw } };
	}

	if (overLimit(raw)) return tooLong;

	return { facet: { facet: rule.facet, [spec.field.key]: raw } };
}

export function ruleProblems(value: RuleTreeValue): RuleProblem[] {
	return value.rules.flatMap((rule) => {
		const result = checkRule(rule);
		return "message" in result
			? [{ ruleId: rule.id, message: result.message }]
			: [];
	});
}

function wrap(
	facet: Facet,
	negate: boolean | undefined,
): Record<string, unknown> {
	return negate ? { not: { facet } } : { facet };
}

export function toDefinition(
	value: RuleTreeValue,
): Record<string, unknown> | null {
	const terms = value.rules.flatMap((rule) => {
		const result = checkRule(rule);
		return "facet" in result ? [wrap(result.facet, rule.negate)] : [];
	});

	if (terms.length === 0) return null;
	if (terms.length === 1) return terms[0] as Record<string, unknown>;

	return value.match === "all" ? { all: terms } : { any: terms };
}

export function fromDefinition(definition: unknown): RuleTreeValue {
	if (definition === null || definition === undefined) {
		return { match: "all", rules: [] };
	}

	if (typeof definition !== "object") {
		return {
			match: "all",
			rules: [placeholder(0, UNSUPPORTED_RULE.unreadable)],
		};
	}

	const node = definition as Record<string, unknown>;

	const single = termOf(node, 0);
	if (single) return { match: "all", rules: [single] };

	for (const match of ["all", "any"] as const) {
		const list = node[match];
		if (!Array.isArray(list)) continue;

		return {
			match,
			rules: list.map(
				(entry, index) =>
					termOf(entry, index) ?? placeholder(index, describe(entry)),
			),
		};
	}

	return { match: "all", rules: [placeholder(0, describe(node))] };
}

function termOf(entry: unknown, index: number): RuleRow | null {
	if (!entry || typeof entry !== "object") return null;

	const node = entry as Record<string, unknown>;

	if ("facet" in node) return toRule(node.facet, index);

	if ("not" in node) {
		const inner = node.not;
		if (!inner || typeof inner !== "object" || !("facet" in inner)) return null;

		return {
			...toRule((inner as { facet: unknown }).facet, index),
			negate: true,
		};
	}

	return null;
}

function describe(value: unknown): string {
	if (!value || typeof value !== "object") return UNSUPPORTED_RULE.unreadable;
	if ("not" in value) return UNSUPPORTED_RULE.negated;
	if ("all" in value || "any" in value) return UNSUPPORTED_RULE.nested;
	return UNSUPPORTED_RULE.unreadable;
}

function placeholder(index: number, label: string): RuleRow {
	return { id: `rule-${index}-unsupported`, facet: label, value: "" };
}

function toRule(value: unknown, index: number): RuleRow {
	if (!value || typeof value !== "object") {
		return placeholder(index, UNSUPPORTED_RULE.unreadable);
	}

	const facet = value as Record<string, unknown>;
	const id = typeof facet.facet === "string" ? facet.facet : null;
	if (!id) return placeholder(index, UNSUPPORTED_RULE.unreadable);

	const spec = FACETS.find((candidate) => candidate.id === id);
	const field = spec?.field;
	const raw = field && field.kind !== "none" ? facet[field.key] : null;

	const written =
		field?.kind === "list" && Array.isArray(raw)
			? raw.join(`${field.separator} `)
			: raw === null || raw === undefined
				? ""
				: String(raw);

	const extra = field?.kind === "pair" ? facet[field.extraKey] : undefined;

	return {
		id: `rule-${index}-${id}`,
		facet: id,
		value: written,
		...(extra === null || extra === undefined ? {} : { extra: String(extra) }),
	};
}

export type FacetChoices = {
	owners?: { id: string; name?: string | null; email?: string | null }[];
	campaigns?: { id: string; name: string }[];
	fields?: { key: string; label: string }[];
};

export function facetsWith(choices: FacetChoices): FacetSpec[] {
	const owners = (choices.owners ?? []).map((owner) => ({
		value: owner.id,
		label: owner.name || owner.email || "Somebody",
	}));

	const campaigns = (choices.campaigns ?? []).map((campaign) => ({
		value: campaign.id,
		label: campaign.name,
	}));

	const fields = (choices.fields ?? []).map((field) => ({
		value: field.key,
		label: field.label,
	}));

	return FACETS.map((facet) => {
		if (facet.id === "contact.owner") {
			return {
				...facet,
				field: { kind: "choice" as const, key: "userId", options: owners },
			};
		}

		if (CAMPAIGN_FACETS.has(facet.id)) {
			return {
				...facet,
				field: {
					kind: "choice" as const,
					key: "campaignId",
					options: campaigns,
				},
			};
		}

		if (facet.id === "field.equals") {
			return {
				...facet,
				field: {
					kind: "pair" as const,
					key: "key",
					extraKey: "value",
					options: fields,
					placeholder: "Enterprise",
				},
			};
		}

		return facet;
	});
}

export function facetsWithOwners(
	owners: { id: string; name?: string | null; email?: string | null }[],
): FacetSpec[] {
	return facetsWith({ owners });
}
