import { describe, expect, it } from "bun:test";
import {
	MICROSOFT_SYNC_SCOPES,
	mailboxGrantsNeeded,
	needsMailboxGrant,
	SYNC_SCOPES,
	signsInWithGoogle,
	signsInWithMicrosoft,
} from "../src/scopes";

const GRANTED = SYNC_SCOPES.join(",");
const GRANTED_MICROSOFT = MICROSOFT_SYNC_SCOPES.join(",");

describe("who has to grant a mailbox", () => {
	it("walls someone who signed in with Google and granted neither scope", () => {
		expect(
			needsMailboxGrant([{ providerId: "google", scope: "openid,email" }]),
		).toBe(true);
	});

	it("walls someone whose granular consent dropped one of them", () => {
		expect(
			needsMailboxGrant([
				{ providerId: "google", scope: `openid,${SYNC_SCOPES[0]}` },
			]),
		).toBe(true);
	});

	it("lets a Google account through once both scopes are there", () => {
		expect(needsMailboxGrant([{ providerId: "google", scope: GRANTED }])).toBe(
			false,
		);
	});

	it("walls someone who signed in with Microsoft and did not grant Mail.Read", () => {
		expect(
			needsMailboxGrant([
				{ providerId: "microsoft", scope: "openid profile email User.Read" },
			]),
		).toBe(true);
	});

	it("lets a Microsoft account through once Mail.Read is there", () => {
		expect(
			needsMailboxGrant([
				{ providerId: "microsoft", scope: GRANTED_MICROSOFT },
			]),
		).toBe(false);
	});

	it("never walls someone who signed in through their own IdP", () => {
		expect(needsMailboxGrant([{ providerId: "okta", scope: null }])).toBe(
			false,
		);
	});

	it("never walls an SSO rep who has linked Google and then revoked it", () => {
		expect(
			needsMailboxGrant([
				{ providerId: "okta", scope: null },
				{ providerId: "google", scope: null },
			]),
		).toBe(false);
	});

	it("still lets an SSO rep with Gmail connected through", () => {
		expect(
			needsMailboxGrant([
				{ providerId: "okta", scope: null },
				{ providerId: "google", scope: GRANTED },
			]),
		).toBe(false);
	});

	it("does not wall an account with no sign-in rows at all", () => {
		expect(needsMailboxGrant([])).toBe(false);
	});

	it("asks for nothing more once one of two mailboxes is granted", () => {
		expect(
			needsMailboxGrant([
				{ providerId: "google", scope: GRANTED },
				{ providerId: "microsoft", scope: null },
			]),
		).toBe(false);
	});
});

describe("which provider the grant page should offer", () => {
	it("offers the one they signed in with", () => {
		expect(
			mailboxGrantsNeeded([{ providerId: "microsoft", scope: null }]),
		).toEqual(["microsoft"]);
	});

	it("offers both when neither has been granted", () => {
		expect(
			mailboxGrantsNeeded([
				{ providerId: "google", scope: null },
				{ providerId: "microsoft", scope: null },
			]),
		).toEqual(["google", "microsoft"]);
	});

	it("offers nothing to an IdP rep", () => {
		expect(mailboxGrantsNeeded([{ providerId: "okta", scope: null }])).toEqual(
			[],
		);
	});
});

describe("whether revoking a provider costs someone the CRM", () => {
	it("is true when Google is the only way in", () => {
		expect(signsInWithGoogle([{ providerId: "google", scope: GRANTED }])).toBe(
			true,
		);
	});

	it("is true when Microsoft is the only way in", () => {
		expect(
			signsInWithMicrosoft([
				{ providerId: "microsoft", scope: GRANTED_MICROSOFT },
			]),
		).toBe(true);
	});

	it("is false once an IdP is also on the account", () => {
		expect(
			signsInWithGoogle([
				{ providerId: "okta", scope: null },
				{ providerId: "google", scope: GRANTED },
			]),
		).toBe(false);
	});

	it("is false for Google once Microsoft is also a way in", () => {
		expect(
			signsInWithGoogle([
				{ providerId: "google", scope: GRANTED },
				{ providerId: "microsoft", scope: GRANTED_MICROSOFT },
			]),
		).toBe(false);
	});

	it("is false for an account with nothing linked", () => {
		expect(signsInWithGoogle([])).toBe(false);
	});
});
