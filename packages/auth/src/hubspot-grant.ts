import { db } from "@crm/db";
import { HUBSPOT } from "@crm/db/hubspot";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import { HUBSPOT_PROVIDER_ID } from "./scopes";

export async function rememberHubspotInstall(install: {
	installerId: string;
	portalId: string;
	portalDomain: string | null;
	installerEmail: string | null;
	refreshToken: string;
	scopes: string;
}): Promise<void> {
	const { installerId, ...rest } = install;

	await db.hubspotInstall.upsert({
		where: { installerId },
		create: { installerId, ...rest, createdAt: new Date() },
		update: { ...rest, createdAt: new Date() },
	});

	await forgetStaleInstalls();
}

export async function replaceHubspotConnection(account: {
	id: string;
	accountId: string;
}): Promise<void> {
	await db.$transaction(async (tx) => {
		await lockIdempotencyKey(tx, HUBSPOT.locks.connection);

		await tx.account.deleteMany({
			where: { providerId: HUBSPOT_PROVIDER_ID, id: { not: account.id } },
		});

		const install = await tx.hubspotInstall.findUnique({
			where: { installerId: account.accountId },
		});
		if (!install) return;

		await tx.hubspotInstall.delete({
			where: { installerId: account.accountId },
		});

		const replacing = await tx.hubspotConnection.findFirst({
			where: { portalId: { not: install.portalId } },
			select: { id: true },
		});

		if (replacing) {
			await tx.hubspotStage.deleteMany({});
			await tx.hubspotPipeline.deleteMany({});
			await tx.hubspotConnection.deleteMany({
				where: { portalId: { not: install.portalId } },
			});
		}

		const grant = {
			portalDomain: install.portalDomain,
			installerEmail: install.installerEmail,
			refreshToken: install.refreshToken,
			scopes: install.scopes,
			accessToken: null,
			accessTokenExpiresAt: null,
			lastError: null,
			lastErrorAt: null,
			revokedAt: null,
		};

		await tx.hubspotConnection.upsert({
			where: { portalId: install.portalId },
			create: { portalId: install.portalId, ...grant },
			update: grant,
		});
	});
}

async function forgetStaleInstalls(): Promise<void> {
	await db.hubspotInstall.deleteMany({
		where: {
			createdAt: { lt: new Date(Date.now() - HUBSPOT.install.staleMs) },
		},
	});
}
