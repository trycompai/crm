import { describe, expect, it } from "bun:test";
import { prohibitedMigrationOperations } from "../src/additive-migrations";

describe("production migration admission", () => {
	it("accepts additive schema and data backfill operations", () => {
		expect(
			prohibitedMigrationOperations(`
				CREATE TABLE "receipt" ("id" TEXT PRIMARY KEY);
				ALTER TABLE "agentTask" ADD COLUMN "operationKey" TEXT;
				ALTER TYPE "AgentRunStatus" ADD VALUE 'INDETERMINATE';
				UPDATE "agentTask" SET "operationKey" = "id" WHERE "operationKey" IS NULL;
				INSERT INTO "receipt" ("id") VALUES ('one');
			`),
		).toEqual([]);
	});

	it("rejects destructive data operations", () => {
		expect(
			prohibitedMigrationOperations(`
				DELETE FROM "contact";
				TRUNCATE TABLE "company";
			`),
		).toEqual(["TRUNCATE", "DELETE FROM"]);
	});

	it("rejects destructive or identity-changing schema operations", () => {
		expect(
			prohibitedMigrationOperations(`
				DROP TABLE "contact";
				ALTER TABLE "company" RENAME COLUMN "name" TO "title";
				ALTER TABLE "deal" ALTER COLUMN "amount" TYPE INTEGER;
				CREATE OR REPLACE VIEW "pipeline" AS SELECT 1;
			`),
		).toEqual(["DROP", "RENAME", "ALTER COLUMN TYPE", "CREATE OR REPLACE"]);
	});

	it("ignores prohibited words in comments and values", () => {
		expect(
			prohibitedMigrationOperations(`
				-- DROP TABLE "contact";
				/* DELETE FROM "company"; */
				INSERT INTO "audit" ("message") VALUES ('TRUNCATE then DROP');
			`),
		).toEqual([]);
	});
});
