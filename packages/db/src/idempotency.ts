import type { Prisma } from "./generated/prisma/client";

export async function lockIdempotencyKey(
	tx: Prisma.TransactionClient,
	key: string,
): Promise<void> {
	await tx.$queryRaw<Array<{ locked: boolean }>>`
		SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0)) IS NULL AS locked
	`;
}
