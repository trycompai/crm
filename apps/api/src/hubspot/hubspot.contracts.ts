import { z } from "zod";

export const hubspotStatusOutput = z.object({
	configured: z.boolean(),
	connected: z.boolean(),
	canManage: z.boolean(),
	portalId: z.string().nullable(),
	portalDomain: z.string().nullable(),
	installerEmail: z.string().nullable(),
	scopes: z.array(z.string()),
	canReadDeals: z.boolean(),
	connectedAt: z.string().nullable(),
	lastReadAt: z.string().nullable(),
	lastError: z.string().nullable(),
	lastErrorAt: z.string().nullable(),
	revokedAt: z.string().nullable(),
	pipelines: z.array(
		z.object({
			id: z.string(),
			label: z.string(),
			stages: z.array(
				z.object({
					id: z.string(),
					label: z.string(),
					outcome: z.enum(["OPEN", "WON", "LOST"]),
				}),
			),
		}),
	),
});

export type HubspotStatus = z.infer<typeof hubspotStatusOutput>;

export const hubspotDisconnectOutput = z.object({
	disconnected: z.boolean(),
});

export type HubspotDisconnectResult = z.infer<typeof hubspotDisconnectOutput>;
