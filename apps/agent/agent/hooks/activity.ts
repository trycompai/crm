import { defineHook, type HookEvent } from "eve/hooks";

type ActionRequest = HookEvent<"actions.requested">["data"]["actions"][number];
type ActionResult = HookEvent<"action.result">["data"]["result"];

const SHOW_CONTENT = process.env.NODE_ENV !== "production";
const MAX_IN_FLIGHT = 256;

const inFlight = new Map<string, { name: string; at: number }>();

function truncate(text: string, limit: number): string {
	return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function line(symbol: string, text: string): void {
	console.error(`[agent] ${symbol} ${text}`);
}

function preview(input: unknown): string {
	if (!SHOW_CONTENT || typeof input !== "object" || input === null) return "";

	const parts: string[] = [];

	for (const [key, value] of Object.entries(input)) {
		if (value === null || value === undefined) continue;
		const text = typeof value === "string" ? value : JSON.stringify(value);
		parts.push(`${key}=${truncate(text ?? String(value), 48)}`);
	}

	return truncate(parts.join(" "), 160);
}

function requestName(action: ActionRequest): string {
	switch (action.kind) {
		case "tool-call":
			return action.toolName;
		case "subagent-call":
			return `subagent ${action.subagentName}`;
		case "remote-agent-call":
			return `remote ${action.remoteAgentName}`;
		case "load-skill":
			return "load_skill";
	}
}

function resultName(result: ActionResult): string {
	switch (result.kind) {
		case "tool-result":
			return result.toolName;
		case "subagent-result":
			return `subagent ${result.subagentName}`;
		case "load-skill-result":
			return result.name ? `skill ${result.name}` : "load_skill";
	}
}

function count(tokens: number): string {
	return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
}

export default defineHook({
	events: {
		"session.started"(event, ctx) {
			const on = ctx.channel.kind ? ` on ${ctx.channel.kind}` : "";
			const as = event.data.invocation?.name;

			line(
				"▸",
				`session ${ctx.session.id}${on}${as ? ` as subagent ${as}` : ""}`,
			);
		},

		"message.received"(event) {
			line(
				"»",
				SHOW_CONTENT
					? truncate(event.data.message, 200)
					: `${event.data.message.length} chars`,
			);
		},

		"actions.requested"(event) {
			for (const action of event.data.actions) {
				if (inFlight.size >= MAX_IN_FLIGHT) {
					const oldest = inFlight.keys().next();
					if (!oldest.done) inFlight.delete(oldest.value);
				}

				const name = requestName(action);

				inFlight.set(action.callId, { name, at: Date.now() });
				line("→", `${name} ${preview(action.input)}`.trimEnd());
			}
		},

		"action.result"(event) {
			const { error, result, status } = event.data;
			const call = inFlight.get(result.callId);

			inFlight.delete(result.callId);

			const name = call?.name ?? resultName(result);
			const took = call
				? ` ${((Date.now() - call.at) / 1000).toFixed(1)}s`
				: "";

			if (status === "completed") {
				line("✓", `${name}${took}`);
				return;
			}

			const why = error ? `: ${truncate(error.message, 140)}` : "";
			line("✗", `${name}${took} ${status}${why}`);
		},

		"message.completed"(event) {
			const reply = event.data.message ?? "";

			line(
				"◂",
				SHOW_CONTENT
					? truncate(reply, 300)
					: `replied ${reply.length} chars (${event.data.finishReason})`,
			);
		},

		"step.completed"(event) {
			const usage = event.data.usage;
			const spend = usage
				? [
						usage.inputTokens === undefined
							? null
							: `in ${count(usage.inputTokens)}`,
						usage.outputTokens === undefined
							? null
							: `out ${count(usage.outputTokens)}`,
						usage.cacheReadTokens
							? `cached ${count(usage.cacheReadTokens)}`
							: null,
						usage.costUsd === undefined ? null : `$${usage.costUsd.toFixed(4)}`,
					]
						.filter(Boolean)
						.join(" ")
				: "";

			line(
				"·",
				`step ${event.data.stepIndex} ${event.data.finishReason}${spend ? `  ${spend}` : ""}`,
			);
		},

		"step.failed"(event) {
			line(
				"⨯",
				`step ${event.data.stepIndex} ${event.data.code}: ${truncate(event.data.message, 200)}`,
			);
		},

		"turn.failed"(event) {
			line(
				"⨯",
				`turn ${event.data.code}: ${truncate(event.data.message, 200)}`,
			);
		},

		"session.failed"(event) {
			line(
				"⨯",
				`session ${event.data.code}: ${truncate(event.data.message, 200)}`,
			);
		},
	},
});
