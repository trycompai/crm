// Zoho is not one deployment: an account lives in exactly one data centre, and
// every host name — accounts, mail API, and the web client a deep link points
// at — carries that data centre's suffix. A token minted in `.com` is rejected
// by `.eu`, so this is not cosmetic. `ZOHO_REGION` names the suffix.

export const ZOHO_REGIONS = [
	"com",
	"eu",
	"in",
	"com.au",
	"jp",
	"ca",
	"sa",
	"com.cn",
] as const;

export type ZohoRegion = (typeof ZOHO_REGIONS)[number];

export const DEFAULT_ZOHO_REGION: ZohoRegion = "com";

export function isZohoRegion(value: string): value is ZohoRegion {
	return (ZOHO_REGIONS as readonly string[]).includes(value);
}

export function toZohoRegion(value: string | undefined): ZohoRegion {
	if (!value) return DEFAULT_ZOHO_REGION;

	const trimmed = value.trim().toLowerCase().replace(/^\./, "");
	if (!isZohoRegion(trimmed)) {
		throw new Error(
			`ZOHO_REGION must be one of ${ZOHO_REGIONS.join(", ")} — got "${value}".`,
		);
	}

	return trimmed;
}

export type ZohoEndpoints = {
	region: ZohoRegion;
	authorizationUrl: string;
	tokenUrl: string;
	revokeUrl: string;
	userInfoUrl: string;
	mailApiBase: string;
	mailWebBase: string;
};

export function zohoEndpoints(region: ZohoRegion): ZohoEndpoints {
	const accounts = `https://accounts.zoho.${region}`;

	return {
		region,
		authorizationUrl: `${accounts}/oauth/v2/auth`,
		tokenUrl: `${accounts}/oauth/v2/token`,
		revokeUrl: `${accounts}/oauth/v2/token/revoke`,
		userInfoUrl: `${accounts}/oauth/user/info`,
		mailApiBase: `https://mail.zoho.${region}/api`,
		mailWebBase: `https://mail.zoho.${region}`,
	};
}
