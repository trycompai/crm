import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";

export const slackOAuthCallback = {
	id: "slack-oauth-callback",
	endpoints: {
		legacySlackCallback: createAuthEndpoint(
			"/oauth2/callback/slack",
			{ method: "GET", requireRequest: true },
			async (ctx) => {
				const target = new URL(`${ctx.context.baseURL}/callback/slack`);
				target.search = new URL(ctx.request.url).search;
				throw ctx.redirect(target.toString());
			},
		),
	},
} satisfies BetterAuthPlugin;
