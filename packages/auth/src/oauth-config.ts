import { apiUrl, appUrl } from "./env";

const MINUTE_SECONDS = 60;
const DAY_SECONDS = 24 * 60 * MINUTE_SECONDS;

export const OAUTH = {
	issuer: new URL("/api/auth", apiUrl).toString(),
	resource: new URL("/api", apiUrl).toString(),
	loginPage: new URL("/sign-in", appUrl).toString(),
	consentPage: new URL("/oauth/consent", appUrl).toString(),
	accessTokenTtlSeconds: 10 * MINUTE_SECONDS,
	idTokenTtlSeconds: 10 * MINUTE_SECONDS,
	authorizationCodeTtlSeconds: 10 * MINUTE_SECONDS,
	refreshTokenTtlSeconds: 30 * DAY_SECONDS,
	refreshTokenReuseIntervalSeconds: 30,
	scopes: {
		identity: ["openid", "profile", "email", "offline_access"],
		crm: ["crm.read", "crm.write"],
	},
	officialClient: {
		id: "compcrm-flutter",
		name: "CompCRM for Flutter",
		redirectUris: ["ai.trycrm.app:/oauth/callback"],
		postLogoutRedirectUris: ["ai.trycrm.app:/oauth/logout"],
	},
} as const;

export const OAUTH_SCOPES = [
	...OAUTH.scopes.identity,
	...OAUTH.scopes.crm,
] as const;

export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export function isOAuthScope(value: string): value is OAuthScope {
	return (OAUTH_SCOPES as readonly string[]).includes(value);
}
