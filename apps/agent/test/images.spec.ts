import { describe, expect, it } from "bun:test";
import { photoUrl, slugFromProfileUrl } from "../agent/lib/people";
import { findPortrait } from "../agent/lib/portrait-sources";

const AVATAR =
	"https://media.licdn.com/dms/image/v2/D5603AQGOxXbMuQk4jw/profile-displayphoto-shrink_100_100/0/1738873240305?e=1787184000";

describe("photoUrl", () => {
	it("keeps the avatar the enrichment returned", () => {
		expect(photoUrl(AVATAR)).toBe(AVATAR);
	});

	it("refuses a face served over anything but https", () => {
		expect(photoUrl("http://media.licdn.com/x.jpg")).toBe(null);
		expect(photoUrl("ftp://media.licdn.com/x.jpg")).toBe(null);
		expect(photoUrl("javascript:alert(1)")).toBe(null);
	});

	it("refuses anything that is not an absolute URL", () => {
		expect(photoUrl("/dms/image/x.jpg")).toBe(null);
		expect(photoUrl("media.licdn.com/x.jpg")).toBe(null);
		expect(photoUrl("   ")).toBe(null);
	});

	it("is null for a person with no picture, which is ordinary", () => {
		expect(photoUrl(null)).toBe(null);
	});
});

describe("slugFromProfileUrl", () => {
	it("reads the handle out of a profile URL", () => {
		expect(slugFromProfileUrl("https://www.linkedin.com/in/pmarchetti")).toBe(
			"pmarchetti",
		);
		expect(slugFromProfileUrl("https://linkedin.com/in/pmarchetti/")).toBe(
			"pmarchetti",
		);
		expect(
			slugFromProfileUrl("https://uk.linkedin.com/in/paula-marchetti-1a2b3c"),
		).toBe("paula-marchetti-1a2b3c");
	});

	it("decodes an escaped handle", () => {
		expect(slugFromProfileUrl("https://www.linkedin.com/in/j%C3%B8rn-a")).toBe(
			"jørn-a",
		);
	});

	it("refuses anything that is not a personal profile", () => {
		expect(
			slugFromProfileUrl("https://www.linkedin.com/company/fernhill"),
		).toBe(null);
		expect(slugFromProfileUrl("https://www.linkedin.com/in/")).toBe(null);
		expect(slugFromProfileUrl("https://notlinkedin.com/in/pmarchetti")).toBe(
			null,
		);
		expect(slugFromProfileUrl("pmarchetti")).toBe(null);
		expect(slugFromProfileUrl(null)).toBe(null);
	});
});

describe("the portrait source chain", () => {
	const NOBODY = {
		id: "c1",
		name: "Paula Marchetti",
		linkedinUrl: null,
		githubUrl: null,
		companyName: null,
		companyDomain: null,
	};
	const free = () => ({ ok: true });

	it("uses a verified GitHub account when there is no LinkedIn", async () => {
		const result = await findPortrait(
			{ ...NOBODY, githubUrl: "https://github.com/pmarchetti" },
			free,
		);

		expect(result.found).toBe(true);
		if (result.found) {
			expect(result.candidate.source).toBe("github");
			expect(result.candidate.url).toContain("github.com/pmarchetti.png");
		}
	});

	it("does not mistake a repository for a person", async () => {
		const result = await findPortrait(
			{ ...NOBODY, githubUrl: "https://github.com/acme/crm" },
			free,
		);

		expect(result.found).toBe(false);
	});

	it("looks nowhere at all when the record points nowhere", async () => {
		const result = await findPortrait(NOBODY, free);

		expect(result.found).toBe(false);
		if (!result.found) expect(result.tried).toEqual([]);
	});

	it("stops rather than spending past the budget", async () => {
		const broke = () => ({ ok: false, reason: "Out of budget." });
		const result = await findPortrait(
			{ ...NOBODY, linkedinUrl: "https://www.linkedin.com/in/pmarchetti" },
			broke,
		);

		expect(result.found).toBe(false);
		if (!result.found) expect(result.reason).toBe("Out of budget.");
	});
});
