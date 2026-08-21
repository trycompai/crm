import { describe, expect, it } from "bun:test";
import { companiesSearchParams } from "@/app/(app)/[slug]/companies/companies-search-params";
import { contactsSearchParams } from "@/app/(app)/[slug]/contacts/contacts-search-params";
import { dealsSearchParams } from "@/app/(app)/[slug]/deals/deals-search-params";
import { membersSearchParams } from "@/app/(app)/[slug]/settings/members/members-search-params";
import {
	assertUnreservedSearchParamKeys,
	RESERVED_SEARCH_PARAM_KEYS,
	SEARCH_PARAM,
} from "./search-param-keys";

const registeredKeys = Object.values(SEARCH_PARAM).flatMap((group) =>
	Object.values(group),
);

describe("SEARCH_PARAM", () => {
	it("gives every feature its own url key", () => {
		expect(registeredKeys.length).toBe(RESERVED_SEARCH_PARAM_KEYS.size);
	});

	it("keeps the fields sheet off the table's fields filter", () => {
		expect(SEARCH_PARAM.fieldsSheet.entity).not.toBe(SEARCH_PARAM.list.fields);
	});
});

describe("assertUnreservedSearchParamKeys", () => {
	it("accepts keys no other feature owns", () => {
		expect(() =>
			assertUnreservedSearchParamKeys(["owner", "industry"], "test"),
		).not.toThrow();
	});

	it("rejects a facet that shadows a reserved key", () => {
		expect(() =>
			assertUnreservedSearchParamKeys(
				["owner", SEARCH_PARAM.dialog.closeDeal],
				"test",
			),
		).toThrow(/closeDeal/);
	});

	it("rejects a facet that shadows a list key", () => {
		expect(() => assertUnreservedSearchParamKeys(["q"], "test")).toThrow(/q/);
	});
});

describe("list tables", () => {
	it("builds every table without a key collision", () => {
		for (const table of [
			companiesSearchParams,
			contactsSearchParams,
			dealsSearchParams,
			membersSearchParams,
		]) {
			expect(Object.keys(table.parsers)).toContain(SEARCH_PARAM.list.fields);
		}
	});
});
