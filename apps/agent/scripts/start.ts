import { spawn } from "node:child_process";
import { constants } from "node:os";

const rawPort = process.env.AGENT_PORT ?? process.env.PORT ?? "2000";
const port = Number(rawPort);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
	throw new Error(
		`AGENT_PORT or PORT must be a valid port, received ${rawPort}.`,
	);
}

const cli = process.platform === "win32" ? "eve.cmd" : "eve";
const child = spawn(cli, ["start", "--port", String(port)], {
	stdio: "inherit",
	env: process.env,
});

let settled = false;

const finish = (code: number) => {
	if (settled) return;
	settled = true;
	process.exitCode = code;
};

const forward = (signal: NodeJS.Signals) => {
	if (!child.killed) child.kill(signal);
};

process.once("SIGINT", forward);
process.once("SIGTERM", forward);

child.once("exit", (code, signal) => {
	const signalNumber = signal ? constants.signals[signal] : null;
	finish(code ?? (signalNumber ? 128 + signalNumber : 1));
});

child.once("error", (error) => {
	console.error(`[agent] could not start eve: ${error.message}`);
	finish(1);
});
