import "@crm/env/load";

const DEFAULT_API_URL = "http://localhost:3001";
const DEFAULT_APP_URL = "http://localhost:3000";

const optional = (key: string): string | undefined => {
	const value = process.env[key];
	return value && value.length > 0 ? value : undefined;
};

const googleCredentials = ():
	| { clientId: string; clientSecret: string }
	| undefined => {
	const clientId = optional("GOOGLE_CLIENT_ID");
	const clientSecret = optional("GOOGLE_CLIENT_SECRET");

	if (!clientId || !clientSecret) {
		if (clientId || clientSecret) {
			throw new Error(
				"GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together.",
			);
		}
		return undefined;
	}

	return { clientId, clientSecret };
};

const apiUrl =
	optional("API_URL") ?? optional("BETTER_AUTH_URL") ?? DEFAULT_API_URL;

const appUrls = (optional("APP_URL") ?? DEFAULT_APP_URL)
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

const appUrl = appUrls[0] ?? DEFAULT_APP_URL;

export const env = {
	appUrl: apiUrl,
	google: googleCredentials(),
	cookieDomain: optional("AUTH_COOKIE_DOMAIN"),
	trustedOrigins: [...new Set([...appUrls, apiUrl])],
	isProduction: process.env.NODE_ENV === "production",
} as const;

export function isGoogleConfigured(): boolean {
	return env.google !== undefined;
}

export { apiUrl, appUrl };
