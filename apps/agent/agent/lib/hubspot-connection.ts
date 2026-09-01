import "@crm/env/load";

import {
	clearHubspotAccessToken,
	HUBSPOT,
	HUBSPOT_REVOKED,
	type HubspotConnectionRow,
	markHubspotRevoked,
	noteHubspotError,
	noteHubspotRead,
	readHubspotConnection,
	saveHubspotToken,
	splitScopes,
	tokenIsFresh,
	withHubspotTokenLock,
} from "@crm/db/hubspot";
import { schemas } from "@crm/validation";
import { HUBSPOT_READS } from "./hubspot-config";

export type HubspotFailure = {
	ok: false;
	reason: string;
	revoked: boolean;
	status?: number;
};

export type HubspotSuccess<Body> = { ok: true; body: Body };

export type HubspotResult<Body> = HubspotSuccess<Body> | HubspotFailure;

const credentials = () => {
	const clientId = process.env.HUBSPOT_CLIENT_ID?.trim();
	const clientSecret = process.env.HUBSPOT_CLIENT_SECRET?.trim();
	return clientId && clientSecret ? { clientId, clientSecret } : null;
};

export async function hubspotConnection(): Promise<HubspotConnectionRow | null> {
	const connection = await readHubspotConnection();
	if (!connection || connection.revokedAt) return null;

	return connection;
}

export async function hubspotConnected(): Promise<boolean> {
	return (await hubspotConnection()) !== null;
}

export async function hubspotGrantedScopes(): Promise<string[]> {
	const connection = await hubspotConnection();
	return splitScopes(connection?.scopes);
}

export async function hubspotAccessToken(): Promise<HubspotResult<string>> {
	const connection = await hubspotConnection();
	if (!connection) {
		return {
			ok: false,
			revoked: false,
			reason:
				"HubSpot is not connected on this install. Connect it in Settings → Connections, or work from what the CRM already holds.",
		};
	}

	const fresh = freshToken(connection);
	if (fresh) return { ok: true, body: fresh };

	const oauth = credentials();
	if (!oauth) {
		return {
			ok: false,
			revoked: false,
			reason:
				"This install has no HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET, so the HubSpot token cannot be renewed.",
		};
	}

	return withHubspotTokenLock(async () => {
		const current = await readHubspotConnection();
		if (!current || current.revokedAt) {
			return {
				ok: false as const,
				revoked: true,
				reason: revokedReason(),
			};
		}

		const landed = freshToken(current);
		if (landed) return { ok: true as const, body: landed };

		return refresh(current, oauth);
	});
}

async function refresh(
	connection: HubspotConnectionRow,
	oauth: { clientId: string; clientSecret: string },
): Promise<HubspotResult<string>> {
	let response: Response;

	try {
		response = await fetch(HUBSPOT.oauth.tokenUrl, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "refresh_token",
				client_id: oauth.clientId,
				client_secret: oauth.clientSecret,
				refresh_token: connection.refreshToken,
			}),
			signal: AbortSignal.timeout(HUBSPOT_READS.request.timeoutMs),
		});
	} catch (error) {
		const reason = `HubSpot did not answer the token request: ${message(error)}`;
		await noteHubspotError(connection.portalId, reason);
		return { ok: false, revoked: false, reason };
	}

	const body = await response.json().catch(() => ({}));

	if (!response.ok) {
		const detail = describe(body, response.status);

		if (isRevoked(detail)) {
			await markHubspotRevoked(connection.portalId, detail);
			return { ok: false, revoked: true, reason: revokedReason() };
		}

		const reason = `HubSpot refused to renew the token (${detail}).`;
		await noteHubspotError(connection.portalId, reason);
		return { ok: false, revoked: false, reason };
	}

	const grant = schemas.hubspot.tokenGrant.safeParse(body);
	if (!grant.success) {
		const reason = "HubSpot returned a token this install cannot read.";
		await noteHubspotError(connection.portalId, reason);
		return { ok: false, revoked: false, reason };
	}

	await saveHubspotToken(connection.portalId, {
		accessToken: grant.data.access_token,
		refreshToken: grant.data.refresh_token,
		expiresInSeconds: grant.data.expires_in,
	});

	return { ok: true, body: grant.data.access_token };
}

export async function hubspotGet<Body>(
	url: string,
	parse: (value: unknown) => Body,
): Promise<HubspotResult<Body>> {
	return hubspotRequest(url, { method: "GET" }, parse);
}

export async function hubspotPost<Body>(
	url: string,
	payload: unknown,
	parse: (value: unknown) => Body,
): Promise<HubspotResult<Body>> {
	return hubspotRequest(
		url,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		},
		parse,
	);
}

async function hubspotRequest<Body>(
	url: string,
	init: RequestInit,
	parse: (value: unknown) => Body,
): Promise<HubspotResult<Body>> {
	const token = await hubspotAccessToken();
	if (!token.ok) return token;

	const connection = await hubspotConnection();
	if (!connection) {
		return { ok: false, revoked: true, reason: revokedReason() };
	}

	for (let attempt = 0; attempt <= HUBSPOT_READS.request.retries; attempt++) {
		let response: Response;

		try {
			response = await fetch(url, {
				...init,
				headers: {
					...init.headers,
					authorization: `Bearer ${token.body}`,
				},
				signal: AbortSignal.timeout(HUBSPOT_READS.request.timeoutMs),
			});
		} catch (error) {
			if (attempt < HUBSPOT_READS.request.retries) {
				await wait(HUBSPOT_READS.request.backoffMs * (attempt + 1));
				continue;
			}

			const reason = `HubSpot did not answer: ${message(error)}`;
			await noteHubspotError(connection.portalId, reason);
			return { ok: false, revoked: false, reason };
		}

		if (response.status === 429 || response.status >= 500) {
			if (attempt < HUBSPOT_READS.request.retries) {
				await wait(HUBSPOT_READS.request.backoffMs * (attempt + 1));
				continue;
			}
		}

		const body = await response.json().catch(() => ({}));

		if (!response.ok) {
			const detail = describe(body, response.status);

			if (isRevoked(detail)) {
				await markHubspotRevoked(connection.portalId, detail);
				return { ok: false, revoked: true, reason: revokedReason() };
			}

			if (response.status === 404) {
				return {
					ok: false,
					revoked: false,
					status: 404,
					reason: `HubSpot has no such record (${detail}).`,
				};
			}

			if (response.status === 401) {
				const reason = `HubSpot rejected the token (${detail}). The next read renews it.`;
				await clearHubspotAccessToken(connection.portalId);
				await noteHubspotError(connection.portalId, reason);
				return { ok: false, revoked: false, status: 401, reason };
			}

			if (response.status === 403) {
				const reason = `HubSpot withheld this data (${detail}). The connection is missing a scope; reconnect it in Settings → Connections.`;
				await noteHubspotError(connection.portalId, reason);
				return { ok: false, revoked: false, status: 403, reason };
			}

			const reason = `HubSpot answered ${response.status} (${detail}).`;
			await noteHubspotError(connection.portalId, reason);
			return { ok: false, revoked: false, status: response.status, reason };
		}

		try {
			const parsed = parse(body);
			await noteHubspotRead(connection.portalId);
			return { ok: true, body: parsed };
		} catch (error) {
			const reason = `HubSpot returned a shape this install cannot read: ${message(error)}`;
			await noteHubspotError(connection.portalId, reason);
			return { ok: false, revoked: false, reason };
		}
	}

	const reason = "HubSpot stayed unavailable after every retry.";
	await noteHubspotError(connection.portalId, reason);
	return { ok: false, revoked: false, reason };
}

function freshToken(connection: HubspotConnectionRow): string | null {
	return connection.accessToken && tokenIsFresh(connection)
		? connection.accessToken
		: null;
}

function describe(body: unknown, status: number): string {
	const failure = schemas.hubspot.errorBody.safeParse(body);
	if (!failure.success) return String(status);

	const parts = [failure.data.status, failure.data.message].filter(Boolean);
	return parts.length > 0 ? parts.join(": ") : String(status);
}

function isRevoked(detail: string): boolean {
	return detail.toUpperCase().includes(HUBSPOT_REVOKED);
}

function revokedReason(): string {
	return (
		"HubSpot has revoked this install's access, which happens when somebody removes the app in HubSpot. " +
		"Nothing here can read HubSpot until an owner or an admin reconnects it in Settings → Connections."
	);
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
