import { describe, expect, it } from "bun:test";
import type { ApprovalContext } from "eve/tools/approval";
import { APP_AUTH } from "../agent/lib/app-auth";
import {
	changeWrite,
	permissionModeOf,
	sensitiveWrite,
} from "../agent/lib/approval";

function context(
	permissionMode?: string,
	auth?: {
		authenticator: string;
		principalId: string;
		principalType: string;
	},
) {
	return {
		approvedTools: new Set<string>(),
		callId: "approval-call",
		toolName: "change_record",
		session: {
			id: "approval-session",
			auth: {
				current: {
					...auth,
					attributes: { permissionMode },
				},
				initiator: null,
			},
			turn: {},
		},
		getSandbox: async () => {
			throw new Error("The test does not use a sandbox.");
		},
		getSkill: () => {
			throw new Error("The test does not use a skill.");
		},
	} as unknown as ApprovalContext;
}

describe("agent permission modes", () => {
	it("asks before normal changes in manual mode", async () => {
		expect(await changeWrite()(context("manual"))).toBe("user-approval");
	});

	it("runs normal changes in auto and bypass modes", async () => {
		expect(await changeWrite()(context("auto"))).toBe("approved");
		expect(await changeWrite()(context("bypass"))).toBe("approved");
	});

	it("asks before sensitive changes in manual and auto modes", async () => {
		const approval = sensitiveWrite("Use a manual workflow.");

		expect(await approval(context("manual"))).toBe("user-approval");
		expect(await approval(context("auto"))).toBe("user-approval");
	});

	it("runs sensitive changes in bypass mode", async () => {
		expect(
			await sensitiveWrite("Use a manual workflow.")(context("bypass")),
		).toBe("approved");
	});

	it("denies sensitive changes from automated turns", async () => {
		expect(
			await sensitiveWrite("Use a manual workflow.")(
				context("bypass", APP_AUTH),
			),
		).toEqual({
			type: "denied",
			reason: "Not something to do unattended. Use a manual workflow.",
		});
	});

	it("rejects an invalid permission attribute", () => {
		expect(permissionModeOf(context("invalid"))).toBeNull();
	});
});
