import { z } from "zod";
import { MCP } from "./mcp-config";

const tokenReply = z.object({
	token: z.string().min(1).max(16_384),
	expiresAt: z.number().int().positive().nullable(),
});

export async function mcpConnectionToken(connectionId: string) {
	const secret = process.env.AGENT_BRIDGE_SECRET?.trim();
	if (!secret) throw new Error("MCP token brokering is not configured.");
	const baseUrl = process.env.API_URL?.trim() || MCP.api.baseUrl;
	const url = new URL(
		`/internal/mcp/connections/${encodeURIComponent(connectionId)}/token`,
		baseUrl,
	);
	const response = await fetch(url, {
		headers: { authorization: `Bearer ${secret}` },
		signal: AbortSignal.timeout(MCP.api.timeoutMs),
	});
	if (!response.ok)
		throw new Error(`MCP token request failed: ${response.status}`);
	const parsed = tokenReply.parse(await response.json());
	return parsed.expiresAt
		? { token: parsed.token, expiresAt: parsed.expiresAt }
		: { token: parsed.token };
}
