import { z } from "zod";

const httpsUrl = z
	.url()
	.refine((value) => new URL(value).protocol === "https:", {
		message: "URL must use HTTPS",
	});

const httpsOrigin = httpsUrl.refine(
	(value) => new URL(value).origin === value,
	{
		message: "Origin must not contain a path",
	},
);

const vendorAccess = z.object({
	url: httpsUrl,
	scopes: z.array(z.string().trim().min(1)).min(1),
});

export const accessMode = z.enum(["read_only", "read_write"]);

export const vendorSchema = z
	.object({
		slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
		name: z.string().trim().min(1),
		presentation: z.object({
			description: z.string().trim().min(1),
			bringsIn: z.string().trim().min(1),
			sendsReadOnly: z.string().trim().min(1),
			sendsReadWrite: z.string().trim().min(1),
		}),
		mcp: z.object({
			resource: httpsUrl,
			transport: z.literal("streamable-http"),
		}),
		auth: z.object({
			kind: z.literal("mcp_oauth"),
			authorizationServers: z.array(httpsOrigin).min(1),
			endpointOrigins: z.array(httpsOrigin).optional(),
			consentPrompt: z.boolean().optional(),
		}),
		access: z.object({
			read_only: vendorAccess,
			read_write: vendorAccess,
		}),
		riskyTools: z.array(z.string().trim().min(1)).optional(),
		docsHosts: z.array(z.hostname()).min(1),
		source: z.object({
			providerDocs: httpsUrl,
			tools: httpsUrl,
			checkedAt: z.iso.date(),
		}),
	})
	.superRefine((vendor, context) => {
		const readScopes = new Set(vendor.access.read_only.scopes);
		const writeScopes = new Set(vendor.access.read_write.scopes);

		if (readScopes.size !== vendor.access.read_only.scopes.length) {
			context.addIssue({
				code: "custom",
				path: ["access", "read_only", "scopes"],
				message: "Scopes must be unique",
			});
		}

		if (writeScopes.size !== vendor.access.read_write.scopes.length) {
			context.addIssue({
				code: "custom",
				path: ["access", "read_write", "scopes"],
				message: "Scopes must be unique",
			});
		}

		for (const scope of readScopes) {
			if (!writeScopes.has(scope)) {
				context.addIssue({
					code: "custom",
					path: ["access", "read_write", "scopes"],
					message: `Read and write access must include ${scope}`,
				});
			}
		}
	});

export type AccessMode = z.infer<typeof accessMode>;
export type Vendor = z.infer<typeof vendorSchema>;

export function parseVendor(value: z.input<typeof vendorSchema>): Vendor {
	return vendorSchema.parse(value);
}
