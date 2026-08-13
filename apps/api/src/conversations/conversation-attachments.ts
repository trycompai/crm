import type { Prisma } from "@crm/db";
import { z } from "zod";

const builderMessageFields = z.record(z.string(), z.json()).catch({});

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
	return {
		...builderMessageFields.parse(value),
		attachments: attachments.map((attachment) => ({
			id: attachment.id,
			name: attachment.name,
			type: attachment.mediaType,
			size: attachment.size,
			previewUrl: isPreviewableImage(attachment.mediaType)
				? attachmentUrl(attachment.id, shareToken)
				: null,
		})),
	};
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
