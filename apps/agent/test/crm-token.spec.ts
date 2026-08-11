import { describe, expect, it } from "bun:test";
import {
	taskFromToken,
	taskLeaseFromToken,
	taskToken,
} from "../agent/channels/crm";

const TASK_ID = "cmsdc0a6j004cz96ddzpcgwqr";

describe("taskFromToken", () => {
	it("reads back a token this channel minted", () => {
		expect(taskFromToken(taskToken(TASK_ID))).toBe(TASK_ID);
	});

	it("binds a token to the claimed attempt", () => {
		expect(taskLeaseFromToken(taskToken(TASK_ID, 3))).toEqual({
			taskId: TASK_ID,
			expectedAttempt: 3,
		});
	});

	it("reads the token as the channel context presents it", () => {
		expect(taskFromToken(`crm:${taskToken(TASK_ID)}`)).toBe(TASK_ID);
	});

	it("still reads the doubly-prefixed form written before the fix", () => {
		expect(taskFromToken(`crm:crm:task:${TASK_ID}`)).toBe(TASK_ID);
	});

	it("ignores a token that is not a task", () => {
		expect(
			taskFromToken("crm:adhoc:0f6c1e2a-1111-2222-3333-444455556666"),
		).toBeNull();
		expect(
			taskFromToken("eve:9ebb3820-ee00-4f35-bd38-d5147b89bd71"),
		).toBeNull();
		expect(taskFromToken(undefined)).toBeNull();
		expect(taskFromToken("crm:task:")).toBeNull();
	});

	it("rejects malformed lease attempts", () => {
		expect(taskLeaseFromToken(`crm:task:${TASK_ID}@0`)).toBeNull();
		expect(taskLeaseFromToken(`crm:task:${TASK_ID}@nope`)).toBeNull();
		expect(taskLeaseFromToken(`crm:task:${TASK_ID}@1.5`)).toBeNull();
		expect(taskLeaseFromToken(`crm:task:${TASK_ID}@`)).toBeNull();
	});

	it("keeps old tokens readable but not executable", () => {
		expect(taskLeaseFromToken(`crm:task:${TASK_ID}`)).toEqual({
			taskId: TASK_ID,
			expectedAttempt: null,
		});
	});
});
