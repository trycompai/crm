import { db } from "@crm/db";
import { schemas } from "@crm/validation";

export async function storeSlackUserGrant(raw: unknown): Promise<void> {
	const parsed = schemas.slack.installation.safeParse(raw);
	if (!parsed.success) return;

	const { team, authed_user: user } = parsed.data;
	if (!user?.access_token) return;

	const userScopes = user.scope ?? "";

	await db.slackWorkspaceGrant.upsert({
		where: { teamId: team.id },
		create: {
			teamId: team.id,
			teamName: team.name ?? null,
			userToken: user.access_token,
			userScopes,
		},
		update: {
			teamName: team.name ?? null,
			userToken: user.access_token,
			userScopes,
		},
	});
}

export async function clearSlackUserGrant(teamId?: string): Promise<void> {
	await db.slackWorkspaceGrant.deleteMany(
		teamId ? { where: { teamId } } : undefined,
	);
}
