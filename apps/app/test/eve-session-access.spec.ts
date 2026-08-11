import { describe, expect, it } from "bun:test";
import { canProxyEveSession, sessionFromPath } from "../lib/eve-session-access";

type Row = {
	id: string;
	sessionId: string | null;
	userId: string;
	kind: "BUILDER";
};

function store(rows: Row[]) {
	return {
		agentConversation: {
			async findUnique(args: { where: { sessionId: string } }) {
				return (
					rows.find((row) => row.sessionId === args.where.sessionId) ?? null
				);
			},
			async findFirst(args: {
				where: { id: string; userId: string; kind: "BUILDER" };
			}) {
				return (
					rows.find(
						(row) =>
							row.id === args.where.id &&
							row.userId === args.where.userId &&
							row.kind === args.where.kind,
					) ?? null
				);
			},
		},
	};
}

describe("Eve session access", () => {
	it("extracts session ids from proxied Eve paths", () => {
		expect(sessionFromPath("/eve/v1/session/wrun_123/snapshot")).toBe(
			"wrun_123",
		);
		expect(sessionFromPath("/eve/v1/runs")).toBeNull();
	});

	it("requires a requested session to be recorded for the signed-in user", async () => {
		const db = store([
			{ id: "c1", sessionId: "wrun_a", userId: "u1", kind: "BUILDER" },
		]);

		expect(
			await canProxyEveSession(db, {
				requestedSession: "wrun_a",
				builderConversationId: null,
				userId: "u1",
			}),
		).toBe(true);
		expect(
			await canProxyEveSession(db, {
				requestedSession: "wrun_a",
				builderConversationId: null,
				userId: "u2",
			}),
		).toBe(false);
		expect(
			await canProxyEveSession(db, {
				requestedSession: "wrun_missing",
				builderConversationId: null,
				userId: "u1",
			}),
		).toBe(false);
	});

	it("binds builder follow-up requests to the saved builder conversation", async () => {
		const db = store([
			{ id: "c1", sessionId: "wrun_a", userId: "u1", kind: "BUILDER" },
		]);

		expect(
			await canProxyEveSession(db, {
				requestedSession: "wrun_a",
				builderConversationId: "c1",
				userId: "u1",
			}),
		).toBe(true);
		expect(
			await canProxyEveSession(db, {
				requestedSession: "wrun_b",
				builderConversationId: "c1",
				userId: "u1",
			}),
		).toBe(false);
		expect(
			await canProxyEveSession(db, {
				requestedSession: "wrun_a",
				builderConversationId: "c1",
				userId: "u2",
			}),
		).toBe(false);
	});
});
