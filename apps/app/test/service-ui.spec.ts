import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	showServiceNavigation,
	showTodayNavigation,
} from "../components/crm/quick-switcher-navigation";
import { serviceFocusHistory, toServiceListInput } from "../lib/service-input";

const appRoot = resolve(import.meta.dir, "..");
const servicePage = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/service/page.tsx"),
	"utf8",
);
const serviceTable = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/service/service-table.tsx"),
	"utf8",
);
const serviceParams = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/service/service-search-params.ts"),
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

test("service list URL state maps to one valid server input", () => {
	const input = toServiceListInput({
		q: " Help ",
		sort: "unknown",
		dir: "sideways",
		page: 0,
		pageSize: 25,
		status: "OPEN",
		priority: "URGENT",
		matchState: "MATCHED",
		queue: "service",
		customer: "customer-1",
	});

	expect(input).toEqual({
		q: "Help",
		sort: "updatedAt",
		dir: "desc",
		page: 1,
		pageSize: 25,
		status: "OPEN",
		priority: "URGENT",
		matchState: "MATCHED",
		queue: "service",
		customer: "customer-1",
	});
	expect(serviceFocusHistory(true)).toBe("push");
	expect(serviceFocusHistory(false)).toBe("replace");
	expect(serviceParams).toContain('defaultSort: "updatedAt"');
	expect(serviceParams).toContain('"matchState"');
});

test("service page prefetches cases and focuses with URL state", () => {
	expect(servicePage).toContain("trpc.service.list.queryOptions");
	expect(servicePage).toContain(
		"toServiceListInput(serviceSearchParams.toInput(values))",
	);
	expect(serviceTable).toContain('useQueryState("case", parseAsString)');
	expect(serviceTable).toContain("serviceFocusHistory(true)");
	expect(serviceTable).toContain("serviceFocusHistory(false)");
	expect(serviceTable).toContain("trpc.service.byId.queryOptions");
	expect(serviceTable).toContain("disabledReasons");
	expect(serviceTable).toContain("Send disabled");
	expect(serviceTable).toContain("/work?queue=service");
	expect(serviceTable).toContain("/?approval=");
});

test("service is reachable from navigation, switcher and section prefetch", () => {
	expect(showServiceNavigation("")).toBe(true);
	expect(showServiceNavigation("serv")).toBe(true);
	expect(showServiceNavigation("work")).toBe(false);
	expect(showTodayNavigation("serv")).toBe(false);
	expect(rail).toContain('title: "Service"');
	expect(rail).toContain('href: "/service"');
	expect(quickSwitcher).toContain("showServiceNavigation");
	expect(quickSwitcher).toContain('router.push(workspaceUrl("/service"))');
	expect(prefetch).toContain('case "/service"');
	expect(prefetch).toContain("trpc.service.list.queryOptions");
});
