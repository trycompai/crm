import { db } from "@crm/db";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import { schemas } from "@crm/validation";
import { SLACK_PROVIDER_ID } from "./scopes";
import { SLACK_CONNECTION } from "./slack-config";

export async function rememberSlackInstall(raw: unknown): Promise<void> {
	const parsed = schemas.slack.installation.safeParse(raw);
	if (!parsed.success) return;

	const { team, authed_user: installer } = parsed.data;
	if (!installer) return;

	const install = {
		teamId: team.id,
		teamName: team.name ?? null,
		userToken: installer.access_token ?? null,
		userScopes: installer.scope ?? "",
		createdAt: new Date(),
	};

	await db.slackInstallation.upsert({
		where: { installerId: installer.id },
		create: { installerId: installer.id, ...install },
		update: install,
	});

	await forgetStaleInstalls();
}

export async function replaceSlackConnection(account: {
	id: string;
	accountId: string;
}): Promise<void> {
	await db.$transaction(async (tx) => {
		await lockIdempotencyKey(tx, SLACK_CONNECTION.locks.connection);

		await tx.account.deleteMany({
			where: { providerId: SLACK_PROVIDER_ID, id: { not: account.id } },
		});

		const install = await tx.slackInstallation.findUnique({
			where: { installerId: account.accountId },
		});
		if (!install) return;

		await tx.slackInstallation.delete({
			where: { installerId: account.accountId },
		});

		await tx.slackWorkspaceGrant.deleteMany({
			where: { teamId: { not: install.teamId } },
		});

		if (!install.userToken) return;

		const grant = {
			teamName: install.teamName,
			userToken: install.userToken,
			userScopes: install.userScopes,
		};

		await tx.slackWorkspaceGrant.upsert({
			where: { teamId: install.teamId },
			create: { teamId: install.teamId, ...grant },
			update: grant,
		});
	});
}

async function forgetStaleInstalls(): Promise<void> {
	await db.slackInstallation.deleteMany({
		where: {
			createdAt: {
				lt: new Date(Date.now() - SLACK_CONNECTION.install.staleMs),
			},
		},
	});
}
