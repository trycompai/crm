import { spawn } from "node:child_process";
import { resolve } from "node:path";

const rawPort = process.env.AGENT_PORT ?? process.env.PORT ?? "2000";
const port = Number(rawPort);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
	throw new Error(
		`AGENT_PORT or PORT must be a valid port, received ${rawPort}.`,
	);
}

const cli = resolve(import.meta.dir, "../node_modules/eve/bin/eve.js");
const child = spawn("node", [cli, "start", "--port", String(port)], {
	stdio: "inherit",
	env: process.env,
});

const forward = (signal: NodeJS.Signals) => {
	if (!child.killed) child.kill(signal);
};

process.once("SIGINT", forward);
process.once("SIGTERM", forward);

child.once("exit", (code) => {
	process.exit(code ?? 1);
});
