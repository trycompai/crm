import { describe, expect, it } from "bun:test";
import {
	brandToUpdate,
	type CompanySnapshot,
	stillFillable,
} from "../agent/lib/brand-mapping";
import type { Brand } from "../agent/lib/context-dev";

function emptyCompany(
	overrides: Partial<CompanySnapshot> = {},
): CompanySnapshot {
	return {
		name: "Stripe",
		nameIsPlaceholder: false,
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
		email: null,
		linkedinUrl: null,
		twitterUrl: null,
		githubUrl: null,
		pricingUrl: null,
		careersUrl: null,
		...overrides,
	};
}

describe("brandToUpdate", () => {
	const brand: Brand = {
		title: "Stripe",
		description: "Payments infrastructure for the internet.",
		phone: "+1 888 963 8955",
		email: "support@stripe.com",
		colors: [{ hex: "#635bff", name: "Meteor Shower" }],
		logos: [
			{ url: "https://cdn/dark-logo.svg", mode: "dark", type: "logo" },
			{ url: "https://cdn/light-logo.svg", mode: "light", type: "logo" },
			{
				url: "https://cdn/icon.svg",
				mode: "has_opaque_background",
				type: "icon",
			},
		],
		socials: [
			{ type: "x", url: "https://x.com/stripe" },
			{ type: "linkedin", url: "https://linkedin.com/company/stripe" },
			{ type: "github", url: "https://github.com/stripe" },
		],
		address: {
			city: "South San Francisco",
			state_code: "CA",
			country: "United States",
			country_code: "US",
		},
		industries: {
			eic: [{ industry: "Finance", subindustry: "Payments & Money Movement" }],
		},
		links: {
			pricing: "https://stripe.com/pricing",
			careers: "https://stripe.com/jobs",
		},
	};

	it("picks logos by mode and type rather than taking the first", () => {
		const update = brandToUpdate(brand, emptyCompany());

		expect(update.logoUrl).toBe("https://cdn/light-logo.svg");
		expect(update.logoDarkUrl).toBe("https://cdn/dark-logo.svg");
		expect(update.iconUrl).toBe("https://cdn/icon.svg");
	});

	it("maps the rest of the brand onto company fields", () => {
		const update = brandToUpdate(brand, emptyCompany());

		expect(update).toMatchObject({
			description: "Payments infrastructure for the internet.",
			brandColor: "#635bff",
			industry: "Finance",
			subIndustry: "Payments & Money Movement",
			city: "South San Francisco",
			stateCode: "CA",
			country: "United States",
			countryCode: "US",
			phone: "+1 888 963 8955",
			email: "support@stripe.com",
			linkedinUrl: "https://linkedin.com/company/stripe",
			twitterUrl: "https://x.com/stripe",
			githubUrl: "https://github.com/stripe",
			pricingUrl: "https://stripe.com/pricing",
			careersUrl: "https://stripe.com/jobs",
		});
	});

	it("never overwrites a value a human already set", () => {
		const update = brandToUpdate(
			brand,
			emptyCompany({
				description: "Our biggest account — handle with care.",
				city: "London",
				phone: "+44 20 7946 0000",
			}),
		);

		expect(update.description).toBeUndefined();
		expect(update.city).toBeUndefined();
		expect(update.phone).toBeUndefined();
		expect(update.country).toBe("United States");
	});

	it("leaves the name alone unless it is the domain placeholder", () => {
		expect(
			brandToUpdate(brand, emptyCompany({ name: "Stripe Inc" })).name,
		).toBeUndefined();

		expect(
			brandToUpdate(
				brand,
				emptyCompany({ name: "stripe.com", nameIsPlaceholder: true }),
			).name,
		).toBe("Stripe");
	});

	it("writes nothing when the lookup found nothing", () => {
		expect(brandToUpdate({}, emptyCompany())).toEqual({});
	});

	it("falls back to the slogan when there is no description", () => {
		const update = brandToUpdate(
			{ slogan: "Payments, simplified." },
			emptyCompany(),
		);
		expect(update.description).toBe("Payments, simplified.");
	});
});

describe("stillFillable", () => {
	it("drops a field a rep typed while the lookup was in flight", () => {
		const update = brandToUpdate(
			{
				description: "Payments infrastructure for the internet.",
				phone: "+1 888 963 8955",
			},
			emptyCompany(),
		);

		const data = stillFillable(
			update,
			emptyCompany({ description: "Our biggest account — handle with care." }),
		);

		expect(data.description).toBeUndefined();
		expect(data.phone).toBe("+1 888 963 8955");
	});

	it("keeps the icon, which the agent owns rather than shares", () => {
		const update = brandToUpdate(
			{ logos: [{ url: "https://cdn/icon.svg", mode: "light", type: "icon" }] },
			emptyCompany(),
		);

		const data = stillFillable(
			update,
			emptyCompany({ iconUrl: "https://acme.test/favicon.ico" }),
		);

		expect(data.iconUrl).toBe("https://cdn/icon.svg");
	});

	it("drops the name once the placeholder has been answered", () => {
		const update = brandToUpdate(
			{ title: "Stripe" },
			emptyCompany({ name: "stripe.com", nameIsPlaceholder: true }),
		);

		expect(update.name).toBe("Stripe");

		expect(
			stillFillable(update, emptyCompany({ name: "Stripe Inc" })).name,
		).toBeUndefined();
	});
});
