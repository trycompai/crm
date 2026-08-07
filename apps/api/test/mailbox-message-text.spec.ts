import { describe, expect, it } from "bun:test";
import {
	type GmailPart,
	header,
	plainTextBody,
	rootMessageId,
} from "../src/google/gmail-mime";
import {
	decodeBase64Url,
	firstMessageId,
	normaliseMessageId,
	rootMessageIdFrom,
	snippetOf,
	stripHtml,
	stripQuotedHistory,
} from "../src/mailbox/message-text";

const encode = (text: string): string =>
	Buffer.from(text, "utf8")
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

describe("header", () => {
	const headers = [
		{ name: "Message-ID", value: "<abc@mail.acme.com>" },
		{ name: "subject", value: "Pricing" },
	];

	it("is case-insensitive", () => {
		expect(header(headers, "message-id")).toBe("<abc@mail.acme.com>");
		expect(header(headers, "SUBJECT")).toBe("Pricing");
	});

	it("returns null for an absent header", () => {
		expect(header(headers, "cc")).toBeNull();
		expect(header(undefined, "cc")).toBeNull();
	});
});

describe("decodeBase64Url", () => {
	it("decodes unpadded base64url", () => {
		expect(decodeBase64Url(encode("Hello, world"))).toBe("Hello, world");
	});

	it("survives junk without throwing", () => {
		expect(() => decodeBase64Url("!!!!")).not.toThrow();
	});
});

describe("plainTextBody", () => {
	it("prefers text/plain from a nested multipart", () => {
		const payload: GmailPart = {
			mimeType: "multipart/mixed",
			parts: [
				{
					mimeType: "multipart/alternative",
					parts: [
						{ mimeType: "text/plain", body: { data: encode("The plain one") } },
						{
							mimeType: "text/html",
							body: { data: encode("<p>The HTML one</p>") },
						},
					],
				},
			],
		};

		expect(plainTextBody(payload)).toBe("The plain one");
	});

	it("falls back to stripped HTML when there is no plain part", () => {
		const payload: GmailPart = {
			mimeType: "text/html",
			body: { data: encode("<p>Hello</p><p>World</p>") },
		};

		expect(plainTextBody(payload)).toBe("Hello\nWorld");
	});

	it("ignores attachment parts", () => {
		const payload: GmailPart = {
			mimeType: "multipart/mixed",
			parts: [
				{
					mimeType: "text/plain",
					filename: "notes.txt",
					body: { data: encode("attachment text") },
				},
				{ mimeType: "text/plain", body: { data: encode("body text") } },
			],
		};

		expect(plainTextBody(payload)).toBe("body text");
	});

	it("does not read the body out of a forwarded-email attachment", () => {
		const payload: GmailPart = {
			mimeType: "multipart/mixed",
			parts: [
				{
					mimeType: "message/rfc822",
					filename: "Fwd Pricing.eml",
					parts: [
						{
							mimeType: "text/plain",
							body: { data: encode("the forwarded original") },
						},
					],
				},
				{ mimeType: "text/plain", body: { data: encode("See attached.") } },
			],
		};

		expect(plainTextBody(payload)).toBe("See attached.");
	});

	it("does not read the body out of an attachment declared by disposition", () => {
		const payload: GmailPart = {
			mimeType: "multipart/mixed",
			parts: [
				{
					mimeType: "multipart/alternative",
					headers: [
						{ name: "Content-Disposition", value: 'attachment; filename=""' },
					],
					parts: [
						{
							mimeType: "text/plain",
							body: { data: encode("inside the attachment") },
						},
					],
				},
				{
					mimeType: "text/html",
					body: { data: encode("<p>The real body</p>") },
				},
			],
		};

		expect(plainTextBody(payload)).toBe("The real body");
	});

	it("is empty when every candidate is inside an attachment", () => {
		const payload: GmailPart = {
			mimeType: "multipart/mixed",
			parts: [
				{
					mimeType: "message/rfc822",
					filename: "Fwd Pricing.eml",
					parts: [
						{ mimeType: "text/plain", body: { data: encode("forwarded") } },
					],
				},
			],
		};

		expect(plainTextBody(payload)).toBe("");
	});

	it("is empty rather than undefined for an empty payload", () => {
		expect(plainTextBody(undefined)).toBe("");
	});
});

describe("stripHtml", () => {
	it("drops style and script blocks entirely", () => {
		const html = "<style>p{color:red}</style><script>x()</script><p>Real</p>";
		expect(stripHtml(html)).toBe("Real");
	});

	it("decodes the common entities", () => {
		expect(stripHtml("<p>Tom &amp; Jerry &lt;3</p>")).toBe("Tom & Jerry <3");
	});
});

describe("stripQuotedHistory", () => {
	it("cuts a Gmail-style reply at the quote", () => {
		const body = [
			"Sounds good — Tuesday works.",
			"",
			"On Tue, 5 Aug 2025 at 14:02, Jane <jane@acme.com> wrote:",
			"> Are you free Tuesday?",
		].join("\n");

		expect(stripQuotedHistory(body)).toBe("Sounds good — Tuesday works.");
	});

	it("cuts an Outlook-style reply", () => {
		const body = [
			"Approved.",
			"",
			"-----Original Message-----",
			"From: Jane",
		].join("\n");

		expect(stripQuotedHistory(body)).toBe("Approved.");
	});

	it("cuts a forwarded block", () => {
		const body =
			"See below.\n\n---------- Forwarded message ---------\nFrom: X";
		expect(stripQuotedHistory(body)).toBe("See below.");
	});

	it("drops trailing quote lines when there is no marker", () => {
		expect(stripQuotedHistory("Yes.\n> earlier\n> earlier still")).toBe("Yes.");
	});

	it("leaves an unquoted body alone", () => {
		expect(stripQuotedHistory("Just a first message.")).toBe(
			"Just a first message.",
		);
	});
});

describe("rootMessageId", () => {
	it("takes the first entry of References — the thread root", () => {
		const headers = [
			{ name: "References", value: "<root@acme.com> <second@acme.com>" },
			{ name: "In-Reply-To", value: "<second@acme.com>" },
			{ name: "Message-ID", value: "<third@acme.com>" },
		];

		expect(rootMessageId(headers)).toBe("root@acme.com");
	});

	it("falls back to In-Reply-To when References is absent", () => {
		const headers = [
			{ name: "In-Reply-To", value: "<second@acme.com>" },
			{ name: "Message-ID", value: "<third@acme.com>" },
		];

		expect(rootMessageId(headers)).toBe("second@acme.com");
	});

	it("uses its own id when the message starts the thread", () => {
		expect(
			rootMessageId([{ name: "Message-ID", value: "<first@acme.com>" }]),
		).toBe("first@acme.com");
	});

	it("gives two mailboxes' copies of one conversation the same root", () => {
		const repA = [
			{ name: "References", value: "<root@acme.com>" },
			{ name: "Message-ID", value: "<reply-a@trycomp.ai>" },
		];
		const repB = [
			{ name: "References", value: "<root@acme.com> <reply-a@trycomp.ai>" },
			{ name: "Message-ID", value: "<reply-b@trycomp.ai>" },
		];

		expect(rootMessageId(repA)).toBe(rootMessageId(repB));
	});
});

describe("rootMessageIdFrom", () => {
	it("gives a Gmail copy and an Outlook copy of one thread the same root", () => {
		const viaGmailHeaders = rootMessageId([
			{ name: "References", value: "<root@acme.com> <second@acme.com>" },
			{ name: "Message-ID", value: "<third@trycomp.ai>" },
		]);

		const viaGraphFields = rootMessageIdFrom({
			references: "<root@acme.com> <second@acme.com>",
			inReplyTo: "<second@acme.com>",
			messageId: "<fourth@trycomp.ai>",
		});

		expect(viaGraphFields).toBe("root@acme.com");
		expect(viaGraphFields).toBe(viaGmailHeaders);
	});

	it("falls back to its own id when Graph returned no headers at all", () => {
		expect(
			rootMessageIdFrom({
				references: null,
				inReplyTo: null,
				messageId: "<only@acme.com>",
			}),
		).toBe("only@acme.com");
	});

	it("is null when there is nothing to thread on", () => {
		expect(
			rootMessageIdFrom({ references: null, inReplyTo: null, messageId: null }),
		).toBeNull();
	});

	it("takes the first id when In-Reply-To carries a list", () => {
		expect(
			rootMessageIdFrom({
				references: null,
				inReplyTo: "<a@acme.com> <b@acme.com>",
				messageId: "<reply@trycomp.ai>",
			}),
		).toBe("a@acme.com");
	});

	it("keeps a multi-id In-Reply-To on the same thread as the single-id copy", () => {
		const listed = rootMessageIdFrom({
			references: null,
			inReplyTo: "<a@acme.com>\r\n\t<b@acme.com>",
			messageId: "<reply-a@trycomp.ai>",
		});
		const single = rootMessageIdFrom({
			references: null,
			inReplyTo: "<a@acme.com>",
			messageId: "<reply-b@trycomp.ai>",
		});

		expect(listed).toBe("a@acme.com");
		expect(listed).toBe(single);
	});

	it("accepts a bracketless id in either header", () => {
		expect(
			rootMessageIdFrom({
				references: "root@acme.com second@acme.com",
				inReplyTo: null,
				messageId: "<third@acme.com>",
			}),
		).toBe("root@acme.com");

		expect(
			rootMessageIdFrom({
				references: null,
				inReplyTo: "second@acme.com",
				messageId: "<third@acme.com>",
			}),
		).toBe("second@acme.com");
	});

	it("ignores a blank References and threads on In-Reply-To", () => {
		expect(
			rootMessageIdFrom({
				references: "   ",
				inReplyTo: "<second@acme.com>",
				messageId: "<third@acme.com>",
			}),
		).toBe("second@acme.com");
	});
});

describe("firstMessageId", () => {
	it("normalises a single bracketed id", () => {
		expect(firstMessageId("<Abc@Acme.com>")).toBe("abc@acme.com");
	});

	it("returns null when there is no id at all", () => {
		expect(firstMessageId("  ")).toBeNull();
		expect(firstMessageId("<>")).toBeNull();
	});
});

describe("normaliseMessageId", () => {
	it("makes bracketed and bare ids the same identity", () => {
		expect(normaliseMessageId("<Abc@Acme.com>")).toBe(
			normaliseMessageId("abc@acme.com"),
		);
	});
});

describe("snippetOf", () => {
	it("collapses whitespace", () => {
		expect(snippetOf("a\n\n  b")).toBe("a b");
	});

	it("truncates with an ellipsis", () => {
		expect(snippetOf("x".repeat(300))?.length).toBe(200);
		expect(snippetOf("x".repeat(300))?.endsWith("…")).toBe(true);
	});

	it("is null for an empty body", () => {
		expect(snippetOf("   ")).toBeNull();
	});
});
