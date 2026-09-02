import { createHmac, timingSafeEqual } from "node:crypto";

export const SLACK_SIGNATURE = {
	version: "v0",
	timestampHeader: "x-slack-request-timestamp",
	signatureHeader: "x-slack-signature",
	toleranceSeconds: 300,
} as const;

export type SignatureVerdict = { ok: true } | { ok: false; reason: string };

export type SignatureInput = {
	body: string;
	timestamp: string | undefined;
	signature: string | undefined;
	secret: string | undefined;
	now?: number;
};

export function verifySlackSignature(input: SignatureInput): SignatureVerdict {
	const { body, timestamp, signature, secret } = input;

	if (!secret) return { ok: false, reason: "no signing secret is configured" };
	if (!timestamp)
		return { ok: false, reason: "the timestamp header is missing" };
	if (!signature)
		return { ok: false, reason: "the signature header is missing" };

	const sent = Number(timestamp);
	if (!Number.isFinite(sent)) {
		return { ok: false, reason: "the timestamp is not a number" };
	}

	const now = Math.floor((input.now ?? Date.now()) / 1000);
	if (Math.abs(now - sent) > SLACK_SIGNATURE.toleranceSeconds) {
		return { ok: false, reason: "the timestamp is outside the replay window" };
	}

	const expected = signBody(body, timestamp, secret);
	return sameSignature(expected, signature)
		? { ok: true }
		: { ok: false, reason: "the signature does not match" };
}

export function signBody(
	body: string,
	timestamp: string,
	secret: string,
): string {
	const digest = createHmac("sha256", secret)
		.update(`${SLACK_SIGNATURE.version}:${timestamp}:${body}`)
		.digest("hex");

	return `${SLACK_SIGNATURE.version}=${digest}`;
}

function sameSignature(expected: string, received: string): boolean {
	const a = Buffer.from(expected, "utf8");
	const b = Buffer.from(received, "utf8");

	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}
