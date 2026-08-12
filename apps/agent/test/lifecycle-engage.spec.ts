import { describe, expect, it } from "bun:test";
import { AGENT_ACTION_TYPES } from "../agent/lib/agent-actions";
import { parseAgentManifest } from "../agent/lib/agent-manifest";
import {
	assertEngageRecommendOnlyActions,
	ENGAGE_LIFECYCLE_ROLE,
	ENGAGE_RECOMMEND_ONLY_ACTION_TYPES,
	ENGAGE_SPECIALIST_NAME,
	engageSpecialistDraft,
	engageSpecialistManifest,
	isEngageRecommendOnlyActionType,
} from "../agent/lib/lifecycle-engage";
import {
	builderDraftToolInput,
	draftInputFromTool,
} from "../agent/subagents/agent_builder/lib/draft-input";

describe("lifecycle engage specialist", () => {
	it("builds a selected draft tagged as engage by default", () => {
		const draft = engageSpecialistDraft({
			resources: [{ kind: "contact", id: "c1", label: "Ada Lovelace" }],
		});

		expect(draft.name).toBe(ENGAGE_SPECIALIST_NAME);
		expect(draft.lifecycleRole).toBe(ENGAGE_LIFECYCLE_ROLE);
		expect(draft.recordScope).toBe("SELECTED");
		expect(draft.triggers).toHaveLength(1);
		expect(draft.triggers[0]?.type).toBe("MANUAL");
		expect(draft.actions.map((action) => action.type).sort()).toEqual(
			[...ENGAGE_RECOMMEND_ONLY_ACTION_TYPES].sort(),
		);
	});

	it("builds a workspace draft with deal lifecycle events", () => {
		const draft = engageSpecialistDraft({ recordScope: "WORKSPACE" });

		expect(draft.recordScope).toBe("WORKSPACE");
		expect(draft.triggers.map((trigger) => trigger.type).sort()).toEqual([
			"EVENT",
			"EVENT",
			"MANUAL",
		]);
		expect(
			draft.triggers.map((trigger) => trigger.event).filter(Boolean).sort(),
		).toEqual(["deal.opened", "deal.stage.changed"]);
	});

	it("rejects selected drafts without records and workspace drafts with records", () => {
		expect(() =>
			engageSpecialistDraft({ recordScope: "SELECTED", resources: [] }),
		).toThrow("Selected Engage draft");
		expect(() =>
			engageSpecialistDraft({
				recordScope: "WORKSPACE",
				resources: [{ kind: "company", id: "co1", label: "Acme" }],
			}),
		).toThrow("Workspace Engage draft");
	});

	it("parses the engage template as a valid runner manifest", () => {
		const manifest = engageSpecialistManifest({
			resources: [{ kind: "contact", id: "c1", label: "Ada Lovelace" }],
		});

		expect(manifest.lifecycleRole).toBe("engage");
		expect(manifest.dataScope.mode).toBe("SELECTED");
		expect(
			manifest.actions.every((action) =>
				isEngageRecommendOnlyActionType(action.type),
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

	it("keeps workspace engage manifests recommend-only", () => {
		const manifest = engageSpecialistManifest({ recordScope: "WORKSPACE" });

		expect(manifest.dataScope.mode).toBe("WORKSPACE");
		assertEngageRecommendOnlyActions(manifest.actions);
	});

	it("forbids non-recommend action types on engage", () => {
		expect(() =>
			assertEngageRecommendOnlyActions([
				{ type: AGENT_ACTION_TYPES.SLACK_MESSAGE_POST },
			]),
		).toThrow("forbids action type");
		expect(() =>
			assertEngageRecommendOnlyActions([
				{ type: AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE },
				{ type: AGENT_ACTION_TYPES.RUN_SUMMARY },
			]),
		).not.toThrow();
	});

	it("round-trips lifecycleRole through builder draft input", () => {
		const draft = engageSpecialistDraft({
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
			resources: draft.resources
				.filter((resource) => resource.kind !== "integration")
				.map((resource) => ({
					kind: resource.kind as "company" | "contact" | "deal",
					id: resource.id as string,
					label: resource.label,
				})),
			integrations: [],
			actions: draft.actions,
		});

		expect(draftInputFromTool(parsed).lifecycleRole).toBe("engage");
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
					summary: "Selected CRM records for manual outreach recommendations",
					resources: draft.resources,
				},
				actions: draft.actions,
			}).lifecycleRole,
		).toBe("engage");
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
