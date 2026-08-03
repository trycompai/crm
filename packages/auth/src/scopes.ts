export const IDENTITY_SCOPES = ["openid", "email", "profile"] as const;

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const CALENDAR_SCOPE =
	"https://www.googleapis.com/auth/calendar.readonly";

export const SYNC_SCOPES = [GMAIL_SCOPE, CALENDAR_SCOPE] as const;

export const REQUIRED_SCOPES = [...IDENTITY_SCOPES, ...SYNC_SCOPES] as const;
export const OUTREACH_SCOPES = [...SYNC_SCOPES, GMAIL_SEND_SCOPE] as const;

export function hasSyncScopes(scope: string | null | undefined): boolean {
	const granted = parseScopes(scope);
	return SYNC_SCOPES.every((needed) => granted.has(needed));
}

export function parseScopes(scope: string | null | undefined): Set<string> {
	return new Set(
		(scope ?? "")
			.split(/[,\s]+/)
			.map((entry) => entry.trim())
			.filter(Boolean),
	);
}
