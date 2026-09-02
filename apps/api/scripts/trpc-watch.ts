import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { sep } from "node:path";
import { TRPC_WATCH } from "./dev-config";

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let queued = false;

function generate(): void {
	if (running) {
		queued = true;
		return;
	}
	running = true;
	const child = spawn("bun", ["run", "trpc:generate"], { stdio: "inherit" });
	child.on("exit", () => {
		running = false;
		if (queued) {
			queued = false;
			generate();
		}
	});
}

function schedule(): void {
	if (timer) clearTimeout(timer);
	timer = setTimeout(generate, TRPC_WATCH.debounceMs);
}

function isRouterChange(file: string | null): boolean {
	if (!file) return false;
	if (file.startsWith(`${TRPC_WATCH.generatedDir}${sep}`)) return false;
	return file.endsWith(TRPC_WATCH.routerSuffix);
}

watch(TRPC_WATCH.sourceDir, { recursive: true }, (_event, file) => {
	if (isRouterChange(file)) schedule();
});

generate();
console.log(
	`[trpc] watching ${TRPC_WATCH.sourceDir} for *${TRPC_WATCH.routerSuffix} writes`,
);
