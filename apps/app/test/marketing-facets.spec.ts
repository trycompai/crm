import { describe, expect, test } from "bun:test";
import { filterSchema } from "@crm/db/marketing";
import type { RuleTreeValue } from "@crm/ui/components/rule-tree";
import {
	fromDefinition,
	ruleProblems,
	toDefinition,
} from "@/lib/marketing-facets";

function tree(rules: RuleTreeValue["rules"], match: "all" | "any" = "all") {
	return { match, rules } satisfies RuleTreeValue;
}

describe("every rule the builder writes is a rule the compiler reads", () => {
	test("a plain facet", () => {
		const definition = toDefinition(
			tree([{ id: "a", facet: "contact.hasEmail", value: "" }]),
		);

		expect(filterSchema.safeParse(definition).success).toBe(true);
	});

	test("a deal stage", () => {
		const definition = toDefinition(
			tree([{ id: "a", facet: "deal.atStage", value: "CLOSED_WON" }]),
		);

		expect(definition).toEqual({
			facet: { facet: "deal.atStage", stage: "CLOSED_WON" },
		});
		expect(filterSchema.safeParse(definition).success).toBe(true);
	});

	test("a domain list splits on commas", () => {
		const definition = toDefinition(
			tree([
				{ id: "a", facet: "company.domainIn", value: "acme.com, globex.com" },
			]),
		);

		expect(definition).toEqual({
			facet: {
				facet: "company.domainIn",
				domains: ["acme.com", "globex.com"],
			},
		});
		expect(filterSchema.safeParse(definition).success).toBe(true);
	});

	test("a custom field carries both halves", () => {
		const definition = toDefinition(
			tree([
				{ id: "a", facet: "field.equals", value: "tier", extra: "Enterprise" },
			]),
		);

		expect(definition).toEqual({
			facet: { facet: "field.equals", key: "tier", value: "Enterprise" },
		});
		expect(filterSchema.safeParse(definition).success).toBe(true);
	});

	test("a custom field with no value is a problem, not a half-written rule", () => {
		const value = tree([{ id: "a", facet: "field.equals", value: "tier" }]);

		expect(ruleProblems(value)).toHaveLength(1);
		expect(toDefinition(value)).toBeNull();
	});
});

describe("is not", () => {
	test("wraps one facet in a not the compiler understands", () => {
		const definition = toDefinition(
			tree([{ id: "a", facet: "deal.hasNoOpen", value: "", negate: true }]),
		);

		expect(definition).toEqual({ not: { facet: { facet: "deal.hasNoOpen" } } });
		expect(filterSchema.safeParse(definition).success).toBe(true);
	});

	test("survives a round trip beside a plain rule", () => {
		const before = tree([
			{ id: "a", facet: "contact.hasEmail", value: "" },
			{ id: "b", facet: "deal.atStage", value: "CLOSED_WON", negate: true },
		]);

		const definition = toDefinition(before);
		expect(filterSchema.safeParse(definition).success).toBe(true);

		const after = fromDefinition(definition);

		expect(ruleProblems(after)).toHaveLength(0);
		expect(after.rules.map((rule) => rule.facet)).toEqual([
			"contact.hasEmail",
			"deal.atStage",
		]);
		expect(after.rules[1]?.negate).toBe(true);
		expect(after.rules[0]?.negate).toBeUndefined();
		expect(toDefinition(after)).toEqual(definition);
	});
});

describe("a rule the builder cannot show", () => {
	test("is reported rather than dropped in silence", () => {
		const value = fromDefinition({
			all: [
				{ facet: { facet: "contact.hasEmail" } },
				{ not: { any: [{ facet: { facet: "deal.hasNoOpen" } }] } },
			],
		});

		expect(ruleProblems(value)).toHaveLength(1);
	});
});
