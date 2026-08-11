import { z } from "zod";
import { listInput } from "../trpc/list-input";

export const customerInstanceStatuses = [
	"DISCOVERED",
	"UNMANAGED",
	"PROVISIONING",
	"ACTIVE",
	"PAUSED",
	"DECOMMISSIONED",
	"FAILED",
] as const;

export const instancesListInput = listInput.extend({
	status: z.enum(["all", ...customerInstanceStatuses]).default("all"),
	environment: z.string().trim().max(80).default("all"),
	provider: z.string().trim().max(80).default("all"),
});

export const instanceIdInput = z.object({ id: z.string().min(1) });

export type InstancesListInput = z.infer<typeof instancesListInput>;
