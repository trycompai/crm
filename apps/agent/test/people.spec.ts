import { describe, expect, it } from "bun:test";
import {
	type EnrichedMatch,
	MATCH_FLOOR,
	matchFrom,
} from "../agent/lib/people";

type Candidate = Extract<EnrichedMatch, { status: "candidate" }>;

const PROFILE = "https://www.linkedin.com/in/paulamarchetti";

const PERSON: Candidate["person"] = {
	name: { first: "Paula", last: "Marchetti", full: "Paula Marchetti" },
	email: "pmarchetti@fernhill.com",
	avatar_url: "https://media.licdn.com/dms/image/v2/photo.jpg",
	bio: "Building the revenue team at Fernhill.",
	location: { display: "Milan, Italy", city: "Milan", country: "Italy" },
	social_urls: ["https://x.com/pmarchetti", PROFILE],
	website_urls: ["https://paulamarchetti.example"],
	skills: ["Enterprise sales", "Forecasting"],
	current_role: {
		title: "Head of Revenue",
		organization: { name: "Fernhill", domain: "fernhill.com" },
		start_date: { year: 2022, month: 3 },
		location: "Milan, Italy",
		description: "Owns new business.",
		is_current: true,
	},
	experience: [
		{
			title: "Account Director",
			organization: { name: "Brightwater", domain: "brightwater.example" },
			start_date: { year: 2018, month: 1, day: 15 },
			end_date: { year: 2022, month: 2 },
			is_current: false,
		},
	],
	education: [
		{
			institution: { name: "Politecnico di Milano" },
			degree: "MSc",
			field_of_study: "Management Engineering",
			end_date: { year: 2017 },
		},
	],
};

const candidate = (person: Candidate["person"], score = 92): EnrichedMatch => ({
	status: "candidate",
	score,
	person,
});

describe("reading a person out of an enrichment", () => {
	it("parses the profile, the roles and the dates", () => {
		const result = matchFrom(candidate(PERSON));

		expect(result.outcome).toBe("found");
		if (result.outcome !== "found") return;

		const person = result.person;
		expect(person.firstName).toBe("Paula");
		expect(person.lastName).toBe("Marchetti");
		expect(person.bio).toContain("Fernhill");
		expect(person.location).toBe("Milan, Italy");
		expect(person.photoUrl).toContain("media.licdn.com");
		expect(person.skills).toEqual(["Enterprise sales", "Forecasting"]);
		expect(person.currentRoles).toHaveLength(1);
		expect(person.currentRoles[0]?.title).toBe("Head of Revenue");
		expect(person.currentRoles[0]?.organisation.domain).toBe("fernhill.com");
		expect(person.currentRoles[0]?.startDate).toBe("2022-03");
		expect(person.experience[0]?.startDate).toBe("2018-01-15");
		expect(person.experience[0]?.endDate).toBe("2022-02");
		expect(person.experience[0]?.isCurrent).toBe(false);
		expect(person.education[0]?.endDate).toBe("2017");
	});

	it("takes the LinkedIn URL as the profile, not the first social link", () => {
		const result = matchFrom(candidate(PERSON));

		expect(result.outcome).toBe("found");
		if (result.outcome !== "found") return;

		expect(result.person.profileUrl).toBe(PROFILE);
	});

	it("never treats another social page as the profile", () => {
		const result = matchFrom(
			candidate({ ...PERSON, social_urls: ["https://x.com/pmarchetti"] }),
		);

		expect(result.outcome).toBe("found");
		if (result.outcome !== "found") return;

		expect(result.person.profileUrl).toBe(null);
		expect(result.person.socialUrls).toEqual(["https://x.com/pmarchetti"]);
	});

	it("has no profile at all when nothing points anywhere", () => {
		const result = matchFrom(candidate({ ...PERSON, social_urls: [] }));

		expect(result.outcome).toBe("found");
		if (result.outcome !== "found") return;

		expect(result.person.profileUrl).toBe(null);
	});

	it("counts a current earlier role among the current ones", () => {
		const result = matchFrom(
			candidate({
				...PERSON,
				current_role: null,
				experience: [
					{
						title: "Adviser",
						organization: { name: "Fernhill", domain: "fernhill.com" },
						start_date: { year: 2022 },
						is_current: true,
					},
					...PERSON.experience,
				],
			}),
		);

		expect(result.outcome).toBe("found");
		if (result.outcome !== "found") return;

		expect(result.person.currentRoles.map((role) => role.title)).toEqual([
			"Adviser",
		]);
	});

	it("refuses a face that is not served over https", () => {
		const result = matchFrom(
			candidate({ ...PERSON, avatar_url: "http://media.licdn.com/photo.jpg" }),
		);

		expect(result.outcome).toBe("found");
		if (result.outcome !== "found") return;

		expect(result.person.photoUrl).toBe(null);
	});

	it("refuses a face served from a host we do not trust", () => {
		const result = matchFrom(
			candidate({ ...PERSON, avatar_url: "https://evil.example/x.jpg" }),
		);

		expect(result.outcome).toBe("found");
		if (result.outcome !== "found") return;

		expect(result.person.photoUrl).toBe(null);
	});

	it("keeps the face Context actually serves", () => {
		const url = "https://media.brand.dev/pfp/2a3c58be-678b-5530-acc8.png";
		const result = matchFrom(candidate({ ...PERSON, avatar_url: url }));

		expect(result.outcome).toBe("found");
		if (result.outcome !== "found") return;

		expect(result.person.photoUrl).toBe(url);
	});

	it("keeps both current roles held at one employer", () => {
		const result = matchFrom(
			candidate({
				...PERSON,
				experience: [
					{
						title: "Board member",
						organization: { name: "Fernhill", domain: "fernhill.com" },
						start_date: { year: 2023 },
						is_current: true,
					},
					...PERSON.experience,
				],
			}),
		);

		expect(result.outcome).toBe("found");
		if (result.outcome !== "found") return;

		expect(result.person.currentRoles.map((role) => role.title)).toEqual([
			"Head of Revenue",
			"Board member",
		]);
	});

	it("survives a profile with nothing on it", () => {
		const result = matchFrom(
			candidate({
				education: [],
				experience: [],
				skills: [],
				social_urls: [],
				website_urls: [],
			}),
		);

		expect(result.outcome).toBe("found");
		if (result.outcome !== "found") return;

		expect(result.person.fullName).toBe(null);
		expect(result.person.location).toBe(null);
		expect(result.person.photoUrl).toBe(null);
		expect(result.person.profileUrl).toBe(null);
		expect(result.person.currentRoles).toEqual([]);
		expect(result.person.experience).toEqual([]);
	});
});

describe("a match nobody should act on", () => {
	it("treats not_found as an ordinary empty answer", () => {
		const result = matchFrom({
			status: "not_found",
			score: null,
			person: null,
		});

		expect(result.outcome).toBe("skipped");
	});

	it("throws away a match Context itself is unsure of", () => {
		const result = matchFrom(candidate(PERSON, MATCH_FLOOR - 1));

		expect(result.outcome).toBe("skipped");
	});

	it("keeps a match that just clears the floor", () => {
		expect(matchFrom(candidate(PERSON, MATCH_FLOOR)).outcome).toBe("found");
	});

	it("never hands the score on, so it cannot be read as proof", () => {
		const result = matchFrom(candidate(PERSON));

		expect(JSON.stringify(result)).not.toContain("92");
		expect(Object.keys(result)).toEqual(["outcome", "person"]);
	});
});
