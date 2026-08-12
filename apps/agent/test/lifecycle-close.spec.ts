import { describe, expect, it } from "bun:test";
import { AGENT_ACTION_TYPES } from "../agent/lib/agent-actions";
import { parseAgentManifest } from "../agent/lib/agent-manifest";
import {
	assertCloseRecommendOnlyActions,
	CLOSE_LIFECYCLE_ROLE,
	CLOSE_RECOMMEND_ONLY_ACTION_TYPES,
	CLOSE_SPECIALIST_NAME,
	closeSpecialistDraft,
	closeSpecialistManifest,
	isCloseRecommendOnlyActionType,
} from "../agent/lib/lifecycle-close";
import {
	builderDraftToolInput,
	draftInputFromTool,
} from "../agent/subagents/agent_builder/lib/draft-input";

describe("lifecycle close specialist", () => {
	it("builds a selected manual draft tagged as close by default", () => {
		const draft = closeSpecialistDraft({
			resources: [{ kind: "deal", id: "d1", label: "Acme expansion" }],
		});

		expect(draft.name).toBe(CLOSE_SPECIALIST_NAME);
		expect(draft.lifecycleRole).toBe(CLOSE_LIFECYCLE_ROLE);
		expect(draft.recordScope).toBe("SELECTED");
		expect(draft.triggers).toHaveLength(1);
		expect(draft.triggers[0]?.type).toBe("MANUAL");
		expect(draft.resources).toEqual([
			{ kind: "deal", id: "d1", label: "Acme expansion" },
		]);
		expect(draft.actions.map((action) => action.type).sort()).toEqual(
			[...CLOSE_RECOMMEND_ONLY_ACTION_TYPES].sort(),
		);
	});

	it("builds a workspace draft with deal.closed when requested", () => {
		const draft = closeSpecialistDraft({ recordScope: "WORKSPACE" });

		expect(draft.recordScope).toBe("WORKSPACE");
		expect(draft.triggers.map((trigger) => trigger.type).sort()).toEqual([
			"EVENT",
			"MANUAL",
		]);
		expect(draft.triggers.map((trigger) => trigger.event).filter(Boolean)).toEqual(
			["deal.closed"],
		);
		expect(draft.resources).toEqual([]);
	});

	it("rejects selected drafts without records and workspace drafts with records", () => {
		expect(() =>
			closeSpecialistDraft({ recordScope: "SELECTED", resources: [] }),
		).toThrow("Selected Close draft");
		expect(() =>
			closeSpecialistDraft({
				recordScope: "WORKSPACE",
				resources: [{ kind: "deal", id: "d1", label: "Acme" }],
			}),
		).toThrow("Workspace Close draft");
	});

	it("parses the close template as a valid runner manifest", () => {
		const manifest = closeSpecialistManifest({
			resources: [{ kind: "deal", id: "d1", label: "Acme expansion" }],
		});

		expect(manifest.lifecycleRole).toBe("close");
		expect(manifest.dataScope.mode).toBe("SELECTED");
		expect(
			manifest.actions.every((action) =>
				isCloseRecommendOnlyActionType(action.type),
			),
		).toBe(true);
		expect(
			manifest.actions.some(
				(action) => action.type === AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE,
			),
		).toBe(true);
		expect(
			manifest.actions.some(
				(action) => action.type === AGENT_ACTION_TYPES.RUN_SUMMARY,
			),
		).toBe(true);
		expect(
			manifest.actions.some(
				(action) => action.type === AGENT_ACTION_TYPES.SLACK_MESSAGE_POST,
			),
		).toBe(false);
	});

	it("keeps workspace close manifests recommend-only with deal.closed", () => {
		const manifest = closeSpecialistManifest({ recordScope: "WORKSPACE" });

		expect(manifest.dataScope.mode).toBe("WORKSPACE");
		expect(manifest.triggers.some((trigger) => trigger.type === "EVENT")).toBe(
			true,
		);
		assertCloseRecommendOnlyActions(manifest.actions);
	});

	it("forbids non-recommend action types on close", () => {
		expect(() =>
			assertCloseRecommendOnlyActions([
				{ type: AGENT_ACTION_TYPES.SLACK_MESSAGE_POST },
			]),
		).toThrow("forbids action type");
		expect(() =>
			assertCloseRecommendOnlyActions([
				{ type: AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE },
				{ type: AGENT_ACTION_TYPES.RUN_SUMMARY },
			]),
		).not.toThrow();
	});

	it("round-trips lifecycleRole through builder draft input", () => {
		const draft = closeSpecialistDraft({
			resources: [{ kind: "deal", id: "d1", label: "Acme expansion" }],
		});
		const parsed = builderDraftToolInput.parse({
			name: draft.name,
			description: draft.description,
			instructions: draft.instructions,
			lifecycleRole: draft.lifecycleRole,
			triggers: draft.triggers.map((trigger) => ({
				type: "MANUAL" as const,
				name: trigger.name,
				summary: trigger.summary,
			})),
			recordScope: draft.recordScope,
			resources: draft.resources,
			integrations: [],
			actions: draft.actions,
		});

		expect(draftInputFromTool(parsed).lifecycleRole).toBe("close");
		expect(
			parseAgentManifest({
				description: parsed.description,
				lifecycleRole: parsed.lifecycleRole,
				triggers: draft.triggers.map((trigger) => ({
					type: trigger.type,
					name: trigger.name,
					summary: trigger.summary,
					config: {},
				})),
				dataScope: {
					mode: draft.recordScope,
					summary: "Selected CRM records for manual close handoff",
					resources: draft.resources,
				},
				actions: draft.actions,
			}).lifecycleRole,
		).toBe("close");
	});

	it("leaves generic team agents without a lifecycle role", () => {
		const manifest = parseAgentManifest({
			description: "Generic alert",
			triggers: [
				{
					type: "MANUAL",
					name: "Run",
					summary: "On demand",
					config: {},
				},
			],
			dataScope: {
				mode: "WORKSPACE",
				summary: "Workspace",
				resources: [],
			},
			actions: [
				{
					type: AGENT_ACTION_TYPES.RUN_SUMMARY,
					provider: "crm",
					summary: "Summarize",
				},
			],
		});

		expect(manifest.lifecycleRole).toBeUndefined();
	});
});
