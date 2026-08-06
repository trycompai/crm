import { createHash } from "node:crypto";

export function conversationShareTokenHash(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}
