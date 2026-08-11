import { z } from "zod";
import { listInput } from "../trpc/list-input";

export const customerAccountStatuses = [
	"PROSPECT",
	"ACTIVE",
	"SUSPENDED",
	"CLOSED",
] as const;

export const customerOnboardingStatuses = [
	"DISCOVERY",
	"SYSTEMS",
	"DATA_ACCESS",
	"INGESTION",
	"READY",
	"LIVE",
] as const;

export const customerListInput = listInput.extend({
	status: z.enum(["all", ...customerAccountStatuses]).default("all"),
	onboardingStatus: z
		.enum(["all", ...customerOnboardingStatuses])
		.default("all"),
	owner: z.string().trim().max(120).default("all"),
});

export const customerIdInput = z.object({ id: z.string().min(1) });

export type CustomerListInput = z.infer<typeof customerListInput>;
