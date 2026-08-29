import { db } from "@crm/db";
import { auth } from "./auth";
import { OAUTH, OAUTH_SCOPES } from "./oauth-config";

const OFFICIAL_CLIENT_RESOURCE_ID = "compcrm-flutter-resource";

export async function ensureOfficialOAuthClient(): Promise<void> {
	await auth.$context;
	const now = new Date();

	await db.$transaction(async (transaction) => {
		await transaction.oauthClient.upsert({
			where: { clientId: OAUTH.officialClient.id },
			create: {
				id: OAUTH.officialClient.id,
				clientId: OAUTH.officialClient.id,
				clientSecret: null,
				disabled: false,
				skipConsent: true,
				enableEndSession: true,
				scopes: [...OAUTH_SCOPES],
				clientCredentialsScopes: [],
				name: OAUTH.officialClient.name,
				contacts: [],
				redirectUris: [...OAUTH.officialClient.redirectUris],
				postLogoutRedirectUris: [
					...OAUTH.officialClient.postLogoutRedirectUris,
				],
				tokenEndpointAuthMethod: "none",
				applicationType: "native",
				grantTypes: ["authorization_code", "refresh_token"],
				responseTypes: ["code"],
				requirePKCE: true,
				dpopBoundAccessTokens: false,
				createdAt: now,
				updatedAt: now,
			},
			update: {
				clientSecret: null,
				disabled: false,
				skipConsent: true,
				enableEndSession: true,
				scopes: [...OAUTH_SCOPES],
				clientCredentialsScopes: [],
				name: OAUTH.officialClient.name,
				contacts: [],
				redirectUris: [...OAUTH.officialClient.redirectUris],
				postLogoutRedirectUris: [
					...OAUTH.officialClient.postLogoutRedirectUris,
				],
				tokenEndpointAuthMethod: "none",
				applicationType: "native",
				grantTypes: ["authorization_code", "refresh_token"],
				responseTypes: ["code"],
				requirePKCE: true,
				dpopBoundAccessTokens: false,
				updatedAt: now,
			},
		});

		await transaction.oauthClientResource.upsert({
			where: { id: OFFICIAL_CLIENT_RESOURCE_ID },
			create: {
				id: OFFICIAL_CLIENT_RESOURCE_ID,
				clientId: OAUTH.officialClient.id,
				resourceId: OAUTH.resource,
				createdAt: now,
			},
			update: {
				clientId: OAUTH.officialClient.id,
				resourceId: OAUTH.resource,
			},
		});
	});
}
