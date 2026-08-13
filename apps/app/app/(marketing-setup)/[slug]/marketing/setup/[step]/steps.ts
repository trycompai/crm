export const STEPS = [
	{ id: "connect", title: "Connect" },
	{ id: "domain", title: "Domain" },
	{ id: "identity", title: "Identity" },
	{ id: "test", title: "Test" },
] as const;

export type SetupStepId = (typeof STEPS)[number]["id"];

export function isSetupStep(value: string): value is SetupStepId {
	return STEPS.some((step) => step.id === value);
}
