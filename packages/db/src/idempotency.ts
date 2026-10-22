import { Prisma } from "./generated/prisma/client";

export async function lockIdempotencyKey(
	tx: Prisma.TransactionClient,
	key: string,
): Promise<void> {
	await tx.$queryRaw<Array<{ locked: boolean }>>`
		SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0)) IS NULL AS locked
	`;
}

export async function lockIdempotencyKeys(
	tx: Prisma.TransactionClient,
	keys: string[],
): Promise<void> {
	const ordered = [...new Set(keys)].sort();
	if (ordered.length === 0) return;

	await tx.$queryRaw<Array<{ locked: boolean }>>`
		SELECT pg_advisory_xact_lock(hashtextextended(requested.key, 0)) IS NULL AS locked
		FROM (
			VALUES ${Prisma.join(ordered.map((key) => Prisma.sql`(${key})`))}
		) AS requested(key)
		ORDER BY requested.key
	`;
}
