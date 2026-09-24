export const guyanaOpportunitySources = {
	"government-eprocure": {
		name: "Guyana Government eProcure",
		url: "https://eprocure.gov.gy/",
		collectorUrls: ["https://eprocure.gov.gy/"],
		allowedHosts: ["eprocure.gov.gy"],
		trust: "official-government",
	},
	npta: {
		name: "National Procurement and Tender Administration",
		url: "https://www.npta.gov.gy/procurement-opportunities/",
		collectorUrls: ["https://www.npta.gov.gy/procurement-opportunities/"],
		allowedHosts: ["npta.gov.gy", "www.npta.gov.gy"],
		trust: "official-government",
	},
	"local-content-register": {
		name: "Guyana Local Content Register",
		url: "https://lcregister.petroleum.gov.gy/opportunities/",
		collectorUrls: ["https://lcregister.petroleum.gov.gy/opportunities/"],
		allowedHosts: ["lcregister.petroleum.gov.gy"],
		trust: "official-government",
	},
	idb: {
		name: "Inter-American Development Bank",
		url: "https://www.iadb.org/en/how-we-can-work-together/procurement",
		collectorUrls: ["https://www.iadb.org/en/how-we-can-work-together/procurement"],
		allowedHosts: ["iadb.org", "www.iadb.org"],
		trust: "multilateral-development-bank",
	},
	cdb: {
		name: "Caribbean Development Bank",
		url: "https://www.caribank.org/work-with-us/procurement/procurement-notices",
		collectorUrls: ["https://www.caribank.org/work-with-us/procurement/procurement-notices"],
		allowedHosts: ["caribank.org", "www.caribank.org"],
		trust: "multilateral-development-bank",
	},
	ungm: {
		name: "United Nations Global Marketplace",
		url: "https://www.ungm.org/Public/Notice",
		collectorUrls: ["https://www.ungm.org/Public/Notice"],
		allowedHosts: ["ungm.org", "www.ungm.org"],
		trust: "multilateral",
	},
} as const;

export type GuyanaOpportunitySourceKey = keyof typeof guyanaOpportunitySources;

export function isApprovedGuyanaOpportunitySourceUrl(
	source: GuyanaOpportunitySourceKey,
	sourceUrl: string,
) {
	try {
		const parsed = new URL(sourceUrl);
		if (parsed.protocol !== "https:") return false;
		const allowedHosts: readonly string[] = guyanaOpportunitySources[source].allowedHosts;
		return allowedHosts.includes(parsed.hostname.toLowerCase());
	} catch {
		return false;
	}
}
