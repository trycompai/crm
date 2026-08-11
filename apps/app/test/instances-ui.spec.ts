import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	showInstancesNavigation,
	showMarketingNavigation,
} from "../components/crm/quick-switcher-navigation";
import {
	instanceFocusHistory,
	toInstancesListInput,
} from "../lib/instances-input";

const appRoot = resolve(import.meta.dir, "..");
const instancesPage = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/instances/page.tsx"),
	"utf8",
);
const instancesTable = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/instances/instances-table.tsx"),
	"utf8",
);
const instancesParams = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/instances/instances-search-params.ts"),
	"utf8",
);
const prefetch = readFileSync(
	resolve(appRoot, "components/crm/section-prefetch.ts"),
	"utf8",
);
const rail = readFileSync(
	resolve(appRoot, "components/app-icon-rail.tsx"),
	"utf8",
);
const quickSwitcher = readFileSync(
	resolve(appRoot, "components/crm/quick-switcher.tsx"),
	"utf8",
);
const proxy = readFileSync(resolve(appRoot, "proxy.ts"), "utf8");

test("instances list URL state maps to one valid server input", () => {
	const input = toInstancesListInput({
		q: " Production ",
		sort: "nonsense",
		dir: "sideways",
		page: 0,
		pageSize: 25,
		status: "ACTIVE",
		environment: "production",
		provider: "vercel",
	});

	expect(input).toEqual({
		q: "Production",
		sort: "updatedAt",
		dir: "desc",
		page: 1,
		pageSize: 25,
		status: "ACTIVE",
		environment: "production",
		provider: "vercel",
	});
	expect(instanceFocusHistory(true)).toBe("push");
	expect(instanceFocusHistory(false)).toBe("replace");
	expect(instancesParams).toContain('defaultSort: "updatedAt"');
	expect(instancesParams).toContain('"provider"');
});

test("instances page prefetches read models and focuses with URL state", () => {
	expect(instancesPage).toContain("trpc.instances.list.queryOptions");
	expect(instancesPage).toContain(
		"toInstancesListInput(instancesSearchParams.toInput(values))",
	);
	expect(instancesTable).toContain('useQueryState("instance", parseAsString)');
	expect(instancesTable).toContain("instanceFocusHistory(true)");
	expect(instancesTable).toContain("instanceFocusHistory(false)");
	expect(instancesTable).toContain("trpc.instances.byId.queryOptions");
	expect(instancesTable).toContain("Provider execution disabled");
	expect(instancesTable).toContain("Customer mutation disabled");
	expect(instancesTable).toContain("Secret values hidden");
	expect(instancesTable).toContain("/work?queue=instances");
	expect(instancesTable).toContain("/?approval=");
	expect(instancesTable).toContain("Observed and desired state");
	expect(instancesTable).toContain("Dry-run plans");
	expect(instancesTable).toContain("Commands, operations and receipts");
	expect(instancesTable).not.toContain("payload");
	expect(instancesTable).not.toContain("providerReadback");
});

test("instances is reachable from navigation, switcher and section prefetch", () => {
	expect(showInstancesNavigation("")).toBe(true);
	expect(showInstancesNavigation("inst")).toBe(true);
	expect(showInstancesNavigation("mark")).toBe(false);
	expect(showMarketingNavigation("inst")).toBe(false);
	expect(rail).toContain('title: "Instances"');
	expect(rail).toContain('href: "/instances"');
	expect(quickSwitcher).toContain("showInstancesNavigation");
	expect(quickSwitcher).toContain('router.push(workspaceUrl("/instances"))');
	expect(prefetch).toContain('case "/instances"');
	expect(prefetch).toContain("trpc.instances.list.queryOptions");
	expect(proxy).toContain('"/instances"');
});
