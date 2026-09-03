import { afterEach, describe, expect, it } from "bun:test";
import {
	directChildren,
	directParent,
	getEntity,
	resolveCountries,
	searchEntities,
} from "../agent/lib/gleif";
import { GLEIF } from "../agent/lib/gleif-config";
import fixtures from "./fixtures/gleif.json";

const realFetch = globalThis.fetch;

const requested: string[] = [];

function replies(reply: (url: URL) => { status?: number; body: unknown }) {
	globalThis.fetch = (async (input: URL | RequestInfo) => {
		const url = new URL(String(input instanceof Request ? input.url : input));
		requested.push(url.toString());
		const { status, body } = reply(url);
		return new Response(JSON.stringify(body), {
			status: status ?? 200,
			headers: { "content-type": "application/vnd.api+json" },
		});
	}) as typeof fetch;
}

afterEach(() => {
	globalThis.fetch = realFetch;
	requested.length = 0;
});

describe("resolveCountries", () => {
	it("expands a region name", () => {
		expect(resolveCountries("UE")).toEqual([...GLEIF.regions.UE]);
	});

	it("accepts ISO codes, mixed case, and drops junk", () => {
		expect(resolveCountries(" us, ca ,Asie,xyz")).toEqual([
			"US",
			"CA",
			...GLEIF.regions.ASIE,
		]);
	});

	it("is empty for nothing", () => {
		expect(resolveCountries(undefined)).toEqual([]);
		expect(resolveCountries("")).toEqual([]);
	});
});

describe("searchEntities", () => {
	it("parses a search page into entities and sends the filters", async () => {
		replies(() => ({ body: fixtures.search }));

		const result = await searchEntities({ name: "Renault", country: "fr" });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.total).toBe(22);
		expect(result.data.entities[0]).toEqual({
			lei: "969500F7JLTX36OUI695",
			name: "RENAULT",
			alternativeNames: [],
			country: "FR",
			city: "BOULOGNE-BILLANCOURT",
			status: "ACTIVE",
			registrationStatus: "ISSUED",
			category: "GENERAL",
			jurisdiction: "FR",
		});

		const url = new URL(requested[0] ?? "");
		expect(url.searchParams.get("filter[entity.legalName]")).toBe("Renault");
		expect(url.searchParams.get("filter[entity.legalAddress.country]")).toBe(
			"FR",
		);
		expect(url.searchParams.get("filter[entity.status]")).toBe("ACTIVE");
		expect(url.searchParams.get("filter[entity.category]")).toBe("GENERAL");
	});

	it("drops the category filter on ANY", async () => {
		replies(() => ({ body: fixtures.search }));

		await searchEntities({ name: "Renault", category: "ANY" });

		const url = new URL(requested[0] ?? "");
		expect(url.searchParams.has("filter[entity.category]")).toBe(false);
	});

	it("reports an HTTP failure as a reason, never a throw", async () => {
		replies(() => ({ status: 503, body: {} }));

		const result = await searchEntities({ name: "Renault" });

		expect(result).toEqual({ ok: false, reason: "HTTP 503" });
	});

	it("refuses a response that is not the GLEIF shape", async () => {
		replies(() => ({ body: { data: [{ id: "short" }] } }));

		const result = await searchEntities({ name: "Renault" });

		expect(result.ok).toBe(false);
	});
});

describe("directChildren", () => {
	it("keeps only the wanted countries and reports the whole footprint", async () => {
		replies(() => ({ body: fixtures.children }));

		const result = await directChildren("969500F7JLTX36OUI695", {
			countries: ["BE"],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.total).toBe(3);
		expect(result.data.children.map((child) => child.name)).toEqual([
			"AUTOFIN",
			"RCI FINANCIAL SERVICES",
		]);
		expect(result.data.truncated).toBe(false);
	});

	it("walks every page and flags a cut-off at the page cap", async () => {
		const child = fixtures.children.data[0];
		replies((url) => {
			const number = Number(url.searchParams.get("page[number]"));
			return {
				body: {
					data: [{ ...child, id: `${number}`.padStart(20, "0") }],
					meta: {
						pagination: {
							currentPage: number,
							lastPage: GLEIF.api.maxPages + 1,
							total: GLEIF.api.maxPages + 1,
						},
					},
				},
			};
		});

		const result = await directChildren("969500F7JLTX36OUI695");

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(requested).toHaveLength(GLEIF.api.maxPages);
		expect(result.data.children).toHaveLength(GLEIF.api.maxPages);
		expect(result.data.truncated).toBe(true);
	});
});

describe("getEntity and directParent", () => {
	it("returns null for a 404 instead of failing", async () => {
		replies(() => ({ status: 404, body: { errors: [] } }));

		expect(await getEntity("969500F7JLTX36OUI695")).toEqual({
			ok: true,
			data: null,
		});
		expect(await directParent("969500F7JLTX36OUI695")).toEqual({
			ok: true,
			data: null,
		});
	});

	it("collects the other names a local-language entity carries", async () => {
		const local = fixtures.search.data[1];
		replies(() => ({
			body: {
				data: {
					...local,
					attributes: {
						...local.attributes,
						entity: {
							...local.attributes.entity,
							legalName: { name: "ドットマティクス株式会社" },
							otherNames: [
								{
									type: "ALTERNATIVE_LANGUAGE_LEGAL_NAME",
									name: "Dotmatics K.K.",
								},
								{
									type: "PREVIOUS_LEGAL_NAME",
									name: "ドットマティクス株式会社",
								},
							],
							transliteratedOtherNames: [
								{
									type: "AUTO_ASCII_TRANSLITERATED_LEGAL_NAME",
									name: "Dotmatics K.K.",
								},
							],
						},
					},
				},
			},
		}));

		const result = await getEntity("969500HC1NCZMYE1TU11");

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data?.alternativeNames).toEqual(["Dotmatics K.K."]);
	});

	it("parses a single record", async () => {
		replies(() => ({ body: { data: fixtures.search.data[1] } }));

		const result = await getEntity("969500hc1nczmye1tu11");

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data?.name).toBe("RENAULT INVEST");
		expect(requested[0]).toContain("/lei-records/969500HC1NCZMYE1TU11");
	});
});
