import { db } from "@crm/db";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import * as z from "zod";
import {
	canManageConnections,
	WORKSPACE_ID,
	WORKSPACE_ROLES,
	workspaceRoleOf,
} from "./organization";
import { SLACK_PROVIDER_ID } from "./scopes";

const CONNECT_MANAGER_ROLES = WORKSPACE_ROLES.filter((role) =>
	canManageConnections(role),
);

const SLACK_CONNECT_START_PATHS = ["/oauth2/link", "/sign-in/oauth2"];
const OAUTH_CALLBACK_PATH = "/oauth2/callback";

const connectStartBody = z.object({ providerId: z.string() });
const callbackParams = z.object({ providerId: z.string() });

export const slackConnectGuard = createAuthMiddleware(async (ctx) => {
	const guarded =
		startsSlackConnect(ctx.path, ctx.body) ||
		completesSlackConnect(ctx.path, ctx.params);
	if (!guarded) return;

	const session = await getSessionFromCtx(ctx, { disableCookieCache: true });
	if (!session) {
		throw new APIError("UNAUTHORIZED", {
			message: "Sign in to the CRM before you connect Slack.",
		});
	}

	const [role, managers] = await Promise.all([
		workspaceRoleOf(session.user.id),
		db.member.count({
			where: {
				organizationId: WORKSPACE_ID,
				role: { in: [...CONNECT_MANAGER_ROLES] },
			},
		}),
	]);

	if (!role) {
		throw new APIError("FORBIDDEN", {
			message: "Only a member of this workspace can connect Slack.",
		});
	}

	if (managers === 0) return;
	if (!canManageConnections(role)) {
		throw new APIError("FORBIDDEN", {
			message:
				"Only an owner or an admin can connect Slack. One Slack workspace is shared by everyone here, so ask one of them to connect or reconnect it.",
		});
	}
});

function startsSlackConnect(path: string, body: unknown): boolean {
	if (!SLACK_CONNECT_START_PATHS.includes(path)) return false;
	const parsed = connectStartBody.safeParse(body);
	return parsed.success && parsed.data.providerId === SLACK_PROVIDER_ID;
}

function completesSlackConnect(path: string, params: unknown): boolean {
	if (!path.startsWith(OAUTH_CALLBACK_PATH)) return false;
	const parsed = callbackParams.safeParse(params);
	return parsed.success && parsed.data.providerId === SLACK_PROVIDER_ID;
}
