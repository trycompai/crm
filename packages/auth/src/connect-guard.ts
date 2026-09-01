import { db } from "@crm/db";
import type { JsonValue } from "@crm/db/json";
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
import { HUBSPOT_PROVIDER_ID, SLACK_PROVIDER_ID } from "./scopes";

const CONNECT_MANAGER_ROLES = WORKSPACE_ROLES.filter((role) =>
	canManageConnections(role),
);

const CONNECT_START_PATHS = ["/oauth2/link", "/sign-in/oauth2"];
const OAUTH_CALLBACK_PATH = "/oauth2/callback";

const connectStartBody = z.object({ providerId: z.string() });
const callbackParams = z.object({ providerId: z.string() });

type GuardedConnection = {
	name: string;
	signedOut: string;
	stranger: string;
	refused: string;
};

export const GUARDED_CONNECTIONS: Record<string, GuardedConnection> = {
	[SLACK_PROVIDER_ID]: {
		name: "Slack",
		signedOut: "Sign in to the CRM before you connect Slack.",
		stranger: "Only a member of this workspace can connect Slack.",
		refused:
			"Only an owner or an admin can connect Slack. One Slack workspace is shared by everyone here, so ask one of them to connect or reconnect it.",
	},
	[HUBSPOT_PROVIDER_ID]: {
		name: "HubSpot",
		signedOut: "Sign in to the CRM before you connect HubSpot.",
		stranger: "Only a member of this workspace can connect HubSpot.",
		refused:
			"Only an owner or an admin can connect HubSpot. One HubSpot account is shared by everyone here, so ask one of them to connect or reconnect it.",
	},
};

export const connectGuard = createAuthMiddleware(async (ctx) => {
	const providerId =
		startsConnect(ctx.path, ctx.body) ?? completesConnect(ctx.path, ctx.params);
	if (!providerId) return;

	const connection = GUARDED_CONNECTIONS[providerId];
	if (!connection) return;

	const session = await getSessionFromCtx(ctx, { disableCookieCache: true });
	if (!session) {
		throw new APIError("UNAUTHORIZED", { message: connection.signedOut });
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
		throw new APIError("FORBIDDEN", { message: connection.stranger });
	}

	if (managers === 0) return;
	if (!canManageConnections(role)) {
		throw new APIError("FORBIDDEN", { message: connection.refused });
	}
});

function startsConnect(path: string, body: JsonValue): string | null {
	if (!CONNECT_START_PATHS.includes(path)) return null;
	const parsed = connectStartBody.safeParse(body);
	return parsed.success ? parsed.data.providerId : null;
}

function completesConnect(path: string, params: JsonValue): string | null {
	if (!path.startsWith(OAUTH_CALLBACK_PATH)) return null;
	const parsed = callbackParams.safeParse(params);
	return parsed.success ? parsed.data.providerId : null;
}
