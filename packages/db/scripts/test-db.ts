import { spawnSync } from "node:child_process";
import pg from "pg";

const url = resolve();

if (!url) {
	fail([
		"Neither TEST_DATABASE_URL nor DATABASE_URL is set.",
		"Copy .env.example to .env at the repo root.",
	]);
}

const name = databaseName(url);

if (!name.endsWith("_test")) {
	fail([
		`TEST_DATABASE_URL names "${name}", which does not end in _test.`,
		"The suite refuses anything else, because it deletes rows it expects to",
		"put back and an interrupted run leaves them deleted.",
	]);
}

await create(url, name);
migrate(url);

if (!process.env.TEST_DATABASE_URL) {
	console.log(
		[
			"",
			"  Add this to .env so the suite finds it:",
			"",
			`    TEST_DATABASE_URL="${url}"`,
			"",
		].join("\n"),
	);
}

async function create(target: string, database: string): Promise<void> {
	const maintenance = new URL(target);
	maintenance.pathname = "/postgres";
	maintenance.search = "";

	const client = new pg.Client({ connectionString: maintenance.toString() });

	try {
		await client.connect();
	} catch (error) {
		fail([
			`Could not reach the server at ${new URL(target).host}.`,
			"Is Postgres running?  docker compose up -d",
			"",
			error instanceof Error ? error.message : String(error),
		]);
	}

	try {
		const existing = await client.query(
			"SELECT 1 FROM pg_database WHERE datname = $1",
			[database],
		);

		if (existing.rowCount) {
			console.log(`  ${database} already exists`);
			return;
		}

		await client.query(`CREATE DATABASE "${database}"`);
		console.log(`  created ${database}`);
	} finally {
		await client.end();
	}
}

function migrate(target: string): void {
	const result = spawnSync("prisma", ["migrate", "deploy"], {
		stdio: "inherit",
		env: { ...process.env, DATABASE_URL: target },
	});

	if (result.status !== 0) process.exit(result.status ?? 1);
}

function resolve(): string | null {
	const explicit = process.env.TEST_DATABASE_URL;
	if (explicit) return explicit;

	const live = process.env.DATABASE_URL;
	if (!live) return null;

	try {
		const parsed = new URL(live);
		const database = parsed.pathname.replace(/^\//, "");
		if (!database) return null;

		parsed.pathname = `/${database.endsWith("_test") ? database : `${database}_test`}`;

		return parsed.toString();
	} catch {
		return null;
	}
}

function databaseName(value: string): string {
	try {
		return new URL(value).pathname.replace(/^\//, "");
	} catch {
		return value;
	}
}

function fail(lines: string[]): never {
	console.error(["", ...lines.map((line) => `  ${line}`), ""].join("\n"));
	process.exit(1);
}
