import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { profilePhotoUrl, slugFromProfileUrl } from "../agent/lib/linkdapi";
import { runPortrait, storePortrait } from "../agent/lib/portrait";
import { findPortrait } from "../agent/lib/portrait-sources";

const OVERVIEW = {
	firstName: "Kelly",
	lastName: "Wiarda",
	fullName: "Kelly Wiarda",
	publicIdentifier: "kellywiarda",
	backgroundImageURL:
		"https://media.licdn.com/dms/image/v2/D4D16AQHJgcgf0YCwWA/profile-displaybackgroundimage-shrink_350_1400/0/1673558147641?e=1787184000",
	profilePictureURL:
		"https://media.licdn.com/dms/image/v2/D5603AQGOxXbMuQk4jw/profile-displayphoto-shrink_100_100/0/1738873240305?e=1787184000",
};

describe("profilePhotoUrl", () => {
	it("reads the key the API actually uses", () => {
		expect(profilePhotoUrl(OVERVIEW)).toContain("profile-displayphoto");
	});

	it("never takes the background banner for a face", () => {
		const { profilePictureURL, ...noPhoto } = OVERVIEW;
		expect(profilePhotoUrl(noPhoto)).toBe(null);
	});

	it("tolerates the vendor recasing the key", () => {
		expect(
			profilePhotoUrl({ profilePictureUrl: OVERVIEW.profilePictureURL }),
		).toBe(OVERVIEW.profilePictureURL);
	});

	it("refuses a photo that is not on LinkedIn's CDN", () => {
		expect(
			profilePhotoUrl({ profilePictureURL: "https://evil.example/x.jpg" }),
		).toBe(null);
		expect(
			profilePhotoUrl({ profilePictureURL: "http://media.licdn.com/x.jpg" }),
		).toBe(null);
		expect(
			profilePhotoUrl({ profilePictureURL: "https://licdn.com.evil/x.jpg" }),
		).toBe(null);
	});

	it("is null for a profile with no picture, which is ordinary", () => {
		expect(profilePhotoUrl({ firstName: "Nathan" })).toBe(null);
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

	it("does not charge for a free GitHub headshot", async () => {
		let spent = 0;
		const result = await findPortrait(
			{ ...NOBODY, githubUrl: "https://github.com/pmarchetti" },
			(units = 1) => {
				spent += units;
				return { ok: true };
			},
		);

		expect(result.found).toBe(true);
		expect(spent).toBe(0);
	});

	it("never treats a bare name as a place to look", async () => {
		const result = await findPortrait(
			{ ...NOBODY, name: "Paula Marchetti", companyName: "Acme" },
			free,
		);

		expect(result.found).toBe(false);
		if (!result.found) expect(result.tried).toEqual([]);
	});
});

describe("portrait soft-fail without BLOB_READ_WRITE_TOKEN", () => {
	const saved = process.env.BLOB_READ_WRITE_TOKEN;

	beforeEach(() => {
		delete process.env.BLOB_READ_WRITE_TOKEN;
	});

	afterEach(() => {
		if (saved === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
		else process.env.BLOB_READ_WRITE_TOKEN = saved;
	});

	it("storePortrait refuses to keep an origin URL and does not throw", async () => {
		const result = await storePortrait({
			contactId: "c-no-blob",
			sourceUrl: "https://media.licdn.com/dms/image/x.jpg",
			verified: true,
		});

		expect(result.stored).toBe(false);
		expect(result.imageUrl).toBe(null);
		expect(result.reason).toContain("BLOB_READ_WRITE_TOKEN");
		expect(result.reason?.toLowerCase()).toContain("retrying will not help");
	});

	it("runPortrait stops before looking when there is nowhere to store a copy", async () => {
		const result = await runPortrait({
			contactId: "c-no-blob",
			spend: () => ({ ok: true }),
		});

		expect(result.stored).toBe(false);
		expect(result.imageUrl).toBe(null);
		expect(result.reason).toContain("BLOB_READ_WRITE_TOKEN");
	});

	it("storePortrait still refuses an unverified face without needing storage", async () => {
		const result = await storePortrait({
			contactId: "c-no-blob",
			sourceUrl: "https://media.licdn.com/dms/image/x.jpg",
			verified: false,
		});

		expect(result.stored).toBe(false);
		expect(result.reason).toContain("not established");
	});
});
