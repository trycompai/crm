import { describe, expect, it } from "bun:test";
import { APP_AUTH } from "../agent/lib/app-auth";
import {
	isAutomated,
	sensitiveWhen,
	sensitiveWrite,
} from "../agent/lib/approval";

const appSession = {
	auth: {
		current: {
			authenticator: APP_AUTH.authenticator,
			principalId: APP_AUTH.principalId,
			principalType: APP_AUTH.principalType,
		},
	},
};

const humanSession = {
	auth: {
		current: {
			authenticator: "crm-app",
			principalId: "user_123",
			principalType: "user",
		},
	},
};

function decide(
	policy: ReturnType<typeof sensitiveWrite>,
	session: typeof appSession | typeof humanSession,
	toolInput?: Record<string, unknown>,
) {
	return policy({
		session,
		toolInput,
		toolName: "record_job_change",
		callId: "call_1",
		approvedTools: new Set(),
	} as never);
}

describe("isAutomated", () => {
	it("matches the app principal on all three fields", () => {
		expect(isAutomated(appSession)).toBe(true);
		expect(isAutomated(humanSession)).toBe(false);
	});
});

describe("sensitiveWrite", () => {
	const policy = sensitiveWrite("Do the safe path instead.");

	it("denies unattended runs", async () => {
		expect(await decide(policy, appSession)).toEqual({
			type: "denied",
			reason: "Not something to do unattended. Do the safe path instead.",
		});
	});

	it("asks a person on a human session", async () => {
		expect(await decide(policy, humanSession)).toBe("user-approval");
	});
});

describe("sensitiveWhen", () => {
	const policy = sensitiveWhen<{ moveToCompanyId?: string }>(
		(input) => Boolean(input?.moveToCompanyId),
		"Raise without moveToCompanyId.",
	);

	it("lets automated runs raise a job change without re-parenting", async () => {
		expect(await decide(policy, appSession, {})).toBe("not-applicable");
		expect(
			await decide(policy, appSession, { contactId: "c1" }),
		).toBe("not-applicable");
	});

	it("denies automated re-parenting of a contact company", async () => {
		expect(
			await decide(policy, appSession, { moveToCompanyId: "co_1" }),
		).toEqual({
			type: "denied",
			reason: "Not something to do unattended. Raise without moveToCompanyId.",
		});
	});

	it("asks a person only when re-parenting", async () => {
		expect(await decide(policy, humanSession, {})).toBe("not-applicable");
		expect(
			await decide(policy, humanSession, { moveToCompanyId: "co_1" }),
		).toBe("user-approval");
	});
});
