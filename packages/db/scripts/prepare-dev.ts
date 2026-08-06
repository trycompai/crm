import { join } from "node:path";

const directory = join(import.meta.dir, "..");

await run([process.execPath, "scripts/require-local-db.ts", "dev"]);
const [migration, generation] = await Promise.all([
	execute([process.execPath, "run", "prisma", "migrate", "deploy"]),
	execute([process.execPath, "run", "prisma", "generate"]),
]);

if (migration !== 0) process.exit(migration);
if (generation !== 0) process.exit(generation);

const drift = await execute([
	process.execPath,
	"run",
	"prisma",
	"migrate",
	"diff",
	"--from-config-datasource",
	"--to-schema",
	"prisma/schema.prisma",
	"--exit-code",
]);

if (drift === 2) {
	console.error(
		"The Prisma schema is ahead of the database. Create a migration with `bun run db:migrate` before starting dev.",
	);
	process.exit(1);
}

if (drift !== 0) process.exit(drift);

console.log("Database migrations and generated Prisma client are ready.");

async function run(command: string[]): Promise<void> {
	const exitCode = await execute(command);
	if (exitCode !== 0) process.exit(exitCode);
}

async function execute(command: string[]): Promise<number> {
	const child = Bun.spawn(command, {
		cwd: directory,
		env: process.env,
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});

	return child.exited;
}
