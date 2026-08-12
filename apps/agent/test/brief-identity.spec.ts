import { describe, expect, it } from "bun:test";
import {
	type ContactIdentitySnapshot,
	contactIdentityIsTrustworthy,
	evidenceProvesIdentity,
	refuseBriefReason,
} from "../agent/lib/brief-identity";
import type { Evidence } from "../agent/lib/evidence";

const of = (...kinds: Evidence["kind"][]): Evidence[] =>
	kinds.map((kind) => ({ kind, detail: `saw ${kind}` }));

const placeholder: ContactIdentitySnapshot = {
	email: "pmarchetti@fernhill.com",
	firstName: "Pmarchetti",
	lastName: null,
	linkedinUrl: null,
	hasAppliedName: false,
};

const known: ContactIdentitySnapshot = {
	email: "paula@fernhill.com",
	firstName: "Paula",
	lastName: "Marchetti",
	linkedinUrl: "https://www.linkedin.com/in/paulamarchetti",
	hasAppliedName: true,
};

describe("evidenceProvesIdentity", () => {
	it("accepts employer-and-name and thread reply", () => {
		expect(evidenceProvesIdentity(of("linkedin.employer-and-name"))).toBe(true);
		expect(evidenceProvesIdentity(of("crm.thread-reply"))).toBe(true);
	});

	it("rejects employer-only and meeting attendance alone", () => {
		expect(evidenceProvesIdentity(of("employer-only"))).toBe(false);
		expect(evidenceProvesIdentity(of("crm.meeting-attendance"))).toBe(false);
		expect(evidenceProvesIdentity(of("search.cites-profile"))).toBe(false);
	});
});

describe("contactIdentityIsTrustworthy", () => {
	it("accepts a LinkedIn URL or applied name", () => {
		expect(contactIdentityIsTrustworthy(known)).toBe(true);
		expect(
			contactIdentityIsTrustworthy({
				...placeholder,
				hasAppliedName: true,
			}),
		).toBe(true);
	});

	it("rejects a derived placeholder name with no sources", () => {
		expect(contactIdentityIsTrustworthy(placeholder)).toBe(false);
	});

	it("accepts a human full name without LinkedIn", () => {
		expect(
			contactIdentityIsTrustworthy({
				email: "x@example.com",
				firstName: "Lewis",
				lastName: "Carhart",
				linkedinUrl: null,
				hasAppliedName: false,
			}),
		).toBe(true);
	});
});

describe("refuseBriefReason", () => {
	it("refuses garbage identity even when evidence scores as probable", () => {
		const reason = refuseBriefReason({
			contact: placeholder,
			evidence: of("crm.meeting-attendance"),
		});
		expect(reason).toMatch(/Identity is not trustworthy/);
	});

	it("refuses employer-only on an unknown contact", () => {
		const reason = refuseBriefReason({
			contact: placeholder,
			evidence: of("employer-only"),
		});
		expect(reason).toMatch(/Identity is not trustworthy/);
	});

	it("allows a brief when identity evidence is primary", () => {
		expect(
			refuseBriefReason({
				contact: placeholder,
				evidence: of("linkedin.employer-and-name"),
			}),
		).toBeNull();
	});

	it("allows a brief on a known contact with primary evidence", () => {
		expect(
			refuseBriefReason({
				contact: known,
				evidence: of("linkedin.employer-and-name", "crm.signature-block"),
			}),
		).toBeNull();
	});

	it("refuses weak content evidence even when the contact is known", () => {
		const reason = refuseBriefReason({
			contact: known,
			evidence: of("web.cited-claim"),
		});
		expect(reason).toMatch(/sourced well enough/);
	});
});
