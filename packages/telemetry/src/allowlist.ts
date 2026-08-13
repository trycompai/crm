import { TASK_KINDS } from "@crm/db/agent-tasks";

export const ALLOWED_PROPERTIES = [
	"crm_version",
	"git_commit_sha",
	"days_since_install",
	"is_vercel",
	"node_version",
	"postgres_version",
	"seed_only",

	"cap_rapidapi",
	"cap_perplexity",
	"cap_context_dev",
	"cap_blob",
	"cap_github",
	"cap_redis",
	"cap_agent_bridge",
	"cap_cron_secret",
	"cap_ai_gateway",
	"cap_google_oauth",
	"cap_sso_provider",
	"cap_tracking",
	"is_marketing",
	"agent_model_id",
	"agent_model_context_window",
	"members_bucket",

	"tool_calls",
	"tool_calls_total",
	"tool_errors",
	"sessions_started",
	"sessions_completed",
	"sessions_failed",
	"tools_per_session_mean",
	"tasks_claimed",
	"tasks_completed",
	"tasks_retired",
	"task_attempts_mean",
	"task_attempts_max",
	"budget_exhausted",
	"recheck_scheduled",
	"recheck_interval_days",
	"sandbox_used",
	"agent_conversations",

	"facts_by_status",
	"facts_by_band",
	"facts_by_method",
	"facts_by_evidence_kind",
	"fact_dismissal_rate",
	"fact_decision_median_hours",
	"facts_superseded_within_7_days",

	"contacts_bucket",
	"companies_bucket",
	"deals_bucket",
	"activities_bucket",
	"contacts_by_source",
	"companies_by_source",
	"deals_by_stage",
	"activities_by_type",
	"mailbox_sync_configured",
	"mailbox_sync_status",
	"threads_ingested",
	"messages_ingested",
	"enrichment_by_status",
	"suppressed_domains",
	"suppressed_contacts",
	"tracking_domains",
	"tracking_page_views",
	"tracking_forms",
	"tracking_contacts_created",
	"tracking_capped",
	"tracking_paused",
	"workspace_profile_written",

	"cap_email_resend",
	"marketing_onboarded",
	"marketing_domain_verified",
	"marketing_templates",
	"marketing_segments",
	"marketing_segments_dynamic",
	"marketing_segments_with_manual_members",
	"marketing_campaigns_by_status",
	"marketing_blasts",
	"marketing_drips",
	"marketing_drip_nodes_max",
	"marketing_drips_with_branch",
	"marketing_drips_with_split",
	"marketing_enrolments_by_status",
	"marketing_sends",
	"marketing_delivered",
	"marketing_bounced",
	"marketing_complained",
	"marketing_unsubscribed",
	"marketing_opens",
	"marketing_clicks",
	"marketing_replies",
	"marketing_tracking_opens",
	"marketing_tracking_clicks",
	"marketing_brand_autofilled",
	"marketing_copilot_graphs",

	"error_class",
	"error_source",
	"tool",
	"task_kind",
	"route",
	"status_code",
	"sync_source",
	"model_id",
] as const;

export type AllowedProperty = (typeof ALLOWED_PROPERTIES)[number];

const ALLOWED = new Set<string>(ALLOWED_PROPERTIES);

export type PropertyValue =
	| string
	| number
	| boolean
	| null
	| Record<string, number>;

export type Properties = Partial<Record<AllowedProperty, PropertyValue>>;

export function permitted(
	properties: Record<string, unknown>,
): Record<string, PropertyValue> {
	const kept: Record<string, PropertyValue> = {};

	for (const [name, value] of Object.entries(properties)) {
		if (!ALLOWED.has(name)) continue;
		if (value === undefined) continue;
		kept[name] = value as PropertyValue;
	}

	return kept;
}

export const AGENT_TOOLS = [
	"agent",
	"campaign_stats",
	"create_campaign",
	"enrol_contact",
	"list_segments",
	"list_templates",
	"preview_segment",
	"read_campaign",
	"read_engagement",
	"read_segment",
	"read_template",
	"send_email",
	"write_campaign_graph",
	"write_segment",
	"write_template",
	"archive_field",
	"enrich_company",
	"fetch_contact_photo",
	"find_contact_socials",
	"get_contact_work_history",
	"get_linkedin_profile",
	"identify_contact",
	"list_deals",
	"list_fields",
	"list_outstanding_work",
	"manage_fields",
	"read_company_history",
	"read_crm_history",
	"read_shell",
	"read_deal_history",
	"review_email",
	"record_fact",
	"record_job_change",
	"research_company",
	"research_person",
	"resolve_linkedin_profile",
	"schedule_campaign",
	"schedule_recheck",
	"search_crm",
	"set_chat_title",
	"set_contact_socials",
	"set_field_value",
	"update_node",
	"write_brief",
	"write_shell",
	"write_workspace_profile",
] as const;

export const EVE_TOOLS = [
	"ask_question",
	"bash",
	"connection_search",
	"glob",
	"grep",
	"load_skill",
	"read_file",
	"todo",
	"web_fetch",
	"web_search",
	"write_file",
] as const;

const TOOLS = new Set<string>([...AGENT_TOOLS, ...EVE_TOOLS]);

export const OTHER = "other";

export function permittedTool(name: string | null | undefined): string {
	return name && TOOLS.has(name) ? name : OTHER;
}

export const EVIDENCE_KINDS = [
	"profile.email-match",
	"linkedin.employer-and-name",
	"crm.thread-reply",
	"crm.signature-block",
	"github.account-identity",
	"crm.meeting-attendance",
	"web.cited-claim",
	"handle.name-form",
	"search.cites-profile",
	"employer-only",
	"contradiction",
] as const;

const KINDS = new Set<string>(EVIDENCE_KINDS);

export function permittedEvidenceKind(kind: string | null | undefined): string {
	return kind && KINDS.has(kind) ? kind : OTHER;
}

const METHOD_SHAPE = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

const METHOD_MAX = 40;

export function permittedMethod(method: string | null | undefined): string {
	if (!method) return OTHER;

	const trimmed = method.trim();
	if (trimmed.length > METHOD_MAX) return OTHER;

	return METHOD_SHAPE.test(trimmed) ? trimmed : OTHER;
}

export const ERROR_CLASS_MAX = 64;

const CLASS_SHAPE = /^[A-Za-z][A-Za-z0-9_.-]*$/;

export function permittedErrorClass(value: unknown): string {
	const name = errorName(value);
	if (name.length > ERROR_CLASS_MAX) return OTHER;

	return CLASS_SHAPE.test(name) ? name : OTHER;
}

function errorName(value: unknown): string {
	if (value instanceof Error) return value.name || value.constructor.name;

	if (typeof value === "string") return value;

	if (typeof value === "object" && value !== null && "code" in value) {
		const code = (value as { code: unknown }).code;
		if (typeof code === "string") return code;
	}

	return OTHER;
}

const TASK_KIND_SET = new Set<string>(TASK_KINDS);

export function permittedTaskKind(kind: string | null | undefined): string {
	return kind && TASK_KIND_SET.has(kind) ? kind : OTHER;
}

export const SYNC_SOURCES = ["gmail", "calendar", "outlook"] as const;

export type TelemetrySyncSource = (typeof SYNC_SOURCES)[number];

const SYNC_SOURCE_SET = new Set<string>(SYNC_SOURCES);

export function permittedSyncSource(source: string | null | undefined): string {
	return source && SYNC_SOURCE_SET.has(source) ? source : OTHER;
}

const MAILBOX_SYNC = "mailbox_sync";

const SYNC_ERROR_SOURCES: Record<TelemetrySyncSource, string> = {
	gmail: "google_sync",
	calendar: "google_sync",
	outlook: "microsoft_sync",
};

export function permittedSyncErrorSource(
	source: string | null | undefined,
): string {
	const name = permittedSyncSource(source);

	return name === OTHER
		? MAILBOX_SYNC
		: SYNC_ERROR_SOURCES[name as TelemetrySyncSource];
}

const ROUTE_SHAPE = /^\/[A-Za-z0-9/_:.*-]*$/;

const ROUTE_MAX = 120;

export function permittedRoute(route: string | null | undefined): string {
	if (!route) return OTHER;

	const trimmed = route.trim();
	if (trimmed.length > ROUTE_MAX) return OTHER;

	return ROUTE_SHAPE.test(trimmed) ? trimmed : OTHER;
}

const MODEL_SHAPE = /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/i;

const MODEL_MAX = 80;

export function permittedModelId(model: string | null | undefined): string {
	if (!model) return OTHER;

	const trimmed = model.trim();
	if (trimmed.length > MODEL_MAX) return OTHER;

	return MODEL_SHAPE.test(trimmed) ? trimmed : OTHER;
}

const COUNT_BUCKETS = [
	{ under: 1, label: "0" },
	{ under: 10, label: "1-9" },
	{ under: 50, label: "10-49" },
	{ under: 200, label: "50-199" },
	{ under: 1_000, label: "200-999" },
	{ under: 5_000, label: "1000-4999" },
	{ under: 25_000, label: "5000-24999" },
] as const;

export function bucket(count: number): string {
	for (const step of COUNT_BUCKETS) {
		if (count < step.under) return step.label;
	}

	return "25000+";
}

const DAY_BUCKETS = [
	{ under: 2, label: "0-1" },
	{ under: 8, label: "2-7" },
	{ under: 31, label: "8-30" },
	{ under: 91, label: "31-90" },
	{ under: 181, label: "91-180" },
] as const;

export function dayBucket(days: number): string {
	for (const step of DAY_BUCKETS) {
		if (days < step.under) return step.label;
	}

	return "180+";
}
