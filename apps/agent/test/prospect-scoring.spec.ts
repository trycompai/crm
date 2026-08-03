import { describe, expect, it } from "bun:test";
import { ProductKey, ProspectKind } from "@crm/db";
import { scoreProspect } from "../agent/lib/prospect-scoring";

describe("scoreProspect", () => {
	it("scores a sourced BeamDeploy company deterministically", () => {
		const score = scoreProspect({
			productId: ProductKey.BEAMDEPLOY,
			kind: ProspectKind.COMPANY,
			domain: "example.test",
			email: "cto@example.test",
			emailVerified: true,
			text: "Capacitor Ionic mobile engineer platform release CI/CD OTA",
			sourceCount: 2,
		});
		expect(score.eligible).toBe(true);
		expect(score.total).toBeGreaterThanOrEqual(70);
		expect(score.rationale).toContain("mobile technology");
	});

	it("blocks individuals without recorded consent", () => {
		const score = scoreProspect({
			productId: ProductKey.PROPMARGIN,
			kind: ProspectKind.INDIVIDUAL,
			countryCode: "PT",
			email: "person@example.test",
			text: "investimento imobiliário reabilitação revenda",
			sourceCount: 2,
		});
		expect(score.eligible).toBe(false);
		expect(score.total).toBe(0);
	});
});
