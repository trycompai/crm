const ISSUER = "crm-app";
const AUDIENCE = "crm-agent";

const TTL_SECONDS = 120;

export const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:2000";

export function bridgeConfigured(): boolean {
	return Boolean(process.env.AGENT_BRIDGE_SECRET);
}

export async function mintBridgeToken(
	user: {
		id: string;
		email: string;
		name: string;
	},
	record: {
		contactId?: string;
		companyId?: string;
		dealId?: string;
		campaignId?: string;
		campaignNodeId?: string;
		segmentId?: string;
		templateId?: string;
		shellId?: string;
	} = {},
): Promise<string> {
	const secret = process.env.AGENT_BRIDGE_SECRET;
	if (!secret) throw new Error("AGENT_BRIDGE_SECRET is not set.");

	const now = Math.floor(Date.now() / 1000);

	const header = { alg: "HS256", typ: "JWT" };
	const payload = {
		iss: ISSUER,
		aud: AUDIENCE,
		sub: user.id,
		email: user.email,
		name: user.name,
		contactId: record.contactId,
		companyId: record.companyId,
		dealId: record.dealId,
		campaignId: record.campaignId,
		campaignNodeId: record.campaignNodeId,
		segmentId: record.segmentId,
		templateId: record.templateId,
		shellId: record.shellId,
		iat: now,
		nbf: now - 5,
		exp: now + TTL_SECONDS,
	};

	const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
		JSON.stringify(payload),
	)}`;

	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(signingInput),
	);

	return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

function base64url(input: string | Uint8Array): string {
	const bytes =
		typeof input === "string" ? new TextEncoder().encode(input) : input;
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}
