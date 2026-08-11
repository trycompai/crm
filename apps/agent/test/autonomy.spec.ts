import { afterEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { directTaskKinds, outreachSendsPaused } from "../agent/lib/autonomy";
import { runDirect } from "../agent/lib/dispatch";
import { runPortrait } from "../agent/lib/portrait";
import { claimDue } from "../agent/lib/tasks";

const providerPause = process.env.PROVIDER_MUTATIONS_PAUSED;
const outreachPause = process.env.OUTREACH_SENDS_PAUSED;
const taskIds: string[] = [];
const contactIds: string[] = [];

function restoreEnv(key: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[key];
		return;
	}
	process.env[key] = value;
}

afterEach(async () => {
	restoreEnv("PROVIDER_MUTATIONS_PAUSED", providerPause);
	restoreEnv("OUTREACH_SENDS_PAUSED", outreachPause);
	if (taskIds.length > 0) {
		await db.agentTask.deleteMany({ where: { id: { in: taskIds.splice(0) } } });
	}
	if (contactIds.length > 0) {
		await db.contact.deleteMany({
			where: { id: { in: contactIds.splice(0) } },
		});
	}
});

describe("outbound autonomy", () => {
	it("fails closed when switches are absent", () => {
		delete process.env.PROVIDER_MUTATIONS_PAUSED;
		delete process.env.OUTREACH_SENDS_PAUSED;

		expect(outreachSendsPaused()).toBe(true);
		expect(
			directTaskKinds(["agentmail-sync", "email-draft-send", "portrait"]),
		).toEqual(["agentmail-sync"]);
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
		expect(directTaskKinds(["brand", "portrait"])).toEqual(["brand"]);

		process.env.PROVIDER_MUTATIONS_PAUSED = "false";
		process.env.OUTREACH_SENDS_PAUSED = "true";
		expect(outreachSendsPaused()).toBe(true);
	});

	it("does not start portrait provider work while mutations are paused", async () => {
		process.env.PROVIDER_MUTATIONS_PAUSED = "true";

		expect(
			await runPortrait({
				contactId: "not-read-while-paused",
				spend: () => ({ ok: true }),
			}),
		).toEqual({
			stored: false,
			imageUrl: null,
			reason: "Provider mutations are paused.",
			retryable: true,
		});
	});

	it("requeues a portrait lease when the provider pause turns on", async () => {
		process.env.PROVIDER_MUTATIONS_PAUSED = "false";
		const contact = await db.contact.create({
			data: {
				firstName: "Paused portrait",
				email: `paused-portrait-${crypto.randomUUID()}@example.test`,
			},
			select: { id: true },
		});
		contactIds.push(contact.id);
		const task = await db.agentTask.create({
			data: {
				kind: "portrait",
				reason: "pause transition test",
				dueAt: new Date(Date.now() - 1000),
				contactId: contact.id,
			},
			select: { id: true },
		});
		taskIds.push(task.id);
		const leased = (await claimDue(1, { only: ["portrait"] }))[0];
		if (!leased) throw new Error("Portrait task was not leased.");

		process.env.PROVIDER_MUTATIONS_PAUSED = "true";
		await runDirect(leased);

		expect(
			await db.agentTask.findUnique({
				where: { id: task.id },
				select: { state: true, leasedUntil: true, finishedAt: true },
			}),
		).toEqual({ state: "QUEUED", leasedUntil: null, finishedAt: null });
		expect(
			await db.contact.findUnique({
				where: { id: contact.id },
				select: { imageUrl: true },
			}),
		).toEqual({ imageUrl: null });
	});
});
