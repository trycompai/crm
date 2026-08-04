const DEFAULT_AGENT_URL = "http://127.0.0.1:2000";

export interface Bridge {
	url(path: string): URL;
	secret: string;
}

/**
 * `AGENT_BRIDGE_SECRET` unset means there is no bridge, not an open one — the
 * same rule the rep bridge and the dispatch poke already follow. Every caller
 * has to say what it does without the agent.
 */
export function bridge(): Bridge | null {
	const secret = process.env.AGENT_BRIDGE_SECRET?.trim();
	if (!secret) return null;

	const base = process.env.AGENT_URL?.trim() || DEFAULT_AGENT_URL;

	return { url: (path) => new URL(path, base), secret };
}
