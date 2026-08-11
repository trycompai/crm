import { afterEach, describe, expect, it } from "bun:test";
import { directTaskKinds, outreachSendsPaused } from "../agent/lib/autonomy";

const providerPause = process.env.PROVIDER_MUTATIONS_PAUSED;
const outreachPause = process.env.OUTREACH_SENDS_PAUSED;

function restoreEnv(key: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}

afterEach(() => {
	restoreEnv("PROVIDER_MUTATIONS_PAUSED", providerPause);
	restoreEnv("OUTREACH_SENDS_PAUSED", outreachPause);
});

describe("outbound autonomy", () => {
	it("fails closed when switches are absent", () => {
		delete process.env.PROVIDER_MUTATIONS_PAUSED;
		delete process.env.OUTREACH_SENDS_PAUSED;

		expect(outreachSendsPaused()).toBe(true);
		expect(directTaskKinds(["agentmail-sync", "email-draft-send"])).toEqual([
			"agentmail-sync",
		]);
	});

	it("requires both switches to enable sends", () => {
		process.env.PROVIDER_MUTATIONS_PAUSED = "false";
		process.env.OUTREACH_SENDS_PAUSED = "false";

		expect(outreachSendsPaused()).toBe(false);
		expect(directTaskKinds(["agentmail-sync", "email-draft-send"])).toEqual([
			"agentmail-sync",
			"email-draft-send",
		]);
	});

	it("honours either pause independently", () => {
		process.env.PROVIDER_MUTATIONS_PAUSED = "true";
		process.env.OUTREACH_SENDS_PAUSED = "false";
		expect(outreachSendsPaused()).toBe(true);

		process.env.PROVIDER_MUTATIONS_PAUSED = "false";
		process.env.OUTREACH_SENDS_PAUSED = "true";
		expect(outreachSendsPaused()).toBe(true);
	});
});
