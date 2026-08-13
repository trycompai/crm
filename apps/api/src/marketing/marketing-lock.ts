import type { Db } from "@crm/db";
import { lockIdempotencyKey } from "@crm/db/idempotency";
import type { MarketingLock } from "./marketing-config";

export async function underLock<T>(
	db: Db,
	lock: MarketingLock,
	work: () => Promise<T>,
): Promise<T> {
	return db.$transaction(
		async (tx) => {
			await lockIdempotencyKey(tx, lock.key);
			return work();
		},
		{ maxWait: lock.waitMs, timeout: lock.holdMs },
	);
}
