import {
	ActivityType,
	type Db,
	DealStage,
	EnrichmentStatus,
	FactBand,
	FactStatus,
	RecordSource,
} from "@crm/db";
import { RETIRED_OUTCOME } from "@crm/db/agent-tasks";
import { readAgentModel } from "@crm/db/settings";
import { CONTACT_CAP_REASON } from "@crm/db/tracking";
import { WORKSPACE_ID } from "@crm/db/workspace";
import {
	bucket,
	claimRollup,
	dayBucket,
	drainCounters,
	installDaily,
	type Properties,
	permittedEvidenceKind,
	permittedMethod,
	permittedTaskKind,
	permittedTool,
	releaseRollup,
	restoreCounters,
	telemetryDisabled,
} from "@crm/telemetry";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { FunnelService } from "./funnel.service";
import { SEED_OWNER_PREFIX } from "./seed";

const WINDOW_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

const SUPERSEDE_WINDOW_DAYS = 7;

const SANDBOX_TOOLS = new Set([
	"bash",
	"glob",
	"grep",
	"read_file",
	"write_file",
]);

type Counted = { key: string; count: number };

export type RollupOutcome = {
	sent: boolean;
	reason?: string;
	milestones: string[];
};

@Injectable()
export class RollupService {
	private readonly logger = new Logger(RollupService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly funnel: FunnelService,
	) {}

	async run(force = false): Promise<RollupOutcome> {
		if (telemetryDisabled()) {
			return { sent: false, reason: "telemetry is off", milestones: [] };
		}

		const milestones = await this.funnel.sweep();

		const now = new Date();
		const claim = await claimRollup(now, force);
		if (!claim.claimed) {
			return { sent: false, reason: claim.reason, milestones };
		}

		const since = new Date(now.getTime() - WINDOW_HOURS * HOUR_MS);
		let counters: Record<string, number> = {};

		try {
			const gathered = await this.gather(since);
			counters = gathered.counters;

			if (!(await installDaily(gathered.properties, now))) {
				await this.giveBack(claim.previous, counters);

				return { sent: false, reason: "not delivered", milestones };
			}

			this.logger.log({
				message: "Telemetry rollup sent",
				windowHours: WINDOW_HOURS,
				milestones: milestones.length,
			});

			return { sent: true, milestones };
		} catch (error) {
			await this.giveBack(claim.previous, counters);

			this.logger.debug({
				message: "Telemetry rollup could not be built",
				reason: error instanceof Error ? error.message : String(error),
			});

			return { sent: false, reason: "failed", milestones };
		}
	}

	private async marketing() {
		const [
			settings,
			templates,
			segments,
			campaigns,
			enrolments,
			sends,
			delivered,
			bounced,
			complained,
			unsubscribed,
			opens,
			clicks,
			replies,
			branchNodes,
			splitNodes,
			manualMembers,
			copilotGraphs,
		] = await Promise.all([
			this.db.appSetting.findFirst({
				select: {
					marketingResendApiKey: true,
					marketingOnboardedAt: true,
					marketingSendingDomain: true,
				},
			}),
			this.db.marketingTemplate.count({ where: { archivedAt: null } }),
			this.db.marketingSegment.groupBy({
				by: ["kind"],
				where: { archivedAt: null },
				_count: { _all: true },
			}),
			this.db.marketingCampaign.groupBy({
				by: ["status", "kind"],
				_count: { _all: true },
			}),
			this.db.marketingEnrolment.groupBy({
				by: ["status"],
				_count: { _all: true },
			}),
			this.db.marketingSend.count({ where: { sentAt: { not: null } } }),
			this.db.marketingSend.count({ where: { status: "DELIVERED" } }),
			this.db.marketingSend.count({ where: { status: "BOUNCED" } }),
			this.db.marketingSend.count({ where: { status: "COMPLAINED" } }),
			this.db.marketingEvent.count({ where: { type: "UNSUBSCRIBED" } }),
			this.db.marketingSend.count({ where: { openedAt: { not: null } } }),
			this.db.marketingSend.count({ where: { clickedAt: { not: null } } }),
			this.db.marketingSend.count({ where: { repliedAt: { not: null } } }),
			this.db.marketingCampaignNode.findMany({
				where: { kind: "BRANCH" },
				select: { campaignId: true },
				distinct: ["campaignId"],
			}),
			this.db.marketingCampaignNode.findMany({
				where: { kind: "SPLIT" },
				select: { campaignId: true },
				distinct: ["campaignId"],
			}),
			this.db.marketingSegmentMember.findMany({
				select: { segmentId: true },
				distinct: ["segmentId"],
			}),
			this.db.agentConversation.count({ where: { campaignId: { not: null } } }),
		]);

		const nodesPerDrip = await this.db.marketingCampaignNode.groupBy({
			by: ["campaignId"],
			_count: { _all: true },
			orderBy: { _count: { campaignId: "desc" } },
			take: 1,
		});

		const dynamic = segments
			.filter((row) => row.kind === "DYNAMIC")
			.reduce((sum, row) => sum + row._count._all, 0);

		return {
			cap_email_resend: settings?.marketingResendApiKey !== null,
			marketing_onboarded: settings?.marketingOnboardedAt !== null,
			marketing_domain_verified: settings?.marketingSendingDomain !== null,
			marketing_templates: templates,
			marketing_segments: segments.reduce(
				(sum, row) => sum + row._count._all,
				0,
			),
			marketing_segments_dynamic: dynamic,
			marketing_segments_with_manual_members: manualMembers.length,
			marketing_campaigns_by_status: merge(
				campaigns.map((row) => ({ key: row.status, count: row._count._all })),
			),
			marketing_blasts: campaigns
				.filter((row) => row.kind === "BLAST")
				.reduce((sum, row) => sum + row._count._all, 0),
			marketing_drips: campaigns
				.filter((row) => row.kind === "DRIP")
				.reduce((sum, row) => sum + row._count._all, 0),
			marketing_drip_nodes_max: nodesPerDrip[0]?._count._all ?? 0,
			marketing_drips_with_branch: branchNodes.length,
			marketing_drips_with_split: splitNodes.length,
			marketing_enrolments_by_status: merge(
				enrolments.map((row) => ({ key: row.status, count: row._count._all })),
			),
			marketing_sends: sends,
			marketing_delivered: delivered,
			marketing_bounced: bounced,
			marketing_complained: complained,
			marketing_unsubscribed: unsubscribed,
			marketing_opens: opens,
			marketing_clicks: clicks,
			marketing_replies: replies,
			marketing_copilot_graphs: copilotGraphs,
		};
	}

	private async giveBack(
		previous: Date | null,
		counters: Record<string, number>,
	): Promise<void> {
		await releaseRollup(previous);
		await restoreCounters(counters);
	}

	private async gather(
		since: Date,
	): Promise<{ properties: Properties; counters: Record<string, number> }> {
		const counters = await drainCounters();

		const [shape, agent, ledger, crm] = await Promise.all([
			this.shape(),
			this.agent(since, counters),
			this.ledger(),
			this.crm(since),
		]);

		return {
			properties: { ...shape, ...agent, ...ledger, ...crm },
			counters,
		};
	}

	private async shape(): Promise<Properties> {
		const [model, members, ssoProviders, postgres, contextKey] =
			await Promise.all([
				readAgentModel(this.db).catch(() => null),
				this.db.member.count({ where: { organizationId: WORKSPACE_ID } }),
				this.db.ssoProvider.count(),
				this.postgresMajor(),
				this.db.appSetting.findFirst({ select: { contextDevApiKey: true } }),
			]);

		return {
			node_version: process.versions.node.split(".")[0] ?? null,
			postgres_version: postgres,
			members_bucket: bucket(members),

			cap_rapidapi: isSet("RAPIDAPI_KEY"),
			cap_perplexity: isSet("PERPLEXITY_API_KEY"),
			cap_context_dev: Boolean(contextKey?.contextDevApiKey?.trim()),
			cap_blob: isSet("BLOB_READ_WRITE_TOKEN"),
			cap_github: isSet("GITHUB_TOKEN"),
			cap_redis: isSet("REDIS_URL"),
			cap_agent_bridge: isSet("AGENT_BRIDGE_SECRET"),
			cap_cron_secret: isSet("CRON_SECRET"),
			cap_ai_gateway: isSet("AI_GATEWAY_API_KEY"),
			cap_google_oauth:
				isSet("GOOGLE_CLIENT_ID") && isSet("GOOGLE_CLIENT_SECRET"),
			cap_sso_provider: ssoProviders > 0,
			is_marketing: process.env.IS_MARKETING === "true",

			agent_model_id: model?.id ?? null,
			agent_model_context_window: model?.contextWindowTokens ?? null,
		};
	}

	private async postgresMajor(): Promise<string | null> {
		try {
			const rows = await this.db.$queryRaw<{ version: string }[]>`
				SELECT current_setting('server_version_num') AS version;
			`;

			const raw = Number(rows[0]?.version);
			if (!Number.isFinite(raw)) return null;

			return String(Math.floor(raw / 10_000));
		} catch {
			return null;
		}
	}

	private async agent(
		since: Date,
		counters: Record<string, number>,
	): Promise<Properties> {
		const [tools, sessions, tasks, attempts, rechecks, conversations] =
			await Promise.all([
				this.toolCalls(since),
				this.sessions(since),
				this.tasks(since),
				this.attempts(since),
				this.rechecks(since),
				this.db.agentConversation.count(),
			]);

		const total = Object.values(tools.calls).reduce((sum, n) => sum + n, 0);

		return {
			tool_calls: tools.calls,
			tool_calls_total: total,
			tool_errors: tools.errors,
			sandbox_used: tools.sandbox,

			sessions_started: sessions.started,
			sessions_completed: sessions.completed,
			sessions_failed: sessions.failed,
			tools_per_session_mean: sessions.withTools
				? round(total / sessions.withTools)
				: 0,

			tasks_claimed: tasks.claimed,
			tasks_completed: tasks.completed,
			tasks_retired: tasks.retired,
			task_attempts_mean: attempts.mean,
			task_attempts_max: attempts.max,

			budget_exhausted: counters.budget_exhausted ?? 0,

			recheck_scheduled: rechecks.total,
			recheck_interval_days: rechecks.buckets,

			agent_conversations: conversations,
		};
	}

	private async toolCalls(since: Date): Promise<{
		calls: Record<string, number>;
		errors: Record<string, number>;
		sandbox: boolean;
	}> {
		const rows = await this.db.$queryRaw<
			{ tool: string | null; failed: boolean; count: bigint }[]
		>`
			SELECT
				"data"->'result'->>'toolName' AS tool,
				COALESCE("data"->>'status', 'completed') <> 'completed' AS failed,
				COUNT(*) AS count
			FROM "agentEvent"
			WHERE "type" = 'action.result' AND "emittedAt" >= ${since}
			GROUP BY 1, 2;
		`;

		const calls: Record<string, number> = {};
		const errors: Record<string, number> = {};
		let sandbox = false;

		for (const row of rows) {
			const tool = permittedTool(row.tool);
			const count = Number(row.count);

			calls[tool] = (calls[tool] ?? 0) + count;
			if (row.failed) errors[tool] = (errors[tool] ?? 0) + count;
			if (SANDBOX_TOOLS.has(tool)) sandbox = true;
		}

		return { calls, errors, sandbox };
	}

	private async sessions(since: Date): Promise<{
		started: number;
		completed: number;
		failed: number;
		withTools: number;
	}> {
		const rows = await this.db.$queryRaw<{ type: string; sessions: bigint }[]>`
			SELECT "type", COUNT(DISTINCT "sessionId") AS sessions
			FROM "agentEvent"
			WHERE "emittedAt" >= ${since}
				AND "type" IN ('session.started', 'session.waiting', 'session.failed', 'action.result')
			GROUP BY 1;
		`;

		const of = (type: string) =>
			Number(rows.find((row) => row.type === type)?.sessions ?? 0);

		return {
			started: of("session.started"),
			completed: of("session.waiting"),
			failed: of("session.failed"),
			withTools: of("action.result"),
		};
	}

	private async tasks(since: Date): Promise<{
		claimed: Record<string, number>;
		completed: Record<string, number>;
		retired: Record<string, number>;
	}> {
		const [claimed, finished] = await Promise.all([
			this.db.agentTask.groupBy({
				by: ["kind"],
				where: { startedAt: { gte: since } },
				_count: { _all: true },
			}),
			this.db.agentTask.groupBy({
				by: ["kind", "outcome"],
				where: { finishedAt: { gte: since } },
				_count: { _all: true },
			}),
		]);

		const completed: Record<string, number> = {};
		const retired: Record<string, number> = {};

		for (const row of finished) {
			const kind = permittedTaskKind(row.kind);
			const into = row.outcome === RETIRED_OUTCOME ? retired : completed;
			into[kind] = (into[kind] ?? 0) + row._count._all;
		}

		return {
			claimed: byKind(
				claimed.map((row) => ({ key: row.kind, count: row._count._all })),
			),
			completed,
			retired,
		};
	}

	private async attempts(
		since: Date,
	): Promise<{ mean: Record<string, number>; max: Record<string, number> }> {
		const rows = await this.db.agentTask.groupBy({
			by: ["kind"],
			where: { finishedAt: { gte: since } },
			_avg: { attempts: true },
			_max: { attempts: true },
		});

		const mean: Record<string, number> = {};
		const max: Record<string, number> = {};

		for (const row of rows) {
			const kind = permittedTaskKind(row.kind);
			mean[kind] = round(row._avg.attempts ?? 0);
			max[kind] = row._max.attempts ?? 0;
		}

		return { mean, max };
	}

	private async rechecks(
		since: Date,
	): Promise<{ total: number; buckets: Record<string, number> }> {
		const rows = await this.db.agentTask.findMany({
			where: { kind: "recheck", createdAt: { gte: since } },
			select: { createdAt: true, dueAt: true },
		});

		const buckets: Record<string, number> = {};

		for (const row of rows) {
			const days = Math.max(
				0,
				(row.dueAt.getTime() - row.createdAt.getTime()) / (24 * HOUR_MS),
			);
			const label = dayBucket(days);
			buckets[label] = (buckets[label] ?? 0) + 1;
		}

		return { total: rows.length, buckets };
	}

	private async ledger(): Promise<Properties> {
		const [byStatus, byBand, methods, kinds, decided, superseded] =
			await Promise.all([
				this.db.contactFact.groupBy({
					by: ["status"],
					_count: { _all: true },
				}),
				this.db.contactFact.groupBy({ by: ["band"], _count: { _all: true } }),
				this.db.contactFact.groupBy({
					by: ["method"],
					_count: { _all: true },
				}),
				this.evidenceKinds(),
				this.decisionHours(),
				this.supersededWithin(SUPERSEDE_WINDOW_DAYS),
			]);

		const statuses = countsOf(
			byStatus.map((row) => ({ key: row.status, count: row._count._all })),
			Object.values(FactStatus),
		);

		const dismissed = statuses[FactStatus.DISMISSED] ?? 0;
		const proposed = statuses[FactStatus.PROPOSED] ?? 0;
		const judged = dismissed + (statuses[FactStatus.APPLIED] ?? 0) + proposed;

		return {
			facts_by_status: statuses,
			facts_by_band: countsOf(
				byBand.map((row) => ({ key: row.band, count: row._count._all })),
				Object.values(FactBand),
			),
			facts_by_method: merge(
				methods.map((row) => ({
					key: permittedMethod(row.method),
					count: row._count._all,
				})),
			),
			facts_by_evidence_kind: kinds,
			fact_dismissal_rate: judged ? round(dismissed / judged) : 0,
			fact_decision_median_hours: decided,
			facts_superseded_within_7_days: superseded,
		};
	}

	private async evidenceKinds(): Promise<Record<string, number>> {
		const rows = await this.db.$queryRaw<{ kind: string; count: bigint }[]>`
			SELECT item->>'kind' AS kind, COUNT(*) AS count
			FROM "contactFact", jsonb_array_elements("evidence") AS item
			WHERE jsonb_typeof("evidence") = 'array'
			GROUP BY 1;
		`;

		return merge(
			rows.map((row) => ({
				key: permittedEvidenceKind(row.kind),
				count: Number(row.count),
			})),
		);
	}

	private async decisionHours(): Promise<number | null> {
		const rows = await this.db.$queryRaw<{ median: number | null }[]>`
			SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
				ORDER BY EXTRACT(EPOCH FROM ("decidedAt" - "observedAt")) / 3600
			) AS median
			FROM "contactFact"
			WHERE "decidedAt" IS NOT NULL;
		`;

		const median = rows[0]?.median;
		return median === null || median === undefined ? null : round(median);
	}

	private async supersededWithin(days: number): Promise<number> {
		const rows = await this.db.$queryRaw<{ count: bigint }[]>`
			SELECT COUNT(*) AS count
			FROM "contactFact"
			WHERE "supersededAt" IS NOT NULL
				AND "supersededAt" - "observedAt" < make_interval(days => ${days});
		`;

		return Number(rows[0]?.count ?? 0);
	}

	private async crm(since: Date): Promise<Properties> {
		const [
			contacts,
			companies,
			deals,
			activities,
			contactSources,
			companySources,
			stages,
			types,
			syncs,
			threads,
			messages,
			enrichment,
			suppressedDomains,
			suppressedContacts,
			workspaceProfile,
			nonSeedContacts,
		] = await Promise.all([
			this.db.contact.count(),
			this.db.company.count(),
			this.db.deal.count(),
			this.db.activity.count(),
			this.db.contact.groupBy({ by: ["source"], _count: { _all: true } }),
			this.db.company.groupBy({ by: ["source"], _count: { _all: true } }),
			this.db.deal.groupBy({ by: ["stage"], _count: { _all: true } }),
			this.db.activity.groupBy({ by: ["type"], _count: { _all: true } }),
			this.db.mailboxSync.groupBy({ by: ["status"], _count: { _all: true } }),
			this.db.emailThread.count({ where: { createdAt: { gte: since } } }),
			this.db.emailMessage.count({ where: { createdAt: { gte: since } } }),
			this.db.company.groupBy({
				by: ["enrichmentStatus"],
				_count: { _all: true },
			}),
			this.db.suppressedDomain.count(),
			this.db.suppressedContact.count(),
			this.db.workspaceProfile.count(),
			this.db.contact.count({
				where: {
					OR: [
						{ ownerId: null },
						{ ownerId: { not: { startsWith: SEED_OWNER_PREFIX } } },
					],
				},
			}),
		]);

		const [
			trackingSite,
			trackingDomains,
			trackingViews,
			trackingForms,
			trackingContacts,
			trackingCapped,
			trackingPaused,
		] = await Promise.all([
			this.db.appSetting.count({ where: { trackingSiteId: { not: null } } }),
			this.db.trackedDomain.count(),
			this.db.trackedEvent.count({
				where: { type: "page_view", occurredAt: { gte: since } },
			}),
			this.db.formSubmission.count({ where: { createdAt: { gte: since } } }),
			this.db.contact.count({
				where: { createdAt: { gte: since }, source: RecordSource.TRACKING },
			}),
			this.db.formSubmission.count({
				where: { createdAt: { gte: since }, skipReason: CONTACT_CAP_REASON },
			}),
			this.db.appSetting.count({ where: { trackingPaused: true } }),
		]);

		const configured = syncs.reduce((sum, row) => sum + row._count._all, 0);
		const marketing = await this.marketing();

		return {
			...marketing,
			seed_only: contacts > 0 && nonSeedContacts === 0,

			contacts_bucket: bucket(contacts),
			companies_bucket: bucket(companies),
			deals_bucket: bucket(deals),
			activities_bucket: bucket(activities),

			contacts_by_source: countsOf(
				contactSources.map((row) => ({
					key: row.source,
					count: row._count._all,
				})),
				Object.values(RecordSource),
			),
			companies_by_source: countsOf(
				companySources.map((row) => ({
					key: row.source,
					count: row._count._all,
				})),
				Object.values(RecordSource),
			),
			deals_by_stage: countsOf(
				stages.map((row) => ({ key: row.stage, count: row._count._all })),
				Object.values(DealStage),
			),
			activities_by_type: countsOf(
				types.map((row) => ({ key: row.type, count: row._count._all })),
				Object.values(ActivityType),
			),

			cap_tracking: trackingSite > 0,
			tracking_domains: bucket(trackingDomains),
			tracking_page_views: trackingViews,
			tracking_forms: trackingForms,
			tracking_contacts_created: trackingContacts,
			tracking_capped: trackingCapped,
			tracking_paused: trackingPaused > 0,

			mailbox_sync_configured: configured > 0,
			mailbox_sync_status: merge(
				syncs.map((row) => ({ key: row.status, count: row._count._all })),
			),
			threads_ingested: threads,
			messages_ingested: messages,

			enrichment_by_status: countsOf(
				enrichment.map((row) => ({
					key: row.enrichmentStatus,
					count: row._count._all,
				})),
				Object.values(EnrichmentStatus),
			),

			suppressed_domains: suppressedDomains,
			suppressed_contacts: suppressedContacts,
			workspace_profile_written: workspaceProfile > 0,
		};
	}
}

function isSet(name: string): boolean {
	return Boolean(process.env[name]?.trim());
}

function byKind(rows: Counted[]): Record<string, number> {
	return merge(
		rows.map((row) => ({ ...row, key: permittedTaskKind(row.key) })),
	);
}

function merge(rows: Counted[]): Record<string, number> {
	const counts: Record<string, number> = {};

	for (const row of rows) {
		counts[row.key] = (counts[row.key] ?? 0) + row.count;
	}

	return counts;
}

function countsOf(
	rows: Counted[],
	keys: readonly string[],
): Record<string, number> {
	const merged = merge(rows);
	const complete: Record<string, number> = {};

	for (const key of keys) complete[key] = merged[key] ?? 0;

	return complete;
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}
