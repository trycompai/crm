const SECOND_MS = 1_000;
const KIBIBYTE_BYTES = 1_024;

export const MCP = {
	chat: {
		defaultListLimit: 10,
	},
	api: {
		baseUrl: "http://127.0.0.1:3001",
		timeoutMs: 10 * SECOND_MS,
	},
	discovery: {
		maxTools: 1_000,
	},
	result: {
		archiveMaxBytes: 32 * KIBIBYTE_BYTES,
		archiveRetainedBytes: 24 * KIBIBYTE_BYTES,
		modelMaxBytes: 16 * KIBIBYTE_BYTES,
		modelRetainedBytes: 12 * KIBIBYTE_BYTES,
	},
} as const;
