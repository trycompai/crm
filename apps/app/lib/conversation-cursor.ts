export function conversationCursor({
	sessionId,
	token,
	messages,
}: {
	sessionId: string | null;
	token: string | null;
	messages: number;
}): string | null {
	if (!sessionId) return null;
	return `${sessionId}:${token ?? ""}:${messages}`;
}

export function claimCursor(
	written: { current: string | null },
	cursor: string,
): boolean {
	if (written.current === cursor) return false;
	written.current = cursor;
	return true;
}
