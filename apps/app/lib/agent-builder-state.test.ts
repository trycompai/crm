import { describe, expect, it } from "bun:test";
import {
	agentBuilderCallIsActive,
	builderConversationIsWorking,
	builderSessionStreamKey,
	builderStreamState,
	completedBuilderSteps,
	displayedArtifactVersionId,
	latestBuilderArtifacts,
	latestCompletedArtifactVersionId,
	mergeBuilderEventHistory,
	replacedFailedSubmissionIds,
	reviewVersionId,
} from "./agent-builder-state";

const completedConversation = {
	sessionId: "session-1",
	continuationToken: "continue-1",
	submissions: [{ status: "ACCEPTED" }],
	createdVersions: [{ id: "version-1", status: "DEPLOYED" }],
	agent: {
		status: "LIVE",
		currentVersion: { id: "version-1" },
	},
};

describe("agent builder state", () => {
	it("shows build progress only while an agent_builder call is active", () => {
		const requested = {
			type: "actions.requested",
			data: {
				actions: [
					{
						kind: "subagent-call",
						name: "agent_builder",
						callId: "builder-call-1",
					},
				],
			},
		};

		expect(agentBuilderCallIsActive([requested])).toBe(true);
		expect(
			agentBuilderCallIsActive([
				requested,
				{
					type: "action.result",
					data: { result: { callId: "builder-call-1" } },
				},
				{ type: "turn.started", data: { turnId: "follow-up" } },
			]),
		).toBe(false);
		expect(
			agentBuilderCallIsActive([
				{
					type: "actions.requested",
					data: {
						actions: [
							{
								kind: "tool-call",
								toolName: "search_crm",
								callId: "search-1",
							},
						],
					},
				},
			]),
		).toBe(false);
	});

	it("keeps polling a new turn after an agent has already been deployed", () => {
		expect(
			builderConversationIsWorking({
				...completedConversation,
				submissions: [{ status: "ACCEPTED" }, { status: "PENDING" }],
			}),
		).toBe(true);
	});

	it("starts revision progress from the current turn instead of old files", () => {
		const artifacts = [
			{
				path: "agent/README.md",
				createdAt: "2026-08-05T10:00:00.000Z",
			},
			{
				path: "agent/instructions.md",
				createdAt: "2026-08-05T10:05:01.000Z",
			},
		];

		expect(
			completedBuilderSteps(artifacts, "2026-08-05T10:05:00.000Z", "session-1"),
		).toBe(2);
	});

	it("tracks an active Eve session until its continuation token is available", () => {
		expect(
			builderConversationIsWorking({
				...completedConversation,
				continuationToken: null,
			}),
		).toBe(true);
		expect(builderConversationIsWorking(completedConversation)).toBe(false);
	});

	it("reloads the Eve snapshot for parked and completed conversations", () => {
		expect(builderSessionStreamKey("session-1")).toBe("session-1");
		expect(builderSessionStreamKey(null)).toBeNull();
	});

	it("keeps a saved prefix when polling returns only the newest 5,000 events", () => {
		const saved = Array.from({ length: 5_001 }, (_, index) => ({
			meta: { id: `event-${index}` },
		}));
		const recent = saved.slice(1);

		const merged = mergeBuilderEventHistory(saved, recent);

		expect(merged).toHaveLength(5_001);
		expect(merged[0]?.meta.id).toBe("event-0");
		expect(merged.at(-1)?.meta.id).toBe("event-5000");
	});

	it("hides a failed submission after the same retry is accepted", () => {
		expect(
			replacedFailedSubmissionIds([
				{ id: "failed", status: "FAILED", retryKey: "same request" },
				{ id: "retry", status: "ACCEPTED", retryKey: "same request" },
				{ id: "other", status: "FAILED", retryKey: "different request" },
			]),
		).toEqual(new Set(["failed"]));
	});

	it("offers a newer ready version for review without replacing the live version", () => {
		const conversation = {
			...completedConversation,
			createdVersions: [{ id: "version-2", status: "READY" }],
		};
		expect(reviewVersionId(conversation)).toBe("version-2");
		expect(displayedArtifactVersionId(conversation, false)).toBe("version-2");
		expect(displayedArtifactVersionId(conversation, true)).toBeNull();
	});

	it("renders the immutable deployed artifact snapshot after completion", () => {
		const artifacts = [
			{
				id: "working-3",
				versionId: null,
				path: "agent/manifest.json",
				revision: 3,
				status: "WRITING" as const,
			},
			{
				id: "ready-2",
				versionId: "version-1",
				path: "agent/manifest.json",
				revision: 2,
				status: "READY" as const,
			},
		];

		expect(
			latestBuilderArtifacts(artifacts, "version-1").get("agent/manifest.json")
				?.id,
		).toBe("ready-2");
		expect(
			latestBuilderArtifacts(artifacts, null).get("agent/manifest.json")?.id,
		).toBe("working-3");
		expect(latestCompletedArtifactVersionId(artifacts)).toBe("version-1");
	});
});

describe("builderStreamState", () => {
	it("shows resume without allowing cancellation", () => {
		expect(builderStreamState("resuming")).toEqual({
			resuming: true,
			cancellable: false,
		});
	});

	it("allows cancellation during an active turn", () => {
		expect(builderStreamState("streaming")).toEqual({
			resuming: false,
			cancellable: true,
		});
	});
});
