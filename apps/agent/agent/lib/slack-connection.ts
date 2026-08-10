import { db } from "@crm/db";

export async function slackAccessToken(): Promise<string | null> {
	const account = await db.account.findFirst({
		where: { providerId: "slack", accessToken: { not: null } },
		orderBy: { updatedAt: "desc" },
		select: { accessToken: true },
	});

	return account?.accessToken ?? null;
}

export async function slackConnected(): Promise<boolean> {
	return (await slackAccessToken()) !== null;
}
