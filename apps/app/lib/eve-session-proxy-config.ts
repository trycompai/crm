const KIBIBYTE = 1_024;
const MEBIBYTE = 1_024 * KIBIBYTE;

export const EVE_SESSION_PROXY = {
	request: { maxBodyBytes: 16 * MEBIBYTE },
	stream: { maxLineBytes: MEBIBYTE },
} as const;
