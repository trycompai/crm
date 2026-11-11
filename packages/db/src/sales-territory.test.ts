import { describe, expect, it } from "bun:test";
import {
	assignRep,
	inferGeoFromForm,
	isDistributor,
	loadSalesTerritory,
} from "../src/sales-territory";

const map = loadSalesTerritory();

describe("assignRep", () => {
	it("routes gateway manufacturers to CT", () => {
		const result = assignRep(map, { companyName: "Rajant Corporation" });
		expect(result?.repCode).toBe("CT");
		expect(result?.email).toBe("ctalbert@mobilemark.com");
		expect(result?.reason).toBe("exception");
	});

	it("routes Digi with word boundary", () => {
		expect(assignRep(map, { companyName: "Digi International" })?.repCode).toBe(
			"CT",
		);
	});

	it("routes normal Illinois to DS", () => {
		const result = assignRep(map, {
			companyName: "Acme Widgets",
			stateCode: "IL",
			countryCode: "US",
		});
		expect(result?.repCode).toBe("DS");
		expect(result?.reason).toBe("geo");
	});

	it("overrides Illinois key accounts to CT", () => {
		const result = assignRep(map, {
			companyName: "Caterpillar Inc.",
			stateCode: "IL",
			countryCode: "US",
		});
		expect(result?.repCode).toBe("CT");
		expect(result?.reason).toBe("exception");
	});

	it("routes Mexico to SW", () => {
		const result = assignRep(map, { countryCode: "MX" });
		expect(result?.repCode).toBe("SW");
		expect(result?.reason).toBe("international");
	});

	it("routes Pennsylvania to SW", () => {
		expect(
			assignRep(map, { stateCode: "PA", countryCode: "US" })?.repCode,
		).toBe("SW");
	});

	it("routes Central US to BC (Bryant Cloud)", () => {
		for (const stateCode of [
			"AR",
			"IA",
			"KS",
			"LA",
			"MN",
			"MO",
			"NE",
			"ND",
			"OK",
			"SD",
			"TX",
		]) {
			const result = assignRep(map, { stateCode, countryCode: "US" });
			expect(result?.repCode).toBe("BC");
			expect(result?.email).toBe("bcloud@mobilemark.com");
		}
	});

	it("routes MCE Connectronics distributor to BC", () => {
		expect(assignRep(map, { companyName: "MCE Connectronics" })?.repCode).toBe(
			"BC",
		);
	});

	it("no longer routes anything to Nino Barker (NB)", () => {
		expect(map.reps.NB).toBeUndefined();
		expect(Object.values(map.us_states)).not.toContain("NB");
	});

	it("leaves MCA ambiguous (shared pool)", () => {
		expect(assignRep(map, { companyName: "MCA" })).toBeNull();
	});

	it("returns null when geo is unknown", () => {
		expect(assignRep(map, { companyName: "Mystery Co" })).toBeNull();
	});

	it("routes Tessco distributor to CT", () => {
		expect(
			assignRep(map, { companyName: "TESSCO Technologies" })?.repCode,
		).toBe("CT");
	});
});

describe("isDistributor", () => {
	it("flags a distributor on the exception list", () => {
		expect(isDistributor(map, "TESSCO Technologies")).toBe(true);
	});

	it("does not flag an ordinary company", () => {
		expect(isDistributor(map, "Acme Widgets")).toBe(false);
	});

	it("handles missing/empty names without throwing", () => {
		expect(isDistributor(map, null)).toBe(false);
		expect(isDistributor(map, "")).toBe(false);
	});
});

describe("inferGeoFromForm", () => {
	it("parses US city + state", () => {
		expect(
			inferGeoFromForm({
				locationText: "Malvern, PA\nUnited States",
				connectLocation: "North America",
			}),
		).toEqual({ stateCode: "PA", countryCode: "US" });
	});

	it("parses Mexico from comments", () => {
		expect(
			inferGeoFromForm({
				comments: "Procurement Manager at SROMEX GROUP MEXICO",
			}),
		).toEqual({ countryCode: "MX" });
	});

	it("does not invent a state from North America alone", () => {
		const geo = inferGeoFromForm({ connectLocation: "North America" });
		expect(geo.stateCode).toBeUndefined();
		expect(geo.countryCode).toBe("US");
	});
});
