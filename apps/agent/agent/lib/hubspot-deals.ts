import { db } from "@crm/db";
import {
	type DealOutcome,
	dealOutcome,
	type HubspotStageRow,
	hubspotApiUrl,
	readHubspotStages,
	writeHubspotPipelines,
} from "@crm/db/hubspot";
import type { DealRecord } from "@crm/validation";
import { schemas } from "@crm/validation";
import { HUBSPOT_READS } from "./hubspot-config";
import {
	type HubspotResult,
	hubspotConnection,
	hubspotGet,
	hubspotPost,
} from "./hubspot-connection";

export type { DealOutcome };

export type HubspotDeal = {
	id: string;
	name: string;
	outcome: DealOutcome;
	stage: { id: string; label: string | null };
	pipeline: { id: string; label: string | null };
	amount: number | null;
	currency: string | null;
	closeDate: string | null;
	closedReason: string | null;
	ownerId: string | null;
	lastModifiedAt: string | null;
};

export type HubspotDealsPage = {
	deals: HubspotDeal[];
	nextCursor: string | null;
	hasMore: boolean;
	reachedCeiling: boolean;
};

export async function refreshHubspotPipelines(): Promise<
	HubspotResult<HubspotStageRow[]>
> {
	const page = await hubspotGet(hubspotApiUrl("pipelines/deals"), (value) =>
		schemas.hubspot.pipelinesPage.parse(value),
	);
	if (!page.ok) return page;

	await writeHubspotPipelines(
		page.body.results.map((pipeline) => ({
			id: pipeline.id,
			label: pipeline.label,
			archived: pipeline.archived,
			stages: pipeline.stages.map((stage) => ({
				id: stage.id,
				label: stage.label,
				displayOrder: stage.displayOrder,
				isClosed: stage.metadata.isClosed,
				probability: stage.metadata.probability,
			})),
		})),
	);

	return { ok: true, body: await readHubspotStages() };
}

export async function hubspotStages(): Promise<
	HubspotResult<HubspotStageRow[]>
> {
	const [stages, freshest] = await Promise.all([
		readHubspotStages(),
		db.hubspotStage.findFirst({
			orderBy: { updatedAt: "desc" },
			select: { updatedAt: true },
		}),
	]);

	const stale =
		!freshest ||
		Date.now() - freshest.updatedAt.getTime() > HUBSPOT_READS.pipelines.staleMs;

	if (!stale) return { ok: true, body: stages };

	const refreshed = await refreshHubspotPipelines();
	if (refreshed.ok) return refreshed;

	return stages.length > 0 ? { ok: true, body: stages } : refreshed;
}

export async function listHubspotDeals(input: {
	status: DealOutcome | "all";
	pipelineId?: string;
	modifiedSince?: string;
	limit: number;
	cursor?: string;
}): Promise<HubspotResult<HubspotDealsPage>> {
	const stages = await hubspotStages();
	if (!stages.ok) return stages;

	const filters: Array<Record<string, unknown>> = [];

	if (input.pipelineId) {
		filters.push({
			propertyName: "pipeline",
			operator: "EQ",
			value: input.pipelineId,
		});
	}

	if (input.modifiedSince) {
		filters.push({
			propertyName: "hs_lastmodifieddate",
			operator: "GTE",
			value: input.modifiedSince,
		});
	}

	const stageFilter = stageIdsFor(input.status, stages.body, input.pipelineId);
	if (stageFilter) {
		if (stageFilter.length === 0) {
			return {
				ok: true,
				body: {
					deals: [],
					nextCursor: null,
					hasMore: false,
					reachedCeiling: false,
				},
			};
		}

		filters.push({
			propertyName: "dealstage",
			operator: "IN",
			values: stageFilter,
		});
	}

	const limit = Math.min(input.limit, HUBSPOT_READS.deals.maxPageSize);

	const page = await hubspotPost(
		hubspotApiUrl("objects/deals/search"),
		{
			filterGroups: filters.length > 0 ? [{ filters }] : [],
			sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
			properties: [...HUBSPOT_READS.deals.properties],
			limit,
			...(input.cursor ? { after: input.cursor } : {}),
		},
		(value) => schemas.hubspot.dealsPage.parse(value),
	);
	if (!page.ok) return page;

	const nextCursor = page.body.paging?.next?.after ?? null;
	const reachedCeiling =
		nextCursor !== null &&
		Number(nextCursor) >= HUBSPOT_READS.search.resultCeiling;

	return {
		ok: true,
		body: {
			deals: page.body.results.map((record) =>
				toDeal(record, byStageId(stages.body)),
			),
			nextCursor: reachedCeiling ? null : nextCursor,
			hasMore: nextCursor !== null && !reachedCeiling,
			reachedCeiling,
		},
	};
}

export async function readHubspotDeal(
	id: string,
): Promise<HubspotResult<HubspotDeal | null>> {
	const stages = await hubspotStages();
	if (!stages.ok) return stages;

	const properties = HUBSPOT_READS.deals.properties.join(",");
	const record = await hubspotGet(
		`${hubspotApiUrl(`objects/deals/${encodeURIComponent(id)}`)}?properties=${properties}`,
		(value) => schemas.hubspot.dealRecord.parse(value),
	);
	if (!record.ok) {
		return record.status === 404 ? { ok: true, body: null } : record;
	}

	return { ok: true, body: toDeal(record.body, byStageId(stages.body)) };
}

export async function hubspotPipelineSummary(): Promise<
	HubspotResult<
		Array<{
			id: string;
			label: string;
			stages: Array<{ id: string; label: string; outcome: DealOutcome }>;
		}>
	>
> {
	const stages = await hubspotStages();
	if (!stages.ok) return stages;

	const byPipeline = new Map<
		string,
		{
			id: string;
			label: string;
			stages: Array<{ id: string; label: string; outcome: DealOutcome }>;
		}
	>();

	for (const stage of stages.body) {
		const pipeline = byPipeline.get(stage.pipelineId) ?? {
			id: stage.pipelineId,
			label: stage.pipelineLabel,
			stages: [],
		};

		pipeline.stages.push({
			id: stage.id,
			label: stage.label,
			outcome: outcomeOf(stage.outcome),
		});

		byPipeline.set(stage.pipelineId, pipeline);
	}

	return { ok: true, body: [...byPipeline.values()] };
}

export async function hubspotPortal(): Promise<{
	portalId: string;
	portalDomain: string | null;
} | null> {
	const connection = await hubspotConnection();
	if (!connection) return null;

	return {
		portalId: connection.portalId,
		portalDomain: connection.portalDomain,
	};
}

function byStageId(stages: readonly HubspotStageRow[]) {
	return new Map(stages.map((stage) => [stage.id, stage]));
}

function stageIdsFor(
	status: DealOutcome | "all",
	stages: readonly HubspotStageRow[],
	pipelineId?: string,
): string[] | null {
	if (status === "all") return null;

	const wanted = status.toUpperCase();
	return stages
		.filter((stage) => stage.outcome === wanted)
		.filter((stage) => !pipelineId || stage.pipelineId === pipelineId)
		.map((stage) => stage.id);
}

function outcomeOf(stored: HubspotStageRow["outcome"]): DealOutcome {
	if (stored === "WON") return "won";
	if (stored === "LOST") return "lost";
	return "open";
}

function toDeal(
	record: DealRecord,
	stages: Map<string, HubspotStageRow>,
): HubspotDeal {
	const property = (name: string) => record.properties[name] ?? null;

	const stageId = property("dealstage") ?? "";
	const stage = stages.get(stageId) ?? null;

	const outcome = dealOutcome(record.properties, stage);

	const amount = property("amount");

	return {
		id: record.id,
		name: property("dealname") ?? "Untitled deal",
		outcome,
		stage: { id: stageId, label: stage?.label ?? null },
		pipeline: {
			id: property("pipeline") ?? stage?.pipelineId ?? "",
			label: stage?.pipelineLabel ?? null,
		},
		amount: amount === null || amount === "" ? null : Number(amount),
		currency: property("deal_currency_code"),
		closeDate: property("closedate"),
		closedReason:
			outcome === "won"
				? property("closed_won_reason")
				: outcome === "lost"
					? property("closed_lost_reason")
					: null,
		ownerId: property("hubspot_owner_id"),
		lastModifiedAt: property("hs_lastmodifieddate") ?? record.updatedAt ?? null,
	};
}
