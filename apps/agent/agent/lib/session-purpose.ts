import { z } from "zod";

export type SessionPurpose = "builder" | "team-agent" | "research";

type SessionAttributes = Readonly<Record<string, string | readonly string[]>>;

type PurposeContext = {
	readonly session: {
		readonly auth: {
			readonly current: {
				readonly attributes: SessionAttributes;
			} | null;
			readonly initiator: {
				readonly attributes: SessionAttributes;
			} | null;
		};
	};
};

const attributeText = z.string().trim().min(1).nullable().catch(null);

export function purposeOf(ctx: PurposeContext): SessionPurpose {
	const purpose = attribute(ctx, "purpose");
	if (purpose === "builder" || purpose === "team-agent") return purpose;
	return "research";
}

export function attribute(ctx: PurposeContext, key: string): string | null {
	return (
		attributeText.parse(ctx.session.auth.current?.attributes[key]) ??
		attributeText.parse(ctx.session.auth.initiator?.attributes[key])
	);
}

export function requireAttribute(ctx: PurposeContext, key: string): string {
	const value = attribute(ctx, key);
	if (!value) throw new Error(`This session is missing ${key}.`);
	return value;
}

export function requireBuilderReadAttribute(
	ctx: PurposeContext,
	key: string,
): string {
	if (purposeOf(ctx) !== "builder") {
		throw new Error("This builder tool is unavailable for this session.");
	}
	return requireAttribute(ctx, key);
}

export function requireBuilderAttribute(
	ctx: PurposeContext,
	key: string,
): string {
	if (attribute(ctx, "commandType") !== "CREATE_AGENT") {
		throw new Error(
			"Agent creation requires an explicit request to create or build an agent.",
		);
	}
	return requireBuilderReadAttribute(ctx, key);
}

export function requireTeamAgentAttribute(
	ctx: PurposeContext,
	key: string,
): string {
	if (purposeOf(ctx) !== "team-agent") {
		throw new Error(
			"This deployed-agent tool is unavailable for this session.",
		);
	}
	return requireAttribute(ctx, key);
}

export function assertResearchPurpose(ctx: PurposeContext): void {
	if (purposeOf(ctx) !== "research") {
		throw new Error("This CRM research tool is unavailable for this session.");
	}
}
