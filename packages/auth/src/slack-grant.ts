import { db } from "@crm/db";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import { schemas } from "@crm/validation";
import { SLACK_PROVIDER_ID } from "./scopes";
import { SLACK_CONNECTION } from "./slack-config";

type SlackInstall = {
	teamId: string;
	teamName: string | null;
	userToken: string | null;
	userScopes: string;
	seenAt: number;
};

const installs = new Map<string, SlackInstall>();

export function rememberSlackInstall(raw: unknown): void {
	const parsed = schemas.slack.installation.safeParse(raw);
	if (!parsed.success) return;

	const { team, authed_user: installer } = parsed.data;
	if (!installer) return;

	forgetStaleInstalls();

	installs.set(installer.id, {
		teamId: team.id,
		teamName: team.name ?? null,
		userToken: installer.access_token ?? null,
		userScopes: installer.scope ?? "",
		seenAt: Date.now(),
	});
}

export async function replaceSlackConnection(account: {
	id: string;
	accountId: string;
}): Promise<void> {
	const install = installs.get(account.accountId);
	installs.delete(account.accountId);

	await db.$transaction(async (tx) => {
		await lockIdempotencyKey(tx, SLACK_CONNECTION.locks.connection);

		await tx.account.deleteMany({
			where: { providerId: SLACK_PROVIDER_ID, id: { not: account.id } },
		});

		if (!install) return;

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

function forgetStaleInstalls(): void {
	const cutoff = Date.now() - SLACK_CONNECTION.install.staleMs;

	for (const [installer, install] of installs) {
		if (install.seenAt < cutoff) installs.delete(installer);
	}
}
