import type { SetupStep } from "@crm/db/marketing";

export const STEP_LABEL: Record<SetupStep, string> = {
	connect: "connect Resend",
	identity: "set the from address and postal address",
	domain: "verify a sending domain",
};

export function describeMissing(missing: SetupStep[]): string {
	return missing.map((step) => STEP_LABEL[step]).join(", ");
}
