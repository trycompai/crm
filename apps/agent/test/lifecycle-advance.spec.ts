import { describe, expect, it } from "bun:test";
import { AGENT_ACTION_TYPES } from "../agent/lib/agent-actions";
import { parseAgentManifest } from "../agent/lib/agent-manifest";
import {
	ADVANCE_LIFECYCLE_ROLE,
	ADVANCE_RECOMMEND_ONLY_ACTION_TYPES,
	ADVANCE_SPECIALIST_NAME,
	advanceSpecialistDraft,
	advanceSpecialistManifest,
	assertAdvanceRecommendOnlyActions,
	isAdvanceRecommendOnlyActionType,
} from "../agent/lib/lifecycle-advance";
import {
	builderDraftToolInput,
	draftInputFromTool,
} from "../agent/subagents/agent_builder/lib/draft-input";

const FIXED_NOW = "2026-08-12T12:00:00.000Z";

describe("lifecycle advance specialist", () => {
	it("builds a workspace draft tagged as advance with event and schedule triggers", () => {
		const draft = advanceSpecialistDraft({ now: FIXED_NOW });

		expect(draft.name).toBe(ADVANCE_SPECIALIST_NAME);
		expect(draft.lifecycleRole).toBe(ADVANCE_LIFECYCLE_ROLE);
		expect(draft.recordScope).toBe("WORKSPACE");
		expect(draft.triggers.map((trigger) => trigger.type).sort()).toEqual([
			"EVENT",
			"EVENT",
			"MANUAL",
			"SCHEDULE",
		]);
		expect(
			draft.triggers
				.map((trigger) => trigger.event)
				.filter(Boolean)
				.sort(),
		).toEqual(["deal.opened", "deal.stage.changed"]);
		const schedule = draft.triggers.find(
			(trigger) => trigger.type === "SCHEDULE",
		);
		expect(schedule?.intervalMinutes).toBe(24 * 60);
		expect(schedule?.nextRunAt).toBe(FIXED_NOW);
		expect(draft.actions.map((action) => action.type).sort()).toEqual(
			[...ADVANCE_RECOMMEND_ONLY_ACTION_TYPES].sort(),
		);
	});

	it("builds a selected manual draft when records are supplied", () => {
		const draft = advanceSpecialistDraft({
			recordScope: "SELECTED",
			resources: [{ kind: "deal", id: "d1", label: "Acme expansion" }],
		});

		expect(draft.recordScope).toBe("SELECTED");
		expect(draft.triggers).toHaveLength(1);
		expect(draft.triggers[0]?.type).toBe("MANUAL");
		expect(draft.resources).toEqual([
			{ kind: "deal", id: "d1", label: "Acme expansion" },
		]);
	});

	it("rejects selected drafts without records and workspace drafts with records", () => {
		expect(() =>
			advanceSpecialistDraft({ recordScope: "SELECTED", resources: [] }),
		).toThrow("Selected Advance draft");
		expect(() =>
			advanceSpecialistDraft({
				recordScope: "WORKSPACE",
				resources: [{ kind: "deal", id: "d1", label: "Acme" }],
			}),
		).toThrow("Workspace Advance draft");
	});

	it("parses the advance template as a valid runner manifest", () => {
		const manifest = advanceSpecialistManifest({ now: FIXED_NOW });

		expect(manifest.lifecycleRole).toBe("advance");
		expect(manifest.dataScope.mode).toBe("WORKSPACE");
		expect(
			manifest.actions.every((action) =>
				isAdvanceRecommendOnlyActionType(action.type),
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
		expect(
			manifest.triggers.some(
				(trigger) =>
					trigger.type === "EVENT" && trigger.config.event === "deal.opened",
			),
		).toBe(true);
		expect(
			manifest.triggers.some(
				(trigger) =>
					trigger.type === "EVENT" &&
					trigger.config.event === "deal.stage.changed",
			),
		).toBe(true);
		expect(
			manifest.triggers.some((trigger) => trigger.type === "SCHEDULE"),
		).toBe(true);
	});

	it("keeps selected advance manifests recommend-only", () => {
		const manifest = advanceSpecialistManifest({
			recordScope: "SELECTED",
			resources: [{ kind: "deal", id: "d1", label: "Acme expansion" }],
		});

		expect(manifest.dataScope.mode).toBe("SELECTED");
		assertAdvanceRecommendOnlyActions(manifest.actions);
	});

	it("forbids non-recommend action types on advance", () => {
		expect(() =>
			assertAdvanceRecommendOnlyActions([
				{ type: AGENT_ACTION_TYPES.SLACK_MESSAGE_POST },
			]),
		).toThrow("forbids action type");
		expect(() =>
			assertAdvanceRecommendOnlyActions([
				{ type: AGENT_ACTION_TYPES.CRM_ACTIVITY_CREATE },
				{ type: AGENT_ACTION_TYPES.RUN_SUMMARY },
			]),
		).not.toThrow();
	});

	it("round-trips lifecycleRole through builder draft input", () => {
		const draft = advanceSpecialistDraft({ now: FIXED_NOW });
		const parsed = builderDraftToolInput.parse({
			name: draft.name,
			description: draft.description,
			instructions: draft.instructions,
			lifecycleRole: draft.lifecycleRole,
			triggers: draft.triggers.map((trigger) => {
				if (trigger.type === "EVENT") {
					return {
						type: "EVENT" as const,
						name: trigger.name,
						summary: trigger.summary,
						event: trigger.event as "deal.opened" | "deal.stage.changed",
					};
				}
				if (trigger.type === "SCHEDULE") {
					return {
						type: "SCHEDULE" as const,
						name: trigger.name,
						summary: trigger.summary,
						intervalMinutes: trigger.intervalMinutes as number,
						nextRunAt: trigger.nextRunAt as string,
					};
				}
				return {
					type: "MANUAL" as const,
					name: trigger.name,
					summary: trigger.summary,
				};
			}),
			recordScope: draft.recordScope,
			resources: [],
			integrations: [],
			actions: draft.actions,
		});

		expect(draftInputFromTool(parsed).lifecycleRole).toBe("advance");
		expect(
			parseAgentManifest({
				description: parsed.description,
				lifecycleRole: parsed.lifecycleRole,
				triggers: draft.triggers.map((trigger) => ({
					type: trigger.type,
					name: trigger.name,
					summary: trigger.summary,
					config:
						trigger.type === "EVENT"
							? { event: trigger.event }
							: trigger.type === "SCHEDULE"
								? {
										intervalMinutes: trigger.intervalMinutes,
										nextRunAt: trigger.nextRunAt ?? FIXED_NOW,
									}
								: {},
				})),
				dataScope: {
					mode: draft.recordScope,
					summary: "Workspace open deals for advance recommendations",
					resources: [],
				},
				actions: draft.actions,
			}).lifecycleRole,
		).toBe("advance");
	});

	it("instructions forbid unattended stage mutation and outreach", () => {
		const draft = advanceSpecialistDraft();
		expect(draft.instructions).toContain("Never change deal stage");
		expect(draft.instructions).toContain("Never send email");
		expect(draft.description).toContain("Recommend only");
	});
});
