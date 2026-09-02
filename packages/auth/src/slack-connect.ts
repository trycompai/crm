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
import { SLACK_PROVIDER_ID } from "./scopes";

const CONNECT_MANAGER_ROLES = WORKSPACE_ROLES.filter((role) =>
	canManageConnections(role),
);

const SLACK_CONNECT_START_PATH = "/link-social";
const OAUTH_CALLBACK_PATH = "/callback";

const connectStartBody = z.object({ provider: z.string() });
const callbackParams = z.object({ id: z.string() });
const callbackQuery = z.object({ state: z.string() });
const oauthState = z.object({
	link: z
		.object({
			email: z.string(),
			userId: z.string(),
		})
		.optional(),
});

export const slackConnectGuard = createAuthMiddleware(async (ctx) => {
	const guarded =
		startsSlackConnect(ctx.path, ctx.body) ||
		(await completesSlackConnect(ctx.path, ctx.params, ctx.query));
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

function startsSlackConnect(
	path: string,
	body: JsonValue | undefined,
): boolean {
	if (path !== SLACK_CONNECT_START_PATH) return false;
	const parsed = connectStartBody.safeParse(body);
	return parsed.success && parsed.data.provider === SLACK_PROVIDER_ID;
}

async function completesSlackConnect(
	path: string,
	params: JsonValue | undefined,
	query: JsonValue | undefined,
): Promise<boolean> {
	if (!path.startsWith(OAUTH_CALLBACK_PATH)) return false;
	const parsedParams = callbackParams.safeParse(params);
	if (!parsedParams.success || parsedParams.data.id !== SLACK_PROVIDER_ID) {
		return false;
	}
	const parsedQuery = callbackQuery.safeParse(query);
	if (!parsedQuery.success) return false;
	const verification = await db.verification.findFirst({
		where: { identifier: parsedQuery.data.state },
		select: { value: true },
	});
	if (!verification) return false;
	try {
		const parsedState = oauthState.safeParse(JSON.parse(verification.value));
		return parsedState.success && parsedState.data.link !== undefined;
	} catch {
		return false;
	}
}
