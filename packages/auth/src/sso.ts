import { apiUrl } from "./env";
import { isWorkspaceAdmin, type WorkspaceRole } from "./organization";

export function canConfigureSso(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function ssoCallbackBase(): string {
	return `${apiUrl}/api/auth/sso/callback`;
}

export function ssoCallbackURL(providerId: string): string {
	return `${ssoCallbackBase()}/${providerId}`;
}

export function ssoProviderName(providerId: string): string {
	const words = providerId
		.split(/[-_.\s]+/)
		.map((word) => word.trim())
		.filter(Boolean);

	if (words.length === 0) return providerId;

	return words
		.map((word) =>
			word === word.toUpperCase()
				? word
				: word.charAt(0).toUpperCase() + word.slice(1),
		)
		.join(" ");
}
