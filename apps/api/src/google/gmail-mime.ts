import {
	decodeBase64Url,
	rootMessageIdFrom,
	stripHtml,
} from "../mailbox/message-text";

export type GmailHeader = { name?: string; value?: string };

export type GmailPart = {
	mimeType?: string;
	filename?: string;
	headers?: GmailHeader[];
	body?: { data?: string; size?: number; attachmentId?: string };
	parts?: GmailPart[];
};

export function header(
	headers: readonly GmailHeader[] | undefined,
	name: string,
): string | null {
	const wanted = name.toLowerCase();
	const found = headers?.find((entry) => entry.name?.toLowerCase() === wanted);
	return found?.value?.trim() ?? null;
}

export function plainTextBody(payload: GmailPart | undefined): string {
	if (!payload) return "";

	const plain = findPart(payload, "text/plain");
	if (plain?.body?.data) return decodeBase64Url(plain.body.data);

	const html = findPart(payload, "text/html");
	if (html?.body?.data) return stripHtml(decodeBase64Url(html.body.data));

	if (payload.body?.data && !payload.filename) {
		return decodeBase64Url(payload.body.data);
	}

	return "";
}

function findPart(part: GmailPart, mimeType: string): GmailPart | null {
	if (part.mimeType === mimeType && !part.filename && part.body?.data) {
		return part;
	}

	for (const child of part.parts ?? []) {
		if (isAttachment(child)) continue;

		const found = findPart(child, mimeType);
		if (found) return found;
	}

	return null;
}

function isAttachment(part: GmailPart): boolean {
	if (part.filename) return true;

	const disposition = header(part.headers, "content-disposition");
	return disposition?.toLowerCase().startsWith("attachment") ?? false;
}

export function rootMessageId(
	headers: readonly GmailHeader[] | undefined,
): string | null {
	return rootMessageIdFrom({
		references: header(headers, "references"),
		inReplyTo: header(headers, "in-reply-to"),
		messageId: header(headers, "message-id"),
	});
}
