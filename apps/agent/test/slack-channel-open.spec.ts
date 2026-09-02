import { describe, expect, it } from "bun:test";
import { toChannelName } from "../agent/lib/slack-channel-name";

describe("tidying a channel name for Slack", () => {
	it("lowercases and joins words with a dash", () => {
		expect(toChannelName("Acme Onboarding")).toBe("acme-onboarding");
	});

	it("drops punctuation Slack refuses", () => {
		expect(toChannelName("Acme, Inc. — onboarding!")).toBe(
			"acme-inc-onboarding",
		);
	});

	it("collapses runs of dashes and trims the ends", () => {
		expect(toChannelName("  --acme---onboarding--  ")).toBe("acme-onboarding");
	});

	it("keeps a name Slack already accepts", () => {
		expect(toChannelName("acme-onboarding")).toBe("acme-onboarding");
	});

	it("cuts a long name to the Slack limit and leaves no trailing dash", () => {
		const name = toChannelName(`${"acme ".repeat(40)}onboarding`);

		expect(name.length).toBeLessThanOrEqual(80);
		expect(name.endsWith("-")).toBe(false);
	});

	it("gives back nothing when the name has no letters or numbers", () => {
		expect(toChannelName("!!! ---")).toBe("");
	});
});
