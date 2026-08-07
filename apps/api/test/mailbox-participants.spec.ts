import { describe, expect, it } from "bun:test";
import {
	dominantDomain,
	externalParticipants,
	isAutomatedAddress,
	isDerivedName,
	isMachineAddress,
	type Participant,
	parseAddress,
	parseAddressList,
	splitName,
	workDomain,
} from "../src/mailbox/participants";

const person = (email: string, name: string | null = null): Participant => ({
	email,
	name,
});

describe("parseAddress", () => {
	const cases: [string, Participant | null][] = [
		["jane@acme.com", person("jane@acme.com")],
		["Jane Doe <jane@acme.com>", person("jane@acme.com", "Jane Doe")],
		['"Doe, Jane" <jane@acme.com>', person("jane@acme.com", "Doe, Jane")],
		["  JANE@ACME.COM  ", person("jane@acme.com")],
		["Jane Doe", null],
		["", null],
		["<>", null],
	];

	for (const [input, expected] of cases) {
		it(`parses ${JSON.stringify(input)}`, () => {
			expect(parseAddress(input)).toEqual(expected);
		});
	}
});

describe("parseAddressList", () => {
	it("does not split on a comma inside a quoted display name", () => {
		const parsed = parseAddressList(
			'"Doe, Jane" <jane@acme.com>, bob@acme.com',
		);

		expect(parsed).toEqual([
			person("jane@acme.com", "Doe, Jane"),
			person("bob@acme.com"),
		]);
	});

	it("deduplicates repeated addresses", () => {
		expect(parseAddressList("a@acme.com, A@ACME.COM")).toHaveLength(1);
	});

	it("returns nothing for an absent header", () => {
		expect(parseAddressList(null)).toEqual([]);
		expect(parseAddressList(undefined)).toEqual([]);
	});
});

describe("isAutomatedAddress", () => {
	it("catches the machines", () => {
		for (const email of [
			"noreply@acme.com",
			"no-reply@acme.com",
			"notifications@acme.com",
			"mailer-daemon@acme.com",
			"bounces+123@acme.com",
		]) {
			expect(isAutomatedAddress(email)).toBe(true);
		}
	});

	it("does not catch people whose names start with a marker", () => {
		for (const email of [
			"robert@acme.com",
			"bouncer@acme.com",
			"note@acme.com",
		]) {
			expect(isAutomatedAddress(email)).toBe(false);
		}
	});
});

describe("isMachineAddress", () => {
	it("catches the calendars Google invites as though they were people", () => {
		for (const email of [
			"c_f5ecd6a22aea945a2d5c6ac9b8b2b16b@group.calendar.google.com",
			"acme.com_38dhs2@resource.calendar.google.com",
			"en.uk#holiday@group.v.calendar.google.com",
			"feed@import.calendar.google.com",
		]) {
			expect(isMachineAddress(email)).toBe(true);
		}
	});

	it("catches sending infrastructure and reserved hosts", () => {
		for (const email of [
			"list@googlegroups.com",
			"0100018f@bounce.acme.bounces.google.com",
			"reply@em1234.amazonses.com",
			"room@zoomcrc.com",
			"someone@build.local",
		]) {
			expect(isMachineAddress(email)).toBe(true);
		}
	});

	it("catches an address that is an opaque identifier", () => {
		for (const email of [
			"c_f5ecd6a22aea945a2d5c6ac9b8b2b16b@acme.com",
			"4f9c2b1a8e7d6c5b4a3f2e1d0c9b8a77@acme.com",
			"1f2e3d4c-5b6a-7988-9a0b-1c2d3e4f5a6b@acme.com",
		]) {
			expect(isMachineAddress(email)).toBe(true);
		}
	});

	it("leaves real people and real companies alone", () => {
		for (const email of [
			"jane@acme.com",
			"ada@google.com",
			"dave@calendar.acme.com",
			"deb@sendgrid.com",
			"bob@testing.com",
		]) {
			expect(isMachineAddress(email)).toBe(false);
		}
	});
});

describe("workDomain", () => {
	it("rejects the free hosts", () => {
		expect(workDomain("someone@gmail.com")).toBeNull();
		expect(workDomain("someone@icloud.com")).toBeNull();
	});

	it("returns the bare host for a work address", () => {
		expect(workDomain("jane@Acme.com")).toBe("acme.com");
	});
});

describe("externalParticipants", () => {
	const options = {
		ourDomains: new Set(["trycomp.ai"]),
		ourAddresses: new Set(["lewis@trycomp.ai"]),
		suppressedDomains: new Set(["greenhouse.io"]),
		suppressedEmails: new Set(["deleted@acme.com"]),
	};

	it("keeps only the other side of the conversation", () => {
		const result = externalParticipants(
			[
				person("lewis@trycomp.ai"),
				person("colleague@trycomp.ai"),
				person("jane@acme.com", "Jane"),
			],
			options,
		);

		expect(result).toEqual([person("jane@acme.com", "Jane")]);
	});

	it("drops free hosts, suppressed domains and machines", () => {
		const result = externalParticipants(
			[
				person("someone@gmail.com"),
				person("recruiter@greenhouse.io"),
				person("noreply@acme.com"),
				person("jane@acme.com"),
			],
			options,
		);

		expect(result).toEqual([person("jane@acme.com")]);
	});

	it("never files a shared calendar as a person at a company", () => {
		const result = externalParticipants(
			[
				person(
					"c_f5ecd6a22aea945a2d5c6ac9b8b2b16b@group.calendar.google.com",
					"Interviews scheduled",
				),
				person("jane@acme.com"),
			],
			options,
		);

		expect(result).toEqual([person("jane@acme.com")]);
	});

	it("returns nothing for a wholly internal thread", () => {
		expect(
			externalParticipants([person("colleague@trycomp.ai")], options),
		).toEqual([]);
	});

	it("never brings back a contact a rep deleted", () => {
		const result = externalParticipants(
			[person("deleted@acme.com", "Deleted Person"), person("jane@acme.com")],
			options,
		);

		expect(result).toEqual([person("jane@acme.com")]);
	});

	it("leaves nothing to file when the deleted contact is the only outsider", () => {
		expect(
			externalParticipants(
				[person("lewis@trycomp.ai"), person("deleted@acme.com")],
				options,
			),
		).toEqual([]);
	});
});

describe("dominantDomain", () => {
	it("picks the best-represented domain", () => {
		const domain = dominantDomain([
			person("a@acme.com"),
			person("b@acme.com"),
			person("lawyer@legal.com"),
		]);

		expect(domain).toBe("acme.com");
	});

	it("breaks a tie towards a company we already have", () => {
		const domain = dominantDomain(
			[person("a@acme.com"), person("lawyer@legal.com")],
			new Set(["acme.com"]),
		);

		expect(domain).toBe("acme.com");
	});

	it("is null when nobody has a work domain", () => {
		expect(dominantDomain([person("someone@gmail.com")])).toBeNull();
	});
});

describe("splitName", () => {
	const cases: [
		string | null,
		string,
		{ firstName: string; lastName: string | null },
	][] = [
		["Jane Doe", "jane@acme.com", { firstName: "Jane", lastName: "Doe" }],
		["Doe, Jane", "jane@acme.com", { firstName: "Jane", lastName: "Doe" }],
		[
			"Jane van der Berg",
			"jane@acme.com",
			{ firstName: "Jane", lastName: "van der Berg" },
		],
		["Jane", "jane@acme.com", { firstName: "Jane", lastName: null }],
		[null, "jane.doe@acme.com", { firstName: "Jane", lastName: "Doe" }],
		[null, "jane@acme.com", { firstName: "Jane", lastName: null }],
		["jane@acme.com", "jane@acme.com", { firstName: "Jane", lastName: null }],
	];

	for (const [name, email, expected] of cases) {
		it(`splits ${JSON.stringify(name)} / ${email}`, () => {
			expect(splitName(name, email)).toEqual(expected);
		});
	}
});

describe("isAutomatedAddress — scheduling tools", () => {
	it("catches the addresses invites are sent from", () => {
		for (const email of [
			"calendar-invite@lu.ma",
			"invites@calendly.com",
			"scheduling@acme.com",
			"bookings@acme.com",
			"meetings@acme.com",
		]) {
			expect(isAutomatedAddress(email)).toBe(true);
		}
	});

	it("catches shared inboxes, which are not people", () => {
		for (const email of [
			"sales@acme.com",
			"support@acme.com",
			"info@acme.com",
		]) {
			expect(isAutomatedAddress(email)).toBe(true);
		}
	});

	it("still lets real people through", () => {
		for (const email of [
			"pmarchetti@fernhill.com",
			"helena@acme.com",
			"infante@acme.com",
			"contacts.lead@acme.com",
		]) {
			expect(isAutomatedAddress(email)).toBe(false);
		}
	});
});

describe("isDerivedName", () => {
	it("recognises a name that came from the address alone", () => {
		expect(isDerivedName("pmarchetti@fernhill.com", "Pmarchetti", null)).toBe(
			true,
		);
		expect(isDerivedName("jane.doe@acme.com", "Jane", "Doe")).toBe(true);
	});

	it("leaves a real name alone", () => {
		expect(isDerivedName("pmarchetti@fernhill.com", "Paula", "Marchetti")).toBe(
			false,
		);
		expect(isDerivedName("jane.doe@acme.com", "Jane", "Doherty")).toBe(false);
	});
});
