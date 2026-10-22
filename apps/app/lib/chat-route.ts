const SHARED_CHAT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isSharedChatToken(value: string): boolean {
	return SHARED_CHAT_TOKEN_PATTERN.test(value);
}

export function adoptChatUrl(
	history: Pick<History, "replaceState">,
	url: string,
): void {
	history.replaceState(null, "", url);
}
