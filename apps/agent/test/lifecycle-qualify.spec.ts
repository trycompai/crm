import { describe, expect, it } from "bun:test";
import { AGENT_ACTION_TYPES } from "../agent/lib/agent-actions";
import { parseAgentManifest } from "../agent/lib/agent-manifest";
import {
	assertQualifyRecommendOnlyActions,
	isRecommendOnlyActionType,
	QUALIFY_LIFECYCLE_ROLE,
	QUALIFY_RECOMMEND_ONLY_ACTION_TYPES,
	QUALIFY_SPECIALIST_NAME,
	qualifySpecialistDraft,
	qualifySpecialistManifest,
} from "../agent/lib/lifecycle-qualify";
import {
	builderDraftToolInput,
	draftInputFromTool,
} from "../agent/subagents/agent_builder/lib/draft-input";

describe("lifecycle qualify specialist", () => {
	it("builds a workspace intake draft tagged as qualify", () => {
		const draft = qualifySpecialistDraft();

		expect(draft.name).toBe(QUALIFY_SPECIALIST_NAME);
		expect(draft.lifecycleRole).toBe(QUALIFY_LIFECYCLE_ROLE);
		expect(draft.recordScope).toBe("WORKSPACE");
		expect(draft.triggers.map((trigger) => trigger.type).sort()).toEqual([
			"EVENT",
			"EVENT",
			"MANUAL",
		]);
		expect(
			draft.triggers.map((trigger) => trigger.event).filter(Boolean),
		).toEqual(["contact.created", "company.created"]);
		expect(draft.actions.map((action) => action.type).sort()).toEqual(
			[...QUALIFY_RECOMMEND_ONLY_ACTION_TYPES].sort(),
		);
	});

	it("builds a selected manual draft when records are supplied", () => {
		const draft = qualifySpecialistDraft({
			recordScope: "SELECTED",
			resources: [{ kind: "contact", id: "c1", label: "Ada Lovelace" }],
		});

		expect(draft.recordScope).toBe("SELECTED");
		expect(draft.triggers).toHaveLength(1);
		expect(draft.triggers[0]?.type).toBe("MANUAL");
		expect(draft.resources).toEqual([
			{ kind: "contact", id: "c1", label: "Ada Lovelace" },
		]);
	});

	it("rejects selected drafts without records and workspace drafts with records", () => {
		expect(() =>
			qualifySpecialistDraft({ recordScope: "SELECTED", resources: [] }),
		).toThrow("Selected Qualify draft");
		expect(() =>
			qualifySpecialistDraft({
				recordScope: "WORKSPACE",
				resources: [{ kind: "company", id: "co1", label: "Acme" }],
			}),
		).toThrow("Workspace Qualify draft");
	});

	it("parses the qualify template as a valid runner manifest", () => {
		const manifest = qualifySpecialistManifest();

		expect(manifest.lifecycleRole).toBe("qualify");
		expect(manifest.dataScope.mode).toBe("WORKSPACE");
		expect(
			manifest.actions.every((action) =>
				isRecommendOnlyActionType(action.type),
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

	it("keeps selected qualify manifests recommend-only", () => {
		const manifest = qualifySpecialistManifest({
			recordScope: "SELECTED",
			resources: [{ kind: "deal", id: "d1", label: "Acme expansion" }],
		});

		expect(manifest.dataScope.mode).toBe("SELECTED");
		assertQualifyRecommendOnlyActions(manifest.actions);
	});

	it("forbids non-recommend action types on qualify", () => {
		expect(() =>
			assertQualifyRecommendOnlyActions([
				{ type: AGENT_ACTION_TYPES.SLACK_MESSAGE_POST },
			]),
		).toThrow("forbids action type");
		expect(() =>
			assertQualifyRecommendOnlyActions([
				{ type: AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE },
				{ type: AGENT_ACTION_TYPES.RUN_SUMMARY },
			]),
		).not.toThrow();
	});

	it("round-trips lifecycleRole through builder draft input", () => {
		const draft = qualifySpecialistDraft();
		const parsed = builderDraftToolInput.parse({
			name: draft.name,
			description: draft.description,
			instructions: draft.instructions,
			lifecycleRole: draft.lifecycleRole,
			triggers: draft.triggers.map((trigger) =>
				trigger.type === "EVENT"
					? {
							type: "EVENT" as const,
							name: trigger.name,
							summary: trigger.summary,
							event: trigger.event as "contact.created" | "company.created",
						}
					: {
							type: "MANUAL" as const,
							name: trigger.name,
							summary: trigger.summary,
						},
			),
			recordScope: draft.recordScope,
			resources: [],
			integrations: [],
			actions: draft.actions,
		});

		expect(draftInputFromTool(parsed).lifecycleRole).toBe("qualify");
		expect(
			parseAgentManifest({
				description: parsed.description,
				lifecycleRole: parsed.lifecycleRole,
				triggers: draft.triggers.map((trigger) => ({
					type: trigger.type,
					name: trigger.name,
					summary: trigger.summary,
					config: trigger.type === "EVENT" ? { event: trigger.event } : {},
				})),
				dataScope: {
					mode: draft.recordScope,
					summary: "Workspace CRM records for intake qualification",
					resources: [],
				},
				actions: draft.actions,
			}).lifecycleRole,
		).toBe("qualify");
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
