import { describe, expect, it } from "bun:test";
import {
	SLACK_SIGNATURE,
	signBody,
	verifySlackSignature,
} from "../src/slack-signature";

const secret = "8f742231b10e8888abcd99yyyzzz85a5";
const body =
	'{"type":"event_callback","event":{"type":"member_joined_channel"}}';
const now = 1_700_000_000_000;
const timestamp = String(Math.floor(now / 1000));
const signature = signBody(body, timestamp, secret);

const verify = (
	overrides: Partial<Parameters<typeof verifySlackSignature>[0]>,
) =>
	verifySlackSignature({
		body,
		timestamp,
		signature,
		secret,
		now,
		...overrides,
	});

describe("verifySlackSignature", () => {
	it("accepts a body Slack actually signed", () => {
		expect(verify({})).toEqual({ ok: true });
	});

	it("refuses a body that changed by one byte", () => {
		const tampered = `${body.slice(0, -1)} `;
		expect(verify({ body: tampered }).ok).toBe(false);
	});

	it("refuses a signature from a different secret", () => {
		const other = signBody(body, timestamp, "a-different-signing-secret");
		expect(verify({ signature: other }).ok).toBe(false);
	});

	it("refuses a replay outside the window", () => {
		const old = String(
			Math.floor(now / 1000) - SLACK_SIGNATURE.toleranceSeconds - 1,
		);
		const verdict = verify({
			timestamp: old,
			signature: signBody(body, old, secret),
		});

		expect(verdict).toEqual({
			ok: false,
			reason: "the timestamp is outside the replay window",
		});
	});

	it("accepts a request at the edge of the window", () => {
		const edge = String(
			Math.floor(now / 1000) - SLACK_SIGNATURE.toleranceSeconds,
		);
		expect(
			verify({ timestamp: edge, signature: signBody(body, edge, secret) }).ok,
		).toBe(true);
	});

	it("refuses a future timestamp outside the window", () => {
		const ahead = String(
			Math.floor(now / 1000) + SLACK_SIGNATURE.toleranceSeconds + 1,
		);
		expect(
			verify({ timestamp: ahead, signature: signBody(body, ahead, secret) }).ok,
		).toBe(false);
	});

	it("fails closed when no signing secret is configured", () => {
		expect(verify({ secret: undefined })).toEqual({
			ok: false,
			reason: "no signing secret is configured",
		});
	});

	it("refuses a request missing either header", () => {
		expect(verify({ timestamp: undefined }).ok).toBe(false);
		expect(verify({ signature: undefined }).ok).toBe(false);
	});

	it("refuses a timestamp that is not a number", () => {
		expect(verify({ timestamp: "not-a-time" })).toEqual({
			ok: false,
			reason: "the timestamp is not a number",
		});
	});

	it("refuses an empty signature rather than comparing lengths oddly", () => {
		expect(verify({ signature: "" }).ok).toBe(false);
	});

	it("signs in the exact form Slack documents", () => {
		expect(signature.startsWith(`${SLACK_SIGNATURE.version}=`)).toBe(true);
		expect(signature).toHaveLength(SLACK_SIGNATURE.version.length + 1 + 64);
	});
});
