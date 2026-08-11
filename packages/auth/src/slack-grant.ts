import { db } from "@crm/db";
import { z } from "zod";

const slackInstallation = z.object({
	team: z.object({
		id: z.string().trim().min(1),
		name: z.string().trim().min(1).optional(),
	}),
	authed_user: z
		.object({
			id: z.string().trim().min(1),
			access_token: z.string().trim().min(1).optional(),
			scope: z.string().trim().optional(),
		})
		.optional(),
});

export type SlackInstallation = z.infer<typeof slackInstallation>;

export async function storeSlackUserGrant(raw: unknown): Promise<void> {
	const parsed = slackInstallation.safeParse(raw);
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
