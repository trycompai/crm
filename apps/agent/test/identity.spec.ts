import { describe, expect, it } from "bun:test";
import { verdictFor } from "../agent/lib/identity";
import type { Person, Role } from "../agent/lib/people";

const CLAIM = {
	email: "pmarchetti@fernhill.com",
	companyName: "Fernhill",
	companyDomain: "fernhill.com",
};

function role(name: string, domain: string | null): Role {
	return {
		title: "Head of Revenue",
		organisation: { name, domain },
		startDate: null,
		endDate: null,
		location: null,
		description: null,
		isCurrent: true,
	};
}

function person(overrides: Partial<Person> = {}): Person {
	return {
		firstName: "Paula",
		lastName: "Marchetti",
		fullName: "Paula Marchetti",
		bio: null,
		location: null,
		email: null,
		photoUrl: null,
		profileUrl: null,
		socialUrls: [],
		websiteUrls: [],
		skills: [],
		currentRoles: [role("Fernhill", "fernhill.com")],
		experience: [],
		education: [],
		...overrides,
	};
}

describe("verdictFor", () => {
	it("settles on the address the person published themselves", () => {
		const verdict = verdictFor(
			person({ email: "PMarchetti@Fernhill.com", currentRoles: [] }),
			CLAIM,
		);

		expect(verdict.emailMatches).toBe(true);
		expect(verdict.isSamePerson).toBe(true);
		expect(verdict.confidence).toBe("high");
	});

	it("accepts employer and name together", () => {
		const verdict = verdictFor(person(), CLAIM);

		expect(verdict.employerMatches).toBe(true);
		expect(verdict.nameMatches).toBe(true);
		expect(verdict.isSamePerson).toBe(true);
	});

	it("refuses a hyphenated domain that is not the employer", () => {
		const verdict = verdictFor(
			person({ currentRoles: [role("Acme", "fern-hill.com")] }),
			CLAIM,
		);

		expect(verdict.employerMatches).toBe(false);
		expect(verdict.isSamePerson).toBe(false);
	});

	it("offers a suggestion when only one check passes", () => {
		const verdict = verdictFor(
			person({ firstName: "Antonio", lastName: "Fontana", fullName: null }),
			CLAIM,
		);

		expect(verdict.employerMatches).toBe(true);
		expect(verdict.nameMatches).toBe(false);
		expect(verdict.isSamePerson).toBe(false);
		expect(verdict.confidence).toBe("medium");
	});

	it("refuses a stranger outright", () => {
		const verdict = verdictFor(
			person({
				firstName: "Antonio",
				lastName: "Fontana",
				fullName: null,
				currentRoles: [role("Brightwater", "brightwater.example")],
			}),
			CLAIM,
		);

		expect(verdict.isSamePerson).toBe(false);
		expect(verdict.confidence).toBe("low");
	});
});
