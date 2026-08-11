import { sso } from "@better-auth/sso";
import { db } from "@crm/db";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { organization } from "better-auth/plugins/organization";
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
import { slackConnectGuard } from "./slack-connect";
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
	socialProviders.google = {
		...env.google,

		scope: [...SYNC_SCOPES],

		accessType: "offline",

		...(primaryWorkspaceDomain() ? { hd: primaryWorkspaceDomain() } : {}),
	};
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
		before: slackConnectGuard,
	},

	plugins: [
		...(slackOAuth
			? [
					genericOAuth({
						config: [
							{
								providerId: SLACK_PROVIDER_ID,
								authorizationUrl: "https://slack.com/oauth/v2/authorize",
								tokenUrl: "https://slack.com/api/oauth.v2.access",
								clientId: slackOAuth.clientId,
								clientSecret: slackOAuth.clientSecret,
								disableSignUp: true,
								redirectURI: slackRedirectUri,
								scopes: [...SLACK_REQUESTED_SCOPES],
								authorizationUrlParams: {
									user_scope: SLACK_USER_SCOPES.join(","),
								},
								getToken: async ({ code }) => {
									const response = await fetch(
										"https://slack.com/api/oauth.v2.access",
										{
											method: "POST",
											headers: {
												"content-type": "application/x-www-form-urlencoded",
											},
											body: new URLSearchParams({
												client_id: slackOAuth.clientId,
												client_secret: slackOAuth.clientSecret,
												code,
												redirect_uri: slackRedirectUri,
											}),
										},
									);
									const raw = recordValue(await response.json());
									const accessToken = stringValue(raw, "access_token");
									if (!response.ok || raw.ok !== true || !accessToken) {
										const reason = stringValue(raw, "error") ?? "rejected";
										throw new APIError("BAD_REQUEST", {
											message: `Slack authorization failed (${reason}).`,
										});
									}
									await rememberSlackInstall(raw);

									return {
										accessToken,
										tokenType: stringValue(raw, "token_type"),
										scopes: (stringValue(raw, "scope") ?? "")
											.split(",")
											.map((scope) => scope.trim())
											.filter(Boolean),
										raw,
									};
								},
								getUserInfo: async (tokens) => {
									try {
										const installer = objectValue(tokens.raw, "authed_user");
										const userId = stringValue(installer, "id");
										if (!tokens.accessToken || !userId) return null;
										const userResponse = await fetch(
											`https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`,
											{
												headers: {
													Authorization: `Bearer ${tokens.accessToken}`,
												},
											},
										);
										const profile = recordValue(await userResponse.json());
										if (!userResponse.ok || profile.ok !== true) return null;
										const user = objectValue(profile, "user");
										const details = objectValue(user, "profile");
										const email = stringValue(details, "email");
										if (!email) return null;
										return {
											id: userId,
											name:
												stringValue(details, "real_name") ??
												stringValue(user, "name") ??
												email,
											email,
											emailVerified: true,
											image: stringValue(details, "image_512"),
										};
									} catch {
										return null;
									}
								},
							},
						],
					}),
				]
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

function objectValue(value: unknown, key: string): Record<string, unknown> {
	return recordValue(recordValue(value)[key]);
}

function recordValue(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function stringValue(value: unknown, key: string): string | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}
	const nested = Reflect.get(value, key);
	return typeof nested === "string" && nested.length > 0 ? nested : undefined;
}
