import type {
	EmailDraftStatus,
	EnrichmentStatus,
	ProspectRouteStatus,
	ProspectStatus,
} from "@crm/db";

const CURRENT_JOB_DAYS = 120;
const SUPPORTED_COUNTRIES = new Set(["AU", "GB", "US"]);
const GENERIC_PREFIXES = new Set([
	"admin",
	"contact",
	"enquiries",
	"enquiry",
	"hello",
	"info",
	"office",
	"sales",
	"support",
	"team",
]);
const PERSONAL_DOMAINS = new Set([
	"gmail.com",
	"googlemail.com",
	"hotmail.com",
	"outlook.com",
	"yahoo.com",
	"icloud.com",
	"aol.com",
	"proton.me",
	"protonmail.com",
]);
const RESEARCH_GATE_KEYS = [
	"freshness",
	"currentJobEvidence",
	"namedPerson",
	"verifiedRoute",
] as const satisfies ProspectReadinessGateKey[];

export type ProspectReadinessGateKey =
	| "freshness"
	| "currentJobEvidence"
	| "namedPerson"
	| "verifiedRoute"
	| "jurisdictionPolicy"
	| "draftBasis"
	| "crmHandoff"
	| "operatorPermission"
	| "abcDrafts"
	| "providerExecution";

export type ProspectReadinessGate = {
	key: ProspectReadinessGateKey;
	label: string;
	passed: boolean;
	detail: string;
	action:
		| "research"
		| "reviewEvidence"
		| "reviewDraft"
		| "approveRoute"
		| "prepareSequence"
		| "approveSequence"
		| "none";
};

export type ProspectReadinessState =
	| "research_needed"
	| "crm_handoff_needed"
	| "permission_needed"
	| "sequence_needed"
	| "execution_disabled"
	| "send_eligible";

export type ProspectReadiness = {
	state: ProspectReadinessState;
	summary: string;
	sendEligible: boolean;
	passed: number;
	total: number;
	gates: ProspectReadinessGate[];
	gaps: ProspectReadinessGate[];
	currentJobUrl: string | null;
	currentJobSignalDate: string | null;
	sequence: {
		id: string | null;
		activeDrafts: number;
		pendingApproval: number;
		approvedOrSending: number;
		sent: number;
		rejected: number;
	};
	actions: {
		canResearch: boolean;
		canReviewDraft: boolean;
		canApproveRoute: boolean;
		canPrepareSequence: boolean;
		canApproveSequence: boolean;
		executionDisabledReason: string | null;
	};
};

type ProspectReadinessEvidence = {
	receiptId: string | null;
	sourceType: string;
	url: string;
	signalDate: Date | null;
	observed: string | null;
};

type ProspectReadinessDraft = {
	sequenceId: string | null;
	sequenceStep: number | null;
	status: EmailDraftStatus;
};

export type ProspectReadinessInput = {
	id: string;
	status: ProspectStatus;
	routeStatus: ProspectRouteStatus;
	enrichmentStatus: EnrichmentStatus;
	countryCode: string;
	website: string | null;
	namedPerson: string | null;
	role: string | null;
	personSourceUrl: string | null;
	routeEmail: string | null;
	emailAllowed: boolean;
	companyId: string | null;
	contactId: string | null;
	draftSubject: string | null;
	draftBody: string | null;
	lastResearchedAt: Date | null;
	nextResearchAt: Date | null;
	queued: boolean;
	evidence: ProspectReadinessEvidence[];
	emailDrafts: ProspectReadinessDraft[];
};

export type ProspectReadinessContext = {
	now?: Date;
	sendingPaused: boolean;
	agentMailReady: boolean;
	routeSuppressed: boolean;
};

export function buildProspectReadiness(
	prospect: ProspectReadinessInput,
	context: ProspectReadinessContext,
): ProspectReadiness {
	const now = context.now ?? new Date();
	const retainedEvidence = prospect.evidence.filter(
		(item) => item.receiptId && item.observed?.trim(),
	);
	const currentJob = retainedEvidence.find(
		(item) =>
			item.sourceType === "OFFICIAL_JOB_POSTING" &&
			item.signalDate !== null &&
			item.signalDate.getTime() >=
				now.getTime() - CURRENT_JOB_DAYS * 24 * 60 * 60 * 1_000 &&
			item.signalDate.getTime() <= now.getTime() &&
			domainOf(item.url) === domainOf(prospect.website),
	);
	const personObserved = retainedEvidence.some((item) => {
		if (item.url !== prospect.personSourceUrl) return false;
		const observed = item.observed?.toLowerCase() ?? "";
		return Boolean(
			prospect.namedPerson &&
				prospect.role &&
				observed.includes(prospect.namedPerson.toLowerCase()) &&
				observed.includes(prospect.role.toLowerCase()),
		);
	});
	const routeEmail = prospect.routeEmail?.trim().toLowerCase() ?? null;
	const routeObserved = Boolean(
		routeEmail &&
			retainedEvidence.some((item) =>
				(item.observed?.toLowerCase() ?? "").includes(routeEmail),
			),
	);
	const routeDirect = isPublicDirectWorkEmail(routeEmail, prospect.website);
	const routeStatusReady = [
		"DIRECT_ROUTE_REVIEW",
		"SEND_READY_REVIEW",
	].includes(prospect.routeStatus);
	const initialDraft = Boolean(
		prospect.draftSubject?.trim() && prospect.draftBody?.trim(),
	);
	const sequence = sequenceSummary(prospect.emailDrafts);
	const draftBasis = initialDraft || sequence.activeDrafts > 0;
	const crmHandoff = Boolean(
		prospect.status === "PROMOTED" && prospect.companyId && prospect.contactId,
	);
	const permission = Boolean(
		prospect.emailAllowed && prospect.routeStatus === "SEND_READY_REVIEW",
	);
	const fresh = Boolean(
		prospect.enrichmentStatus === "COMPLETE" &&
			prospect.lastResearchedAt &&
			(!prospect.nextResearchAt || prospect.nextResearchAt > now),
	);
	const supportedCountry = SUPPORTED_COUNTRIES.has(prospect.countryCode);
	const providerReady = !context.sendingPaused && context.agentMailReady;
	const verifiedRoute = Boolean(
		routeEmail && routeStatusReady && routeDirect && routeObserved,
	);
	const gates: ProspectReadinessGate[] = [
		gate(
			"freshness",
			"Fresh research",
			fresh,
			freshDetail(prospect, now),
			"research",
		),
		gate(
			"currentJobEvidence",
			"Current official job",
			Boolean(currentJob),
			currentJob
				? `Verified ${dateLabel(currentJob.signalDate)}`
				: "No dated company-domain posting from the last 120 days",
			"research",
		),
		gate(
			"namedPerson",
			"Named person and role",
			Boolean(prospect.namedPerson && prospect.role && personObserved),
			prospect.namedPerson && prospect.role
				? personObserved
					? `${prospect.namedPerson}, ${prospect.role}`
					: "Named person exists but retained evidence must support it"
				: "Named person, role or public source is missing",
			"research",
		),
		gate(
			"verifiedRoute",
			"Verified public work route",
			verifiedRoute,
			routeDetail(prospect, routeDirect, routeObserved),
			"research",
		),
		gate(
			"jurisdictionPolicy",
			"Jurisdiction and policy",
			supportedCountry && !context.routeSuppressed,
			!supportedCountry
				? `Unsupported market ${prospect.countryCode}`
				: context.routeSuppressed
					? "Route or domain is suppressed"
					: `${prospect.countryCode} policy route is clear`,
			"reviewEvidence",
		),
		gate(
			"draftBasis",
			"Reviewable draft basis",
			draftBasis,
			initialDraft
				? "Research draft is retained"
				: sequence.activeDrafts > 0
					? "A/B/C drafts are retained"
					: "No retained draft proposal",
			"reviewDraft",
		),
		gate(
			"crmHandoff",
			"CRM account and contact",
			crmHandoff,
			crmHandoff
				? "Company and contact are linked"
				: "Promotion must create or link the company and contact first",
			"reviewEvidence",
		),
		gate(
			"operatorPermission",
			"Operator route permission",
			permission,
			permission
				? "Exact route has human permission"
				: "Route needs explicit human approval before sequence work",
			"approveRoute",
		),
		gate(
			"abcDrafts",
			"A/B/C sequence drafts",
			sequence.activeDrafts === 3,
			sequence.activeDrafts === 3
				? "Three review-only steps are retained"
				: `${sequence.activeDrafts}/3 review-only steps retained`,
			"prepareSequence",
		),
		gate(
			"providerExecution",
			"Provider execution",
			providerReady,
			context.sendingPaused
				? "Provider or outreach sends are paused"
				: context.agentMailReady
					? "AgentMail execution is available"
					: "AgentMail is unavailable",
			"approveSequence",
		),
	];
	const gaps = gates.filter((item) => !item.passed);
	const sendEligible = gaps.length === 0;
	const state = readinessState(gates, sendEligible);
	const canResearch = Boolean(
		!prospect.queued &&
			prospect.status !== "PROMOTED" &&
			prospect.status !== "DISQUALIFIED" &&
			RESEARCH_GATE_KEYS.some((key) => !gatePassed(gates, key)),
	);
	const canApproveRoute = Boolean(
		!prospect.emailAllowed &&
			gatePassed(gates, "currentJobEvidence") &&
			gatePassed(gates, "namedPerson") &&
			gatePassed(gates, "verifiedRoute") &&
			gatePassed(gates, "jurisdictionPolicy") &&
			crmHandoff,
	);
	const canPrepareSequence = Boolean(
		permission &&
			crmHandoff &&
			context.agentMailReady &&
			sequence.activeDrafts === 0,
	);
	const canApproveSequence = Boolean(
		permission && crmHandoff && sequence.pendingApproval === 3 && providerReady,
	);

	return {
		state,
		summary: sendEligible
			? "Ready for approved execution"
			: (gaps[0]?.detail ?? "Review required"),
		sendEligible,
		passed: gates.length - gaps.length,
		total: gates.length,
		gates,
		gaps,
		currentJobUrl: currentJob?.url ?? null,
		currentJobSignalDate: currentJob?.signalDate?.toISOString() ?? null,
		sequence,
		actions: {
			canResearch,
			canReviewDraft: draftBasis,
			canApproveRoute,
			canPrepareSequence,
			canApproveSequence,
			executionDisabledReason: providerReady
				? null
				: context.sendingPaused
					? "Provider or outreach sends are paused."
					: "AgentMail is unavailable.",
		},
	};
}

function gate(
	key: ProspectReadinessGateKey,
	label: string,
	passed: boolean,
	detail: string,
	action: ProspectReadinessGate["action"],
): ProspectReadinessGate {
	return { key, label, passed, detail, action };
}

function gatePassed(
	gates: ProspectReadinessGate[],
	key: ProspectReadinessGateKey,
): boolean {
	return gates.some((item) => item.key === key && item.passed);
}

function readinessState(
	gates: ProspectReadinessGate[],
	sendEligible: boolean,
): ProspectReadinessState {
	if (sendEligible) return "send_eligible";
	if (RESEARCH_GATE_KEYS.some((key) => !gatePassed(gates, key))) {
		return "research_needed";
	}
	if (!gatePassed(gates, "crmHandoff")) return "crm_handoff_needed";
	if (!gatePassed(gates, "operatorPermission")) return "permission_needed";
	if (!gatePassed(gates, "abcDrafts")) return "sequence_needed";
	return "execution_disabled";
}

function sequenceSummary(drafts: ProspectReadinessDraft[]) {
	const active = drafts.filter(
		(draft) => draft.sequenceId && draft.status !== "REJECTED",
	);
	const sequenceId = active[0]?.sequenceId ?? null;
	const scoped = sequenceId
		? active.filter((draft) => draft.sequenceId === sequenceId)
		: active;

	return {
		id: sequenceId,
		activeDrafts: new Set(scoped.map((draft) => draft.sequenceStep)).size,
		pendingApproval: scoped.filter(
			(draft) => draft.status === "PENDING_APPROVAL",
		).length,
		approvedOrSending: scoped.filter((draft) =>
			["APPROVED", "SENDING"].includes(draft.status),
		).length,
		sent: scoped.filter((draft) => draft.status === "SENT").length,
		rejected: drafts.filter((draft) => draft.status === "REJECTED").length,
	};
}

function freshDetail(
	prospect: Pick<
		ProspectReadinessInput,
		"queued" | "enrichmentStatus" | "lastResearchedAt" | "nextResearchAt"
	>,
	now: Date,
): string {
	if (prospect.queued) return "Research is already queued";
	if (prospect.enrichmentStatus !== "COMPLETE")
		return "Research is not complete";
	if (!prospect.lastResearchedAt) return "No completed research timestamp";
	if (prospect.nextResearchAt && prospect.nextResearchAt <= now) {
		return "Research is due for refresh";
	}
	return `Last researched ${dateLabel(prospect.lastResearchedAt)}`;
}

function routeDetail(
	prospect: Pick<
		ProspectReadinessInput,
		"routeEmail" | "website" | "routeStatus"
	>,
	routeDirect: boolean,
	routeObserved: boolean,
): string {
	if (!prospect.routeEmail) return "No public work email route retained";
	if (!routeDirect) return "Route must be a named company-domain work email";
	if (!routeObserved) return "Exact route must appear in retained evidence";
	if (
		!["DIRECT_ROUTE_REVIEW", "SEND_READY_REVIEW"].includes(prospect.routeStatus)
	) {
		return "Route status is not ready for human review";
	}
	return prospect.routeEmail;
}

function isPublicDirectWorkEmail(
	email: string | null,
	website: string | null,
): boolean {
	if (!email) return false;
	const [local, domain] = email.trim().toLowerCase().split("@");
	if (!local || !domain) return false;
	if (GENERIC_PREFIXES.has(local) || PERSONAL_DOMAINS.has(domain)) return false;
	return domainOf(website) === domain;
}

function domainOf(value: string | null): string | null {
	if (!value) return null;
	try {
		return new URL(value.includes("://") ? value : `https://${value}`).hostname
			.toLowerCase()
			.replace(/^www\./, "");
	} catch {
		return null;
	}
}

function dateLabel(value: Date | null): string {
	return value ? value.toISOString().slice(0, 10) : "undated";
}
