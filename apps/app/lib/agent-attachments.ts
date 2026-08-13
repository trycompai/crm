const MEGABYTE = 1024 * 1024;

export const AGENT_ATTACHMENTS = {
	image: {
		maxBytes: 4 * MEGABYTE,
		maxCount: 4,
		mediaTypes: ["image/gif", "image/jpeg", "image/png", "image/webp"],
	},
	copy: {
		unsupportedType:
			"That image format cannot go to the agent. Send a GIF, JPEG, PNG or WebP.",
		readFailed: "That image could not be read. Attach it again.",
	},
} as const;

const SUPPORTED_IMAGE_TYPES = new Set<string>(
	AGENT_ATTACHMENTS.image.mediaTypes,
);

export const IMAGE_ACCEPT = AGENT_ATTACHMENTS.image.mediaTypes.join(",");

export type DraftAttachment = {
	id: string;
	dataUrl: string;
	mediaType: string;
	filename: string | null;
	size: number;
};

function mediaTypeOf(value: string): string {
	return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isSupportedImageType(mediaType: string): boolean {
	return SUPPORTED_IMAGE_TYPES.has(mediaTypeOf(mediaType));
}

export function isImage(file: File): boolean {
	return isSupportedImageType(file.type);
}

export function isUnsupportedImage(file: File): boolean {
	return file.type.startsWith("image/") && !isSupportedImageType(file.type);
}

export function tooLarge(file: File): boolean {
	return file.size > AGENT_ATTACHMENTS.image.maxBytes;
}

export function sizeLimitLabel(): string {
	return `${Math.round(AGENT_ATTACHMENTS.image.maxBytes / MEGABYTE)} MB`;
}

export function toDraftAttachment(file: File): Promise<DraftAttachment> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error);
		reader.onload = () =>
			resolve({
				id: crypto.randomUUID(),
				dataUrl: String(reader.result),
				mediaType: file.type,
				filename: file.name || null,
				size: file.size,
			});
		reader.readAsDataURL(file);
	});
}
