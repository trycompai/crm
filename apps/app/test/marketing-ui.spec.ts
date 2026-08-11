import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	showMarketingNavigation,
	showServiceNavigation,
} from "../components/crm/quick-switcher-navigation";
import {
	marketingFocusHistory,
	toMarketingListInput,
} from "../lib/marketing-input";

const appRoot = resolve(import.meta.dir, "..");
const marketingPage = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/marketing/page.tsx"),
	"utf8",
);
const marketingTable = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/marketing/marketing-table.tsx"),
	"utf8",
);
const marketingParams = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/marketing/marketing-search-params.ts"),
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

test("marketing list URL state maps to one valid server input", () => {
	const input = toMarketingListInput({
		q: " Campaign ",
		sort: "nonsense",
		dir: "sideways",
		page: 0,
		pageSize: 25,
		status: "DRAFT",
		channel: "email",
		owner: "unassigned",
	});

	expect(input).toEqual({
		q: "Campaign",
		sort: "updatedAt",
		dir: "desc",
		page: 1,
		pageSize: 25,
		status: "DRAFT",
		channel: "email",
		owner: "unassigned",
	});
	expect(marketingFocusHistory(true)).toBe("push");
	expect(marketingFocusHistory(false)).toBe("replace");
	expect(marketingParams).toContain('defaultSort: "updatedAt"');
	expect(marketingParams).toContain('"channel"');
});

test("marketing page prefetches campaigns and focuses with URL state", () => {
	expect(marketingPage).toContain("trpc.marketing.list.queryOptions");
	expect(marketingPage).toContain(
		"toMarketingListInput(marketingSearchParams.toInput(values))",
	);
	expect(marketingTable).toContain('useQueryState("campaign", parseAsString)');
	expect(marketingTable).toContain("marketingFocusHistory(true)");
	expect(marketingTable).toContain("marketingFocusHistory(false)");
	expect(marketingTable).toContain("trpc.marketing.byId.queryOptions");
	expect(marketingTable).toContain("disabledReasons");
	expect(marketingTable).toContain("Publish disabled");
	expect(marketingTable).toContain("Social mutation disabled");
	expect(marketingTable).toContain("Ad spend disabled");
	expect(marketingTable).toContain("/work?queue=marketing");
	expect(marketingTable).toContain("/?approval=");
	expect(marketingTable).toContain("Content calendar");
	expect(marketingTable).toContain("Touchpoints and attribution");
	expect(marketingTable).toContain("Source receipts");
});

test("marketing is reachable from navigation, switcher and section prefetch", () => {
	expect(showMarketingNavigation("")).toBe(true);
	expect(showMarketingNavigation("mark")).toBe(true);
	expect(showMarketingNavigation("serv")).toBe(false);
	expect(showServiceNavigation("mark")).toBe(false);
	expect(rail).toContain('title: "Marketing"');
	expect(rail).toContain('href: "/marketing"');
	expect(quickSwitcher).toContain("showMarketingNavigation");
	expect(quickSwitcher).toContain('router.push(workspaceUrl("/marketing"))');
	expect(prefetch).toContain('case "/marketing"');
	expect(prefetch).toContain("trpc.marketing.list.queryOptions");
});
