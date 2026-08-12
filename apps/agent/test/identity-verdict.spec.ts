import { describe, expect, it } from "bun:test";
import { scoreEvidence } from "../agent/lib/evidence";
import { fillsBlank } from "../agent/lib/facts";
import {
	identityChecks,
	identityEvidence,
	identityNextStep,
} from "../agent/lib/identity-verdict";

const tomi = {
	firstName: "Tomi",
	lastName: "Okonkwo",
	fullName: "Tomi Okonkwo",
	profileUrl: "https://www.linkedin.com/in/tomi-okonkwo",
	positions: [{ name: "Northwind Bank", url: null }],
};

const stranger = {
	firstName: "Antonio",
	lastName: "Fontana",
	fullName: "Antonio Fontana",
	profileUrl: "https://www.linkedin.com/in/antonio-fontana",
	positions: [{ name: "Northwind Bank", url: null }],
};

const wrongCompany = {
	firstName: "Tomi",
	lastName: "Okonkwo",
	fullName: "Tomi Okonkwo",
	profileUrl: "https://www.linkedin.com/in/tomi-elsewhere",
	positions: [{ name: "Brightwater Group", url: null }],
};

describe("identityChecks", () => {
	it("requires employer and name together", () => {
		expect(
			identityChecks(
				tomi,
				"tokonkwo@northwind.com",
				"Northwind",
				"northwind.com",
			),
		).toEqual({
			employerMatches: true,
			nameMatches: true,
			isSamePerson: true,
		});

		expect(
			identityChecks(
				stranger,
				"tokonkwo@northwind.com",
				"Northwind",
				"northwind.com",
			),
		).toEqual({
			employerMatches: true,
			nameMatches: false,
			isSamePerson: false,
		});

		expect(
			identityChecks(
				wrongCompany,
				"tokonkwo@northwind.com",
				"Northwind",
				"northwind.com",
			),
		).toEqual({
			employerMatches: false,
			nameMatches: true,
			isSamePerson: false,
		});
	});
});

describe("identityEvidence", () => {
	it("prices a full match as linkedin.employer-and-name at VERIFIED", () => {
		const checks = identityChecks(
			tomi,
			"tokonkwo@northwind.com",
			"Northwind",
			"northwind.com",
		);
		const evidence = identityEvidence(
			tomi,
			checks,
			"tokonkwo@northwind.com",
			"Northwind",
		);

		expect(evidence).toHaveLength(1);
		expect(evidence[0]?.kind).toBe("linkedin.employer-and-name");
		expect(scoreEvidence(evidence).band).toBe("VERIFIED");
		expect(identityNextStep(checks)).toContain("identify_contact");
	});

	it("prices employer-only below the keep floor so a miss stays a miss", () => {
		const checks = identityChecks(
			stranger,
			"tokonkwo@northwind.com",
			"Northwind",
			"northwind.com",
		);
		const evidence = identityEvidence(
			stranger,
			checks,
			"tokonkwo@northwind.com",
			"Northwind",
		);

		expect(evidence[0]?.kind).toBe("employer-only");
		expect(scoreEvidence(evidence).band).toBeNull();
		expect(identityNextStep(checks)).toContain("miss stays a miss");
	});

	it("returns no identity evidence when only the name fits", () => {
		const checks = identityChecks(
			wrongCompany,
			"tokonkwo@northwind.com",
			"Northwind",
			"northwind.com",
		);
		const evidence = identityEvidence(
			wrongCompany,
			checks,
			"tokonkwo@northwind.com",
			"Northwind",
		);

		expect(evidence).toEqual([]);
		expect(scoreEvidence(evidence).band).toBeNull();
		expect(identityNextStep(checks)).toContain("Stop");
	});
});

describe("fillsBlank for identity names", () => {
	it("treats a derived email placeholder as blank for the agent", () => {
		expect(
			fillsBlank({
				field: "name",
				contact: {
					email: "tokonkwo@northwind.com",
					firstName: "Tokonkwo",
					lastName: null,
				},
				hasAgentFact: false,
			}),
		).toBe(true);
	});

	it("does not treat a human-typed name as blank", () => {
		expect(
			fillsBlank({
				field: "name",
				contact: {
					email: "tokonkwo@northwind.com",
					firstName: "Tomi",
					lastName: "Okonkwo",
				},
				hasAgentFact: false,
			}),
		).toBe(false);
	});
});
