import { describe, expect, it } from "bun:test";
import { observationSupported } from "../agent/tools/record_prospect_research";

describe("observationSupported", () => {
	it("accepts an exact observed passage", () => {
		expect(
			observationSupported(
				"The role coordinates crews, schedules and project delivery across multiple sites.",
				"The role coordinates crews, schedules and project delivery across multiple sites.",
			),
		).toBe(true);
	});

	it("accepts a source-grounded combination of visible facts", () => {
		expect(
			observationSupported(
				"Established in 1964. We work throughout Wales and England for local authorities, universities, sports clubs and private clients. Services include natural pitches, artificial pitches, maintenance, renovations, drainage, irrigation and earthworks.",
				"The page says the company works throughout Wales and England, serves local authorities, universities, sports clubs and private clients, and provides natural and artificial pitches, maintenance, renovations, drainage, irrigation and earthworks.",
			),
		).toBe(true);
	});

	it("accepts reporting language around visible contact facts", () => {
		expect(
			observationSupported(
				"Call us: 01633 880493 Email us: info@swsgl.co.uk Address: Summerleaze Acres, Pill Street, Magor, Monmouthshire, NP26 3DE General enquiries We'll get back to you in 1-2 business days.",
				"The page publishes 01633 880493, info@swsgl.co.uk and the Magor, Monmouthshire address. It offers a general-enquiries form and says the company will respond in 1-2 business days.",
			),
		).toBe(true);
	});

	it("rejects a persuasive claim that the source does not support", () => {
		expect(
			observationSupported(
				"We design and maintain sports grounds across Wales.",
				"The company is urgently buying artificial intelligence software after losing several major contracts because its existing systems failed.",
			),
		).toBe(false);
	});
});
