import { db } from "@crm/db";
import { mirror } from "@crm/db/blob";
import { writeMarketingSettings } from "@crm/db/marketing";
import { readWorkspaceIdentity } from "@crm/db/workspace";
import { darkenUntilReadable, EMAIL_THEME } from "@crm/email/theme";
import { brandToUpdate, type CompanySnapshot } from "./brand-mapping";
import { brandByDomain, contextDevEnabled } from "./context-dev";

export type BrandPass = {
	wrote: boolean;
	logo: boolean;
	colour: string | null;
	reason?: string;
};

const EMPTY_SNAPSHOT = {
	name: "",
	nameIsPlaceholder: true,
	description: null,
	logoUrl: null,
	logoDarkUrl: null,
	iconUrl: null,
	iconDarkUrl: null,
	iconTone: null,
	brandColor: null,
	industry: null,
	subIndustry: null,
	city: null,
	stateCode: null,
	country: null,
	countryCode: null,
	phone: null,
} as unknown as CompanySnapshot;

function siteUrl(domain: string): string {
	return /^https?:\/\//.test(domain) ? domain : `https://${domain}`;
}

function rasterOnly(url: string | null): string | null {
	if (!url) return null;
	const clean = url.split("?")[0]?.toLowerCase() ?? "";
	return clean.endsWith(".svg") || clean.endsWith(".webp") ? null : url;
}

export async function runMarketingBrand(): Promise<BrandPass> {
	const existing = await db.marketingPartial.count({
		where: { isDefault: true, archivedAt: null },
	});

	if (existing >= 2) {
		return {
			wrote: false,
			logo: false,
			colour: null,
			reason: "Already set up.",
		};
	}

	const workspace = await readWorkspaceIdentity(db).catch(() => null);
	const name = workspace?.name ?? "";
	const domain = workspace?.website ?? null;

	let logoUrl: string | null = null;
	let colour: string | null = null;

	if (domain && (await contextDevEnabled())) {
		const result = await brandByDomain(domain).catch(() => null);

		if (result?.outcome === "found") {
			const mapped = brandToUpdate(result.brand, EMPTY_SNAPSHOT) as {
				logoUrl?: string;
				iconUrl?: string;
				brandColor?: string;
			};

			const raster =
				rasterOnly(mapped.logoUrl ?? null) ??
				rasterOnly(mapped.iconUrl ?? null);

			if (raster) {
				logoUrl = (await mirror(raster, "marketing-logo")) ?? raster;
			}

			if (mapped.brandColor) {
				colour = darkenUntilReadable(mapped.brandColor, "#ffffff");
			}
		}
	}

	const header = { version: 1, blocks: [] };

	const footer = {
		version: 1,
		blocks: [
			{
				type: "text",
				text: [
					{
						text: `You are getting this because you asked us about ${name || "our product"}.`,
					},
				],
			},
		],
	};

	await db.$transaction(async (tx) => {
		if (colour || logoUrl) {
			await writeMarketingSettings(tx, {
				...(colour ? { brandColor: colour } : {}),
				...(logoUrl ? { logoUrl } : {}),
			});
		}

		await tx.marketingPartial.create({
			data: {
				kind: "HEADER",
				name: "Default header",
				isDefault: true,
				document: header,
			},
		});

		await tx.marketingPartial.create({
			data: {
				kind: "FOOTER",
				name: "Default footer",
				isDefault: true,
				document: footer,
			},
		});
	});

	return {
		wrote: true,
		logo: logoUrl !== null,
		colour: colour ?? EMAIL_THEME.brand,
		reason: logoUrl
			? undefined
			: "No usable logo — email needs a raster, and neither the logo nor the icon was one. An SVG will not draw in Outlook.",
	};
}

export function brandPassOutcome(pass: BrandPass): string {
	if (!pass.wrote) return pass.reason ?? "Nothing to do.";

	return pass.logo
		? `Header and footer written with the workspace logo${pass.colour ? ` and ${pass.colour}` : ""}.`
		: `Header and footer written with the wordmark. ${pass.reason ?? ""}`.trim();
}
