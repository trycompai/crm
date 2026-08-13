"use server";

import { db } from "@crm/db";
import { unsubscribeByToken } from "@crm/db/marketing";

export async function unsubscribe(token: string): Promise<{ ok: boolean }> {
	try {
		const result = await unsubscribeByToken(db, token);

		if (result) {
			const send = await db.marketingSend.findFirst({
				where: { recipient: { address: result.address } },
				orderBy: { createdAt: "desc" },
				select: { id: true },
			});

			if (send) {
				await db.marketingEvent.create({
					data: { sendId: send.id, type: "UNSUBSCRIBED" },
				});
			}
		}

		return { ok: true };
	} catch {
		return { ok: false };
	}
}
