import type { Prisma } from "@crm/db";

export type StoredBuilderAttachment = {
	id: string;
	name: string;
	mediaType: string;
	size: number;
};

export function builderMessageWithAttachments(
	value: Prisma.JsonValue,
	attachments: StoredBuilderAttachment[],
	shareToken?: string,
): Prisma.JsonObject {
	const message = recordOf(value);
	return {
		...message,
		attachments: attachments.map((attachment) => ({
			id: attachment.id,
			name: attachment.name,
			type: attachment.mediaType,
			size: attachment.size,
			previewUrl: isPreviewableImage(attachment.mediaType)
				? attachmentUrl(attachment.id, shareToken)
				: null,
		})),
	} as Prisma.JsonObject;
}

export function isPreviewableImage(mediaType: string): boolean {
	return ["image/gif", "image/jpeg", "image/png", "image/webp"].includes(
		mediaType.toLowerCase(),
	);
}

function attachmentUrl(id: string, shareToken?: string): string {
	const path = `/api/conversations/attachments/${encodeURIComponent(id)}`;
	return shareToken ? `${path}?share=${encodeURIComponent(shareToken)}` : path;
}

function recordOf(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
