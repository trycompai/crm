import { apiKey } from "@better-auth/api-key";
import { sso } from "@better-auth/sso";
import { db } from "@crm/db";
import { schemas } from "@crm/validation";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { organization } from "better-auth/plugins/organization";
import { API_KEY_EXPIRATION, API_KEY_HEADER, API_KEY_PREFIX } from "./api-keys";
import { connectGuard } from "./connect-guard";
import { AUTH_COOKIE_PREFIX } from "./cookies";
import { env } from "./env";
import { ensureWorkspaceMembership } from "./organization";
import {
	GOOGLE_PROVIDER_ID,
	MICROSOFT_PROVIDER_ID,
	MICROSOFT_SYNC_SCOPES,
	SLACK_PROVIDER_ID,
	SYNC_SCOPES,
} from "./scopes";
import { notifySignedIn } from "./signed-in";
import { rememberSlackInstall, replaceSlackConnection } from "./slack-grant";
import { SLACK_REQUESTED_SCOPES, SLACK_USER_SCOPES } from "./slack-scopes";
import { queueSlackInventorySync } from "./slack-sync";
import {
	hasSignInAllowList,
	isWorkspaceEmail,
	primaryWorkspaceDomain,
} from "./workspace";

const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};
const slackOAuth = env.slack;
const slackRedirectUri = new URL(
	"/api/auth/oauth2/callback/slack",
	env.apiUrl,
).toString();

if (env.google) {
	const google: NonNullable<typeof socialProviders.google> = {
		...env.google,

		scope: [...SYNC_SCOPES],

		accessType: "offline",
	};

	const hostedDomain = primaryWorkspaceDomain();
	if (hostedDomain) google.hd = hostedDomain;

	socialProviders.google = google;
}

if (env.microsoft) {
	socialProviders.microsoft = {
		clientId: env.microsoft.clientId,
		clientSecret: env.microsoft.clientSecret,
		tenantId: env.microsoft.tenantId,

		scope: [...MICROSOFT_SYNC_SCOPES],

		prompt: "select_account",

		disableProfilePhoto: true,

		mapProfileToUser: (profile) => ({
			email: profile.email ?? profile.preferred_username ?? profile.upn,
		}),
	};
}

type OAuthConnection = Parameters<typeof genericOAuth>[0]["config"][number];

const slackConnection = (
	oauth: NonNullable<typeof env.slack>,
): OAuthConnection => ({
	providerId: SLACK_PROVIDER_ID,
	authorizationUrl: "https://slack.com/oauth/v2/authorize",
	tokenUrl: "https://slack.com/api/oauth.v2.access",
	clientId: oauth.clientId,
	clientSecret: oauth.clientSecret,
	disableSignUp: true,
	redirectURI: slackRedirectUri,
	scopes: [...SLACK_REQUESTED_SCOPES],
	authorizationUrlParams: {
		user_scope: SLACK_USER_SCOPES.join(","),
		...(oauth.teamId && { team: oauth.teamId }),
	},
	getToken: async ({ code }) => {
		const response = await fetch("https://slack.com/api/oauth.v2.access", {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				client_id: oauth.clientId,
				client_secret: oauth.clientSecret,
				code,
				redirect_uri: slackRedirectUri,
			}),
		});
		const grant = schemas.slack.oauthAccess.parse(await response.json());
		if (!response.ok || !grant.ok || !grant.access_token) {
			throw new APIError("BAD_REQUEST", {
				message: `Slack authorization failed (${grant.error ?? "rejected"}).`,
			});
		}
		if (oauth.teamId && grant.team?.id !== oauth.teamId) {
			throw new APIError("BAD_REQUEST", {
				message: `Slack installed into workspace ${grant.team?.id ?? "unknown"}, and this CRM is pinned to ${oauth.teamId}.`,
			});
		}
		await rememberSlackInstall(grant);

		return {
			accessToken: grant.access_token,
			tokenType: grant.token_type,
			scopes: (grant.scope ?? "")
				.split(",")
				.map((scope) => scope.trim())
				.filter(Boolean),
			raw: grant,
		};
	},
	getUserInfo: async (tokens) => {
		try {
			const granted = schemas.slack.oauthAccess.parse(tokens.raw);
			const userId = granted.authed_user?.id;
			if (!tokens.accessToken || !userId) return null;
			const userResponse = await fetch(
				`https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`,
				{
					headers: {
						Authorization: `Bearer ${tokens.accessToken}`,
					},
				},
			);
			const profile = schemas.slack.userInfo.parse(await userResponse.json());
			if (!userResponse.ok || !profile.ok) return null;
			const details = profile.user.profile;
			const email = details.email;
			if (!email) return null;
			return {
				id: userId,
				name: details.real_name ?? profile.user.name ?? email,
				email,
				emailVerified: true,
				image: details.image_512,
			};
		} catch {
			return null;
		}
	},
});

export const auth = betterAuth({
	appName: "CRM",
	baseURL: env.apiUrl,

	database: prismaAdapter(db, {
		provider: "postgresql",
	}),

	emailAndPassword: {
		enabled: false,
	},

	socialProviders,

	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: [GOOGLE_PROVIDER_ID, MICROSOFT_PROVIDER_ID],
		},
	},

	session: {
		expiresIn: 60 * 60 * 24 * 7,
		updateAge: 60 * 60 * 24,
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60,
		},
	},

	rateLimit: {
		enabled: true,
		storage: "database",
	},

	advanced: {
		cookiePrefix: AUTH_COOKIE_PREFIX,

		useSecureCookies: env.isProduction,
		...(env.cookieDomain && {
			crossSubDomainCookies: {
				enabled: true,
				domain: env.cookieDomain,
			},
		}),
	},

	trustedOrigins: [...env.trustedOrigins],
	hooks: {
		before: connectGuard,
	},

	plugins: [
		...(slackOAuth
			? [genericOAuth({ config: [slackConnection(slackOAuth)] })]
			: []),
		organization({
			allowUserToCreateOrganization: false,
			disableOrganizationDeletion: true,
			creatorRole: "owner",

			schema: {
				organization: {
					additionalFields: {
						website: {
							type: "string",
							required: false,
						},
					},
				},
			},
		}),

		sso({
			organizationProvisioning: { disabled: true },
		}),

		apiKey({
			apiKeyHeaders: API_KEY_HEADER,
			defaultPrefix: API_KEY_PREFIX,
			enableSessionForAPIKeys: true,
			requireName: true,
			defaultKeyLength: 32,
			maximumNameLength: 64,
			rateLimit: { enabled: false },
			keyExpiration: {
				maxExpiresIn: API_KEY_EXPIRATION.maxDays,
				minExpiresIn: API_KEY_EXPIRATION.minDays,
			},
		}),
	],

	databaseHooks: {
		account: {
			create: {
				after: replaceSlackAccount,
			},
			update: {
				after: replaceSlackAccount,
			},
		},

		user: {
			create: {
				before: async (user) => {
					if (!hasSignInAllowList()) {
						throw new APIError("FORBIDDEN", {
							message:
								'No one can sign in yet: set ALLOWED_SIGN_IN in .env to your email domain (for example ALLOWED_SIGN_IN="acme.com") and restart.',
						});
					}

					if (!isWorkspaceEmail(user.email)) {
						const domain = primaryWorkspaceDomain();
						throw new APIError("FORBIDDEN", {
							message: domain
								? `This CRM is private. Sign in with your @${domain} account.`
								: "This CRM is private. That address is not on the allow-list.",
						});
					}

					return { data: user };
				},
			},
		},

		session: {
			create: {
				before: async (session) => {
					const workspaceId = await ensureWorkspaceMembership(session.userId);

					return {
						data: { ...session, activeOrganizationId: workspaceId ?? null },
					};
				},

				after: async (session) => {
					const user = await db.user.findUnique({
						where: { id: session.userId },
						select: { id: true, email: true },
					});

					if (user) await notifySignedIn(user);
				},
			},
		},
	},
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session["user"];

async function replaceSlackAccount(account: {
	id: string;
	accountId: string;
	providerId: string;
}): Promise<void> {
	if (account.providerId !== SLACK_PROVIDER_ID) return;
	await replaceSlackConnection(account);
	await queueSlackInventorySync();
}
