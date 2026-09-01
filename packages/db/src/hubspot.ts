import { db } from "./client";
import type { HubspotOutcome } from "./generated/prisma/enums";
import { lockIdempotencyKey } from "./idempotency";

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;

export const HUBSPOT = {
	oauth: {
		authorizeUrl: "https://app.hubspot.com/oauth/authorize",
		tokenUrl: "https://api.hubapi.com/oauth/v1/token",
		tokenInfoUrl: "https://api.hubapi.com/oauth/v1/access-tokens",
	},

	api: {
		base: "https://api.hubapi.com",
		version: "v3",
	},

	locks: {
		connection: "hubspot-connection",
		token: "hubspot-token",
	},

	install: {
		staleMs: 5 * MINUTE_MS,
	},

	token: {
		refreshSkewMs: 2 * MINUTE_MS,
		lockWaitMs: 20 * SECOND_MS,
		lockHoldMs: 30 * SECOND_MS,
	},

	stage: {
		wonProbability: 1,
	},

	pipelines: {
		writeWaitMs: 10 * SECOND_MS,
		writeHoldMs: 30 * SECOND_MS,
	},
} as const;

export const HUBSPOT_REVOKED = "BAD_REFRESH_TOKEN";

export function hubspotApiUrl(path: string): string {
	return `${HUBSPOT.api.base}/crm/${HUBSPOT.api.version}/${path}`;
}

export type HubspotConnectionRow = {
	id: string;
	portalId: string;
	portalDomain: string | null;
	refreshToken: string;
	accessToken: string | null;
	accessTokenExpiresAt: Date | null;
	scopes: string;
	installerEmail: string | null;
	lastReadAt: Date | null;
	lastErrorAt: Date | null;
	lastError: string | null;
	revokedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

export async function readHubspotConnection(): Promise<HubspotConnectionRow | null> {
	return db.hubspotConnection.findFirst({ orderBy: { updatedAt: "desc" } });
}

export async function hubspotScopes(): Promise<string[]> {
	const connection = await readHubspotConnection();
	return splitScopes(connection?.scopes);
}

export function splitScopes(scopes: string | null | undefined): string[] {
	return (scopes ?? "")
		.split(/[\s,]+/)
		.map((scope) => scope.trim())
		.filter(Boolean);
}

export async function saveHubspotToken(
	portalId: string,
	token: {
		accessToken: string;
		refreshToken: string;
		expiresInSeconds: number;
	},
): Promise<void> {
	await db.hubspotConnection.update({
		where: { portalId },
		data: {
			accessToken: token.accessToken,
			refreshToken: token.refreshToken,
			accessTokenExpiresAt: new Date(
				Date.now() + token.expiresInSeconds * SECOND_MS,
			),
			lastError: null,
			lastErrorAt: null,
			revokedAt: null,
		},
	});
}

export async function clearHubspotAccessToken(portalId: string): Promise<void> {
	await db.hubspotConnection.update({
		where: { portalId },
		data: { accessToken: null, accessTokenExpiresAt: null },
	});
}

export async function noteHubspotRead(portalId: string): Promise<void> {
	await db.hubspotConnection.update({
		where: { portalId },
		data: { lastReadAt: new Date(), lastError: null, lastErrorAt: null },
	});
}

export async function noteHubspotError(
	portalId: string,
	message: string,
): Promise<void> {
	await db.hubspotConnection.update({
		where: { portalId },
		data: { lastError: message.slice(0, 500), lastErrorAt: new Date() },
	});
}

export async function markHubspotRevoked(
	portalId: string,
	message: string,
): Promise<void> {
	await db.hubspotConnection.update({
		where: { portalId },
		data: {
			revokedAt: new Date(),
			accessToken: null,
			accessTokenExpiresAt: null,
			lastError: message.slice(0, 500),
			lastErrorAt: new Date(),
		},
	});
}

export function tokenIsFresh(connection: HubspotConnectionRow): boolean {
	if (!connection.accessToken || !connection.accessTokenExpiresAt) return false;

	return (
		connection.accessTokenExpiresAt.getTime() - HUBSPOT.token.refreshSkewMs >
		Date.now()
	);
}

export async function withHubspotTokenLock<Result>(
	run: () => Promise<Result>,
): Promise<Result> {
	return db.$transaction(
		async (tx) => {
			await lockIdempotencyKey(tx, HUBSPOT.locks.token);
			return run();
		},
		{
			maxWait: HUBSPOT.token.lockWaitMs,
			timeout: HUBSPOT.token.lockHoldMs,
		},
	);
}

export type HubspotStageRow = {
	id: string;
	label: string;
	pipelineId: string;
	pipelineLabel: string;
	displayOrder: number;
	isClosed: boolean;
	outcome: HubspotOutcome;
};

export function outcomeOfStage(stage: {
	isClosed: boolean;
	probability: number;
}): HubspotOutcome {
	if (!stage.isClosed) return "OPEN";

	return stage.probability >= HUBSPOT.stage.wonProbability ? "WON" : "LOST";
}

export type DealOutcome = "open" | "won" | "lost";

export function dealOutcome(
	properties: Readonly<Record<string, string | null>>,
	stage: { outcome: HubspotOutcome } | null,
): DealOutcome {
	if (properties.hs_is_closed_won === "true") return "won";
	if (properties.hs_is_closed_lost === "true") return "lost";
	if (!stage) return "open";

	if (stage.outcome === "WON") return "won";
	if (stage.outcome === "LOST") return "lost";
	return "open";
}

export async function writeHubspotPipelines(
	pipelines: ReadonlyArray<{
		id: string;
		label: string;
		archived: boolean;
		stages: ReadonlyArray<{
			id: string;
			label: string;
			displayOrder: number;
			isClosed: boolean;
			probability: number;
		}>;
	}>,
): Promise<void> {
	const seen = pipelines.map((pipeline) => pipeline.id);

	await db.$transaction(
		async (tx) => {
			await lockIdempotencyKey(tx, HUBSPOT.locks.connection);

			for (const pipeline of pipelines) {
				const row = {
					label: pipeline.label,
					archived: pipeline.archived,
				};

				await tx.hubspotPipeline.upsert({
					where: { id: pipeline.id },
					create: { id: pipeline.id, ...row },
					update: row,
				});

				for (const stage of pipeline.stages) {
					const values = {
						pipelineId: pipeline.id,
						label: stage.label,
						displayOrder: stage.displayOrder,
						isClosed: stage.isClosed,
						probability: stage.probability,
						outcome: outcomeOfStage(stage),
					};

					await tx.hubspotStage.upsert({
						where: { id: stage.id },
						create: { id: stage.id, ...values },
						update: values,
					});
				}

				await tx.hubspotStage.deleteMany({
					where: {
						pipelineId: pipeline.id,
						id: { notIn: pipeline.stages.map((stage) => stage.id) },
					},
				});
			}

			await tx.hubspotPipeline.deleteMany({ where: { id: { notIn: seen } } });
		},
		{
			maxWait: HUBSPOT.pipelines.writeWaitMs,
			timeout: HUBSPOT.pipelines.writeHoldMs,
		},
	);
}

export async function readHubspotStages(): Promise<HubspotStageRow[]> {
	const stages = await db.hubspotStage.findMany({
		orderBy: [{ pipelineId: "asc" }, { displayOrder: "asc" }],
		select: {
			id: true,
			label: true,
			pipelineId: true,
			displayOrder: true,
			isClosed: true,
			outcome: true,
			pipeline: { select: { label: true } },
		},
	});

	return stages.map(({ pipeline, ...stage }) => ({
		...stage,
		pipelineLabel: pipeline.label,
	}));
}

export async function forgetHubspot(): Promise<void> {
	await db.$transaction(async (tx) => {
		await lockIdempotencyKey(tx, HUBSPOT.locks.connection);
		await tx.hubspotStage.deleteMany({});
		await tx.hubspotPipeline.deleteMany({});
		await tx.hubspotInstall.deleteMany({});
		await tx.hubspotConnection.deleteMany({});
	});
}
