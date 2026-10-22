import { expect, test } from "bun:test";
import { providerBrand } from "@crm/ui/lib/provider-brand";

test("resolves a new provider mark from the installed brand catalog", () => {
	expect(providerBrand("notion", "Notion")).toMatchObject({
		slug: "notion",
		title: "Notion",
		hex: "000000",
	});
	expect(providerBrand("notion", "Notion")?.path).toStartWith("M4.459");
});

test("keeps the initials fallback when a brand is unavailable", () => {
	expect(providerBrand("future-cloud", "Future Cloud")).toBeNull();
});
