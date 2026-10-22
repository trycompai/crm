import { isIP } from "node:net";
import { vendors } from "@crm/mcp-integrations/catalog";
import type { ModelMessage } from "ai";
import { z } from "zod";
import { WEB_POLICY } from "./web-policy-config";

const userContent = z.union([
	z.string().transform((text) => [text]),
	z
		.array(z.object({ type: z.string(), text: z.string().optional() }))
		.transform((parts) =>
			parts.flatMap((part) =>
				part.type === "text" && part.text !== undefined ? [part.text] : [],
			),
		),
]);

const urlInText = /https?:\/\/[^\s<>"'`)\]]+/g;

export const approvedDocumentationUrls = [
	...WEB_POLICY.documentationEntryUrls,
	...vendors.flatMap((vendor) =>
		vendor.docsHosts.map((host) => `https://${host}/`),
	),
] as const;

function normalizedUrl(value: string): string | null {
	const url = URL.parse(value);
	if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
		return null;
	}
	url.hash = "";
	return url.href;
}

function userUrls(messages: readonly ModelMessage[]): Set<string> {
	const urls = new Set<string>();
	for (const message of messages) {
		if (message.role !== "user") continue;
		const texts = userContent.safeParse(message.content).data ?? [];
		for (const text of texts) {
			for (const match of text.matchAll(urlInText)) {
				const url = normalizedUrl(match[0].replace(/[.,;:!?]+$/, ""));
				if (url) urls.add(url);
			}
		}
	}
	return urls;
}

function publicHttps(url: URL): boolean {
	const host = url.hostname.replace(/^\[(.*)\]$/, "$1").replace(/\.$/, "");
	return (
		url.protocol === "https:" &&
		url.username === "" &&
		url.password === "" &&
		isIP(host) === 0 &&
		host.includes(".") &&
		!/(^|\.)(localhost|local|internal)$/i.test(host)
	);
}

export function webFetchAllowed(
	value: string,
	messages: readonly ModelMessage[],
	documentationUrls: readonly string[] = approvedDocumentationUrls,
): boolean {
	const url = normalizedUrl(value);
	if (!url) return false;
	const parsed = new URL(url);
	if (!publicHttps(parsed)) return false;
	if (userUrls(messages).has(url)) return true;
	return (
		parsed.search === "" &&
		documentationUrls.some((document) => normalizedUrl(document) === url)
	);
}

export function refuseWebSearch(_input: { query: string }): never {
	throw new Error(
		"Search is disabled in workspace chats. Open an approved public document or ask the user for an exact link.",
	);
}
