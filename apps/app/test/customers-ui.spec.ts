import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { showCustomersNavigation } from "../components/crm/quick-switcher-navigation";
import {
	customerFocusHistory,
	toCustomerListInput,
} from "../lib/customer-input";

const appRoot = resolve(import.meta.dir, "..");
const customersPage = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/customers/page.tsx"),
	"utf8",
);
const customersTable = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/customers/customers-table.tsx"),
	"utf8",
);
const customersParams = readFileSync(
	resolve(appRoot, "app/(app)/[slug]/customers/customers-search-params.ts"),
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

test("customer list URL state maps to one valid server input", () => {
	const input = toCustomerListInput({
		q: " Acme ",
		sort: "unknown",
		dir: "sideways",
		page: 0,
		pageSize: 25,
		status: "ACTIVE",
		onboardingStatus: "DATA_ACCESS",
		owner: "owner-1",
	});

	expect(input).toEqual({
		q: "Acme",
		sort: "updatedAt",
		dir: "desc",
		page: 1,
		pageSize: 25,
		status: "ACTIVE",
		onboardingStatus: "DATA_ACCESS",
		owner: "owner-1",
	});
	expect(customerFocusHistory(true)).toBe("push");
	expect(customerFocusHistory(false)).toBe("replace");
	expect(customersParams).toContain('defaultSort: "updatedAt"');
	expect(customersParams).toContain('"onboardingStatus"');
});

test("customers page prefetches the read model and focuses with URL state", () => {
	expect(customersPage).toContain("trpc.customers.list.queryOptions");
	expect(customersPage).toContain(
		"toCustomerListInput(customersSearchParams.toInput(values))",
	);
	expect(customersTable).toContain('useQueryState("customer", parseAsString)');
	expect(customersTable).toContain("customerFocusHistory(true)");
	expect(customersTable).toContain("customerFocusHistory(false)");
	expect(customersTable).toContain("trpc.customers.byId.queryOptions");
	expect(customersTable).toContain("disabledReasons");
	expect(customersTable).toContain("/work?queue=customers");
	expect(customersTable).toContain("/?approval=");
});

test("customers are reachable from primary navigation and command switcher", () => {
	expect(showCustomersNavigation("")).toBe(true);
	expect(showCustomersNavigation("cust")).toBe(true);
	expect(showCustomersNavigation("work")).toBe(false);
	expect(rail).toContain('title: "Customers"');
	expect(rail).toContain('href: "/customers"');
	expect(quickSwitcher).toContain("showCustomersNavigation");
	expect(quickSwitcher).toContain('router.push(workspaceUrl("/customers"))');
});
