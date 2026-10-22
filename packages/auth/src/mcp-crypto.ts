import "@crm/env/load";

import { createSecretBox, type SecretBox } from "./secret-box";

export type McpSecretBox = SecretBox;

export function createMcpSecretBox(
	source: string | undefined = process.env.MCP_ENCRYPTION_KEY,
): McpSecretBox | undefined {
	return createSecretBox(source);
}

export function isMcpEncryptionConfigured(): boolean {
	return createMcpSecretBox() !== undefined;
}
