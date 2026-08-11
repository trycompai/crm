const REASONS: Record<string, string> = {
	ACTION_NOT_PERFORMED:
		"The agent finished without doing what it was built to do. Open the run to see which step it skipped.",
	NO_EXECUTOR:
		"This agent asks for something the CRM cannot do yet. It needs rebuilding.",
	DEPENDENCY_UNAVAILABLE:
		"A connection this agent needs is missing. Reconnect it, then run again.",
	NOT_AUTHORISED:
		"The connection refused this. Its access may have been revoked or narrowed.",
	PROVIDER_ERROR:
		"The outside service rejected this. It is usually worth trying again.",
	NEVER_SETTLED:
		"The agent stopped without reporting a result. Nothing was left half-done.",
	TURN_FAILED: "The model failed part-way through this run.",
	DELIVERY_FAILED: "The run never reached the agent.",
	DELIVERY_EXHAUSTED:
		"This never reached the agent after three attempts. Nothing ran.",
	ACTION_REJECTED:
		"The agent tried the action and the CRM refused it. Nothing was written.",
	AGENT_UNAVAILABLE: "The agent was paused or archived when this run started.",
	AGENT_DELETED: "The agent was deleted before this run finished.",
	CANCELLED_BY_USER: "Someone stopped this run.",
	RUN_TIMED_OUT:
		"This run took too long and was stopped so later runs could start.",
};

export function runFailureReason(
	code: string | null | undefined,
	message: string | null | undefined,
): string {
	const known = code ? REASONS[code] : undefined;
	if (known) return known;
	if (message?.trim()) return message.trim();
	return "This run failed without saying why.";
}
