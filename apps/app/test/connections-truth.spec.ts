import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appRoot = resolve(import.meta.dir, "..");
const connectionsPage = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/settings/connections/page.tsx"),
	"utf8",
);
const aiGateway = readFileSync(
	resolve(
		appRoot,
		"app/(app)/[slug]/settings/connections/ai-gateway-connection.tsx",
	),
	"utf8",
);
const inbound = readFileSync(
	resolve(
		appRoot,
		"app/(app)/[slug]/settings/connections/inbound-connections.tsx",
	),
	"utf8",
);
const google = readFileSync(
	resolve(
		appRoot,
		"app/(app)/[slug]/settings/connections/google-connection.tsx",
	),
	"utf8",
);
const microsoft = readFileSync(
	resolve(
		appRoot,
		"app/(app)/[slug]/settings/connections/microsoft-connection.tsx",
	),
	"utf8",
);

test("Connections names every operator connection explicitly", () => {
	const surface = [connectionsPage, aiGateway, inbound, google, microsoft].join(
		"\n",
	);

	for (const label of [
		"Website enquiries",
		"Gmail",
		"Calendar",
		"Outlook",
		"AgentMail",
		"Granola",
		"AI Gateway",
	]) {
		expect(surface).toContain(label);
	}
});

test("AI Gateway catalog checks are explicit and not a page-load provider call", () => {
	expect(connectionsPage).toContain(
		"trpc.settings.aiGatewayStatus.queryOptions()",
	);
	expect(connectionsPage).not.toContain(
		"trpc.settings.modelCatalog.queryOptions()",
	);
	expect(aiGateway).toContain("trpc.settings.modelCatalog.queryOptions()");
	expect(aiGateway).toContain("enabled: false");
	expect(aiGateway).toContain("does not start an agent session");
	expect(aiGateway).toContain("AI_GATEWAY_API_KEY");
	expect(aiGateway).toContain("Vercel with OIDC");
});

test("Inbound checks are source-specific and replay stays proposal-only", () => {
	expect(inbound).toContain('check("website")');
	expect(inbound).toContain('check("agentMail")');
	expect(inbound).toContain('check("granola")');
	expect(inbound).toContain("status.data.replay");
	expect(inbound).toContain("Proposal-only replay is local and read-only");
	expect(inbound).toContain("hasHistoricalData");
	expect(inbound).toContain("agentMailCanToggle");
});

test("Gmail, Calendar and Outlook show per-source freshness and replay truth", () => {
	expect(google).toContain("syncSourceState");
	expect(google).toContain("syncSourceFreshness");
	expect(google).toContain("Gmail and Calendar");
	expect(google).toContain("Gmail and Calendar checks are forward-only");
	expect(google).toContain("!source.connected");

	expect(microsoft).toContain("syncSourceState");
	expect(microsoft).toContain("syncSourceFreshness");
	expect(microsoft).toContain("Outlook checks are forward-only");
	expect(microsoft).toContain("!source.connected");
});
