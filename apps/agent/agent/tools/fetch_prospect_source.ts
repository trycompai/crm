import { createHash } from "node:crypto";
import { db } from "@crm/db";
import { safeFetch } from "@crm/db/safe-fetch";
import { defineTool } from "eve/tools";
import { z } from "zod";

const MAX_SOURCE_BYTES = 1_000_000;
const MAX_SOURCE_TEXT = 120_000;

export default defineTool({
	description:
		"Fetch a public prospect source safely and store a tamper-evident receipt. Use the returned receipt id for every retained evidence item.",
	inputSchema: z.object({
		prospectId: z.string(),
		url: z.string().trim().url(),
	}),
	async execute({ prospectId, url }, ctx) {
		const attributes = ctx.session.auth.current?.attributes;
		if (
			attributes?.taskKind !== "prospect-research" ||
			attributes.prospectId !== prospectId
		) {
			return {
				fetched: false as const,
				reason: "This source does not belong to the dispatched prospect task.",
			};
		}

		const exists = await db.prospect.findUnique({
			where: { id: prospectId },
			select: { id: true },
		});
		if (!exists)
			return { fetched: false as const, reason: "No such prospect." };

		const result = await safeFetch(url, {
			timeoutMs: 15_000,
			headers: { accept: "text/html,text/plain,application/xhtml+xml" },
		});
		if (!result) {
			return {
				fetched: false as const,
				reason: "The public page could not be fetched safely.",
			};
		}
		if (!result.response.ok) {
			await result.response.body?.cancel();
			return {
				fetched: false as const,
				reason: `The public page returned status ${result.response.status}.`,
			};
		}

		const contentType = result.response.headers.get("content-type");
		if (
			!contentType?.includes("text/html") &&
			!contentType?.includes("text/plain") &&
			!contentType?.includes("application/xhtml+xml")
		) {
			await result.response.body?.cancel();
			return {
				fetched: false as const,
				reason: "The source is not a readable public page.",
			};
		}

		const bytes = await readBounded(result.response, MAX_SOURCE_BYTES);
		if (!bytes) {
			return {
				fetched: false as const,
				reason: "The source exceeded the safe fetch limit.",
			};
		}

		const raw = new TextDecoder().decode(bytes);
		const contentText = readableText(raw).slice(0, MAX_SOURCE_TEXT);
		if (!contentText) {
			return {
				fetched: false as const,
				reason: "The source did not contain readable text.",
			};
		}

		const contentHash = createHash("sha256").update(bytes).digest("hex");
		const receipt = await db.prospectSourceReceipt.create({
			data: {
				prospectId,
				requestedUrl: url,
				finalUrl: result.url.toString(),
				statusCode: result.response.status,
				contentType,
				contentHash,
				contentText,
			},
		});

		return {
			fetched: true as const,
			receiptId: receipt.id,
			finalUrl: receipt.finalUrl,
			statusCode: receipt.statusCode,
			fetchedAt: receipt.fetchedAt.toISOString(),
			contentHash,
			text: contentText,
		};
	},
});

async function readBounded(
	response: Response,
	limit: number,
): Promise<Uint8Array | null> {
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > limit) {
		await response.body?.cancel();
		return null;
	}

	if (!response.body) return new Uint8Array();
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > limit) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}

	const output = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return output;
}

function readableText(html: string): string {
	return html
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
		.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;|&#160;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&quot;|&#34;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/\s+/g, " ")
		.trim();
}
