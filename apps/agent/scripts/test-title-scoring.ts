import "@crm/env/load";
import { fileURLToPath } from "node:url";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
	console.error(
		"Set TEST_DATABASE_URL to a PostgreSQL database ending in _test.",
	);
	process.exit(1);
}

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const agentRoot = fileURLToPath(new URL("../", import.meta.url));
const env = {
	...process.env,
	DATABASE_URL: testDatabaseUrl,
	TEST_DATABASE_URL: testDatabaseUrl,
	NODE_ENV: "test",
	CRM_TELEMETRY_DISABLED: "1",
};
const commands = [
	{ cwd: repoRoot, args: ["run", "--filter=@crm/db", "db:test"] },
	{ cwd: repoRoot, args: ["run", "--filter=@crm/db", "db:generate"] },
	{
		cwd: agentRoot,
		args: ["test", "./test/title-score-matrix.integration.spec.ts"],
	},
];

for (const { cwd, args } of commands) {
	const result = Bun.spawnSync([process.execPath, ...args], {
		cwd,
		env,
		stdio: ["inherit", "inherit", "inherit"],
	});
	if (!result.success) process.exit(result.exitCode || 1);
}
