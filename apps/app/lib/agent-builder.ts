export type BuilderCommandType = "CHAT" | "CREATE_AGENT";

const CREATE_AGENT = /^\/create(?:\s+agent|-agent)(?:\s|$)/i;
const CREATE_AGENT_REQUEST =
	/\b(?:create|build|draft|make|configure|set\s+up)(?:\s+me)?\s+(?:(?:and\s+save)\s+)?(?:(?:a|an|the|this)\s+)?(?:new\s+)?agent\b/i;
const CREATE_AGENT_NON_REQUEST =
	/\b(?:(?:do\s+not|don't|dont|never)\b[^.!?]*|how\s+(?:(?:do|can|could|would|should)\s+(?:i|we)|to))\s*$/i;
const CREATE_AGENT_QUESTION =
	/^(?:how|why|when|where|what|does|do|did|is|are|will|would|can|could|should)\b/i;
const CREATE_AGENT_REQUEST_CUE =
	/\b(?:please|plz|(?:can|could|would|will)\s+you|i\s+(?:need|want)\b|we\s+need\b|let'?s)\b/i;

function matchCreateAgentRequest(message: string): RegExpExecArray | null {
	const match = CREATE_AGENT_REQUEST.exec(message);
	if (!match) return null;

	const prefix = message.slice(0, match.index);
	if (CREATE_AGENT_NON_REQUEST.test(prefix)) return null;
	if (
		message.trimEnd().endsWith("?") &&
		CREATE_AGENT_QUESTION.test(message.trimStart()) &&
		!CREATE_AGENT_REQUEST_CUE.test(prefix)
	) {
		return null;
	}

	return match;
}

export function builderCommandType(message: string): BuilderCommandType {
	const trimmed = message.trimStart();
	return CREATE_AGENT.test(trimmed) || matchCreateAgentRequest(trimmed)
		? "CREATE_AGENT"
		: "CHAT";
}

export function consumeBuilderCommand(
	message: string,
): { commandType: BuilderCommandType; body: string } | null {
	const trimmed = message.trimStart();
	const match = CREATE_AGENT.exec(trimmed);
	if (!match) return null;

	return {
		commandType: "CREATE_AGENT",
		body: trimmed.slice(match[0].length).trimStart(),
	};
}

export function consumeBuilderIntent(message: string): {
	commandType: "CREATE_AGENT";
	body: string;
	invocation: string;
} | null {
	const trimmed = message.trimStart();
	const match = matchCreateAgentRequest(trimmed);
	if (!match) return null;

	return {
		commandType: "CREATE_AGENT",
		body: trimmed.slice(match.index + match[0].length).replace(/^[\s,:-]+/, ""),
		invocation: match[0].trim(),
	};
}

export function hasCreateAgentCommand(
	submissions: ReadonlyArray<{ commandType: BuilderCommandType }>,
): boolean {
	return submissions.some(
		(submission) => submission.commandType === "CREATE_AGENT",
	);
}
