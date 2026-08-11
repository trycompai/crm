function isExplicitlyEnabled(value: string | undefined): boolean {
	return value?.trim().toLowerCase() === "false";
}

export function providerMutationsPaused(): boolean {
	return !isExplicitlyEnabled(process.env.PROVIDER_MUTATIONS_PAUSED);
}

export function outreachSendsPaused(): boolean {
	return (
		providerMutationsPaused() ||
		!isExplicitlyEnabled(process.env.OUTREACH_SENDS_PAUSED)
	);
}

export function modelSpendPaused(): boolean {
	return !isExplicitlyEnabled(process.env.AI_GATEWAY_SPEND_PAUSED);
}

export function directTaskKinds(kinds: readonly string[]): readonly string[] {
	if (providerMutationsPaused()) {
		return kinds.filter(
			(kind) => kind !== "email-draft-send" && kind !== "portrait",
		);
	}
	if (outreachSendsPaused()) {
		return kinds.filter((kind) => kind !== "email-draft-send");
	}
	return kinds;
}
