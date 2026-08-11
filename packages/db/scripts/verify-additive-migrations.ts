import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { prohibitedMigrationOperations } from "../src/additive-migrations";
import { db } from "../src/client";

async function appliedMigrations(): Promise<Set<string>> {
	const [catalog] = await db.$queryRaw<
		Array<{ migrationTable: string | null }>
	>`
		SELECT to_regclass('_prisma_migrations')::text AS "migrationTable"
	`;
	if (!catalog?.migrationTable) return new Set();

	const rows = await db.$queryRaw<Array<{ migrationName: string }>>`
		SELECT migration_name AS "migrationName"
		FROM "_prisma_migrations"
		WHERE finished_at IS NOT NULL
			AND rolled_back_at IS NULL
	`;
	return new Set(rows.map((row) => row.migrationName));
}

async function verify(): Promise<void> {
	const migrationsRoot = path.resolve(import.meta.dir, "../prisma/migrations");
	const entries = await readdir(migrationsRoot, { withFileTypes: true });
	const applied = await appliedMigrations();
	const pending = entries
		.filter((entry) => entry.isDirectory() && !applied.has(entry.name))
		.map((entry) => entry.name)
		.sort();
	const rejected: string[] = [];

	for (const migration of pending) {
		const sql = await readFile(
			path.join(migrationsRoot, migration, "migration.sql"),
			"utf8",
		);
		const operations = prohibitedMigrationOperations(sql);
		if (operations.length > 0) {
			rejected.push(`${migration}: ${operations.join(", ")}`);
		}
	}

	if (rejected.length > 0) {
		throw new Error(
			`Production release accepts additive migrations only:\n${rejected.join("\n")}`,
		);
	}

	console.log(`Verified ${pending.length} pending additive migration(s).`);
}

try {
	await verify();
} finally {
	await db.$disconnect();
}
