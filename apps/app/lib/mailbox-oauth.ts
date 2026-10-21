import { authClient } from "@crm/auth/client";
import {
	GOOGLE_PROVIDER_ID,
	type MailboxProviderId,
	MICROSOFT_SYNC_SCOPES,
	SYNC_SCOPES,
	ZOHO_PROVIDER_ID,
} from "@crm/auth/scopes";

type Redirects = {
	callbackURL: string;
	errorCallbackURL: string;
};

type Started = { error?: { message?: string } | null };

/**
 * Google and Microsoft are better-auth social providers; Zoho is a generic
 * OAuth provider, so it goes through `oauth2` rather than `social`/`linkSocial`
 * and takes its scopes from the plugin config instead of the call site.
 *
 * Every mailbox provider is routed through this pair so a fourth one has one
 * obvious place to be added, and so no screen has to know which kind it is.
 */

export async function startMailboxSignIn(
	provider: MailboxProviderId,
	redirects: Redirects,
): Promise<Started> {
	if (provider === ZOHO_PROVIDER_ID) {
		return authClient.signIn.oauth2({
			providerId: ZOHO_PROVIDER_ID,
			...redirects,
		});
	}

	return authClient.signIn.social({ provider, ...redirects });
}

export async function startMailboxGrant(
	provider: MailboxProviderId,
	redirects: Redirects,
): Promise<Started> {
	if (provider === ZOHO_PROVIDER_ID) {
		return authClient.oauth2.link({
			providerId: ZOHO_PROVIDER_ID,
			...redirects,
		});
	}

	return authClient.linkSocial({
		provider,
		scopes: [
			...(provider === GOOGLE_PROVIDER_ID
				? SYNC_SCOPES
				: MICROSOFT_SYNC_SCOPES),
		],
		...redirects,
	});
}
