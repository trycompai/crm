import { describe, expect, it } from "bun:test";
import {
	needsGoogleGrant,
	SYNC_SCOPES,
	signsInWithGoogle,
} from "../src/scopes";

const GRANTED = SYNC_SCOPES.join(",");

describe("who has to grant Gmail and Calendar", () => {
	it("walls someone who signed in with Google and granted neither scope", () => {
		expect(
			needsGoogleGrant([{ providerId: "google", scope: "openid,email" }]),
		).toBe(true);
	});

	it("walls someone whose granular consent dropped one of them", () => {
		expect(
			needsGoogleGrant([
				{ providerId: "google", scope: `openid,${SYNC_SCOPES[0]}` },
			]),
		).toBe(true);
	});

	it("lets a Google account through once both scopes are there", () => {
		expect(needsGoogleGrant([{ providerId: "google", scope: GRANTED }])).toBe(
			false,
		);
	});

	it("never walls someone who signed in through their own IdP", () => {
		expect(needsGoogleGrant([{ providerId: "okta", scope: null }])).toBe(false);
	});

	it("never walls an SSO rep who has linked Google and then revoked it", () => {
		expect(
			needsGoogleGrant([
				{ providerId: "okta", scope: null },
				{ providerId: "google", scope: null },
			]),
		).toBe(false);
	});

	it("still lets an SSO rep with Gmail connected through", () => {
		expect(
			needsGoogleGrant([
				{ providerId: "okta", scope: null },
				{ providerId: "google", scope: GRANTED },
			]),
		).toBe(false);
	});

	it("does not wall an account with no sign-in rows at all", () => {
		expect(needsGoogleGrant([])).toBe(false);
	});
});

describe("whether revoking Google costs someone the CRM", () => {
	it("is true when Google is the only way in", () => {
		expect(signsInWithGoogle([{ providerId: "google", scope: GRANTED }])).toBe(
			true,
		);
	});

	it("is false once an IdP is also on the account", () => {
		expect(
			signsInWithGoogle([
				{ providerId: "okta", scope: null },
				{ providerId: "google", scope: GRANTED },
			]),
		).toBe(false);
	});

	it("is false for an account with nothing linked", () => {
		expect(signsInWithGoogle([])).toBe(false);
	});
});
