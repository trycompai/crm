import { afterEach, describe, expect, it } from "bun:test";
import { zohoEndpoints } from "@crm/auth";
import { MailboxApiClient } from "../src/mailbox/mailbox-api.client";
import { ZohoMailClient } from "../src/zoho/zoho-mail.client";

const realFetch = globalThis.fetch;

type Call = { url: string; authorization: string | null };

type ZohoEnvelope = {
	status: { code: number; description: string };
	data: unknown;
};

function stub(body: ZohoEnvelope, init: { status?: number } = {}) {
	const calls: Call[] = [];

	globalThis.fetch = (async (input: string | URL, options?: RequestInit) => {
		const headers = new Headers(options?.headers);
		calls.push({
			url: String(input),
			authorization: headers.get("authorization"),
		});

		return new Response(JSON.stringify(body), {
			status: init.status ?? 200,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;

	return { calls };
}

function client(): ZohoMailClient {
	return new ZohoMailClient(new MailboxApiClient(), zohoEndpoints("com"));
}

// The envelope is Zoho's wire shape, and the payload inside it is deliberately
// untyped here: these specs exist to prove the client parses whatever arrives.
const envelope = (data: ZohoEnvelope["data"], code = 200): ZohoEnvelope => ({
	status: { code, description: code === 200 ? "success" : "failure" },
	data,
});

afterEach(() => {
	globalThis.fetch = realFetch;
});

describe("talking to Zoho", () => {
	it("authorises with Zoho-oauthtoken, which is the only scheme Zoho accepts", async () => {
		const stubbed = stub(envelope([]));

		await client().accounts("secret-token");

		expect(stubbed.calls[0]?.authorization).toBe(
			"Zoho-oauthtoken secret-token",
		);
	});

	it("ignores the message id Zoho sends as an unsafe integer", async () => {
		// Zoho returns this one as a bare number, past Number.MAX_SAFE_INTEGER,
		// so JSON.parse rounds it before any parser runs. Reading it would be
		// reading a wrong id; the list endpoint's string copy is used instead.
		stub(envelope({ messageId: 1710915488416100000, headerContent: {} }));

		const result = await client().messageHeaders("t", "a", "f", "m");

		expect(result.outcome).toBe("ok");
		if (result.outcome !== "ok") return;

		expect(Object.keys(result.data)).toEqual(["values"]);
	});

	it("unwraps the envelope so callers never see Zoho's status wrapper", async () => {
		stub(
			envelope([
				{
					accountId: "2560636000000008002",
					mailboxAddress: "rep@trycomp.ai",
					type: "ZOHO_ACCOUNT",
				},
			]),
		);

		const result = await client().accounts("token");

		expect(result.outcome).toBe("ok");
		if (result.outcome !== "ok") return;

		// Zoho ships this id as a JSON number that exceeds a safe integer in
		// other endpoints; it is coerced to a string once, at the boundary.
		expect(result.data[0]?.accountId).toBe("2560636000000008002");
		expect(result.data[0]?.mailboxAddress).toBe("rep@trycomp.ai");
	});

	it("believes status.code over the HTTP status", async () => {
		stub(envelope(null, 401), { status: 200 });

		const result = await client().accounts("token");

		expect(result.outcome).toBe("unauthorized");
	});

	it("treats a 404 as cursor-invalid, so one missing message is not a failure", async () => {
		stub(envelope(null, 404), { status: 200 });

		const result = await client().messageContent(
			"token",
			"acct",
			"folder",
			"message",
		);

		expect(result.outcome).toBe("cursor-invalid");
	});

	it("refuses a payload that does not match the schema instead of guessing", async () => {
		stub(envelope([{ folderName: "Inbox" }]));

		const result = await client().folders("token", "acct");

		expect(result.outcome).toBe("failed");
		if (result.outcome !== "failed") return;

		expect(result.retryable).toBe(false);
		expect(result.reason).toContain("cannot read");
	});

	it("reads 'Not Provided' as no recipients rather than as an address", async () => {
		stub(
			envelope([
				{
					messageId: "1",
					folderId: "2",
					fromAddress: "jane@acme.com",
					toAddress: '"Rep" <rep@trycomp.ai>',
					ccAddress: "Not Provided",
					receivedTime: "1709887053409",
				},
			]),
		);

		const result = await client().listMessages("token", "acct", { start: 1 });

		expect(result.outcome).toBe("ok");
		if (result.outcome !== "ok") return;

		expect(result.data[0]?.ccAddress).toBeNull();
		expect(result.data[0]?.receivedTime).toBe(1_709_887_053_409);
	});

	it("lower-cases header names, because the sending server chose the casing", async () => {
		stub(
			envelope({
				headerContent: {
					"Message-Id": ["<a@acme.com>"],
					REFERENCES: ["<root@acme.com>"],
				},
			}),
		);

		const result = await client().messageHeaders("t", "a", "f", "m");

		expect(result.outcome).toBe("ok");
		if (result.outcome !== "ok") return;

		expect(result.data.values.get("message-id")).toEqual(["<a@acme.com>"]);
		expect(result.data.values.get("references")).toEqual(["<root@acme.com>"]);
	});

	it("asks for headers as JSON, not raw, so they arrive already split", async () => {
		const stubbed = stub(envelope({ headerContent: {} }));

		await client().messageHeaders("t", "acct", "folder", "msg");

		expect(stubbed.calls[0]?.url).toContain("raw=false");
		expect(stubbed.calls[0]?.url).toContain(
			"/accounts/acct/folders/folder/messages/msg/header",
		);
	});

	it("pulls sent mail in, which is how an outbound reply gets filed at all", async () => {
		const stubbed = stub(envelope([]));

		await client().listMessages("token", "acct", { start: 11 });

		expect(stubbed.calls[0]?.url).toContain("includesent=true");
		expect(stubbed.calls[0]?.url).toContain("start=11");
	});
});
