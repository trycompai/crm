import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appRoot = resolve(import.meta.dir, "..");
const growthControls = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/prospects/growth-controls.tsx"),
	"utf8",
);

test("prospect growth pulse shows outreach gate truth", () => {
	expect(growthControls).toContain("Outreach gate");
	expect(growthControls).toContain("sendEligible");
	expect(growthControls).toContain("approvedRoutes");
	expect(growthControls).toContain("Sends paused");
	expect(growthControls).toContain("AgentMail unavailable");
	expect(growthControls).not.toContain("Send-ready accounts");
});
