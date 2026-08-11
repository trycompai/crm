export const TASK_KINDS = [
	"brand",
	"portrait",
	"meeting-prep",
	"identify",
	"profile",
	"recheck",
	"company-profile",
	"workspace-profile",
	"field-backfill",
	"prospect-research",
	"website-intake-sync",
	"agentmail-sync",
	"granola-sync",
	"lead-discovery",
	"outreach-compose",
	"email-draft-send",
	"customer-onboarding-plan",
] as const;

export type TaskKind = (typeof TASK_KINDS)[number];

export const DIRECT_KINDS = [
	"brand",
	"portrait",
	"website-intake-sync",
	"agentmail-sync",
	"granola-sync",
	"email-draft-send",
] as const;

export type DirectKind = (typeof DIRECT_KINDS)[number];

export function isDirectKind(kind: string): kind is DirectKind {
	return (DIRECT_KINDS as readonly string[]).includes(kind);
}

export const MAX_ATTEMPTS = 3;

export const RETIRED_OUTCOME = `Gave up after ${MAX_ATTEMPTS} attempts: the session never reported back.`;

export const PRIORITY = {
	brand: 900,
	portrait: 800,
	workspace: 500,
	requested: 300,
	inbound: 250,
	meeting: 200,
	prospectResearch: 150,
	outreachSend: 400,
	outreachCompose: 175,
	leadDiscovery: 160,
	onboarding: 140,
	identify: 100,
	sweep: 50,
	companyProfile: 40,
	fieldBackfill: 20,
	recheck: 0,
} as const;
