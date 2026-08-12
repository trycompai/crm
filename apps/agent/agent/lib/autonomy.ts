function isExplicitlyEnabled(value: string | undefined): boolean {
	return value?.trim().toLowerCase() === "false";
}

export function providerMutationsPaused(): boolean {
	return !isExplicitlyEnabled(process.env.PROVIDER_MUTATIONS_PAUSED);
}

export function assertProviderMutationsAllowed(): void {
	if (providerMutationsPaused()) {
		throw new Error("Provider mutations are paused.");
	}
}

export function outreachSendsPaused(): boolean {
	return (
		providerMutationsPaused() ||
		!isExplicitlyEnabled(process.env.OUTREACH_SENDS_PAUSED)
	);
}

export function modelSpendPaused(): boolean {
	return (
		process.env.AI_GATEWAY_SPEND_PAUSED !== "false" ||
		!process.env.AI_GATEWAY_API_KEY?.trim()
	);
}

export function assertModelSpendAllowed(): void {
	if (modelSpendPaused()) {
		throw new Error("Model spend is paused.");
	}
}

export function directTaskKinds(kinds: readonly string[]): readonly string[] {
	if (providerMutationsPaused()) {
		return kinds.filter(
			(kind) =>
				kind !== "email-draft-send" &&
				kind !== "portrait" &&
				kind !== "slack-channel-join",
		);
	}
	if (outreachSendsPaused()) {
		return kinds.filter((kind) => kind !== "email-draft-send");
	}
	return kinds;
}
