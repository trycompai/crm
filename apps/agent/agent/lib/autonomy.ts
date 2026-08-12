function isExplicitlyEnabled(value: string | undefined): boolean {
	return value?.trim().toLowerCase() === "false";
}

function isProduction(): boolean {
	return (
		process.env.VERCEL_ENV === "production" ||
		process.env.NODE_ENV === "production"
	);
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
		(isProduction() && !process.env.AI_GATEWAY_API_KEY?.trim())
	);
}

export function assertModelSpendAllowed(): void {
	if (modelSpendPaused()) {
		throw new Error("Model spend is paused.");
	}
}

export function directOpenAiAllowed(): boolean {
	return Boolean(
		!modelSpendPaused() &&
			!isProduction() &&
			process.env.LODE_AGENT_OPENAI_MODEL?.trim() &&
			process.env.OPENAI_API_KEY?.trim(),
	);
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
