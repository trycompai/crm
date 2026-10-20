export const DEFAULT_PROCUREMENT_MARKUP_RATE = 0.3;
export const DEFAULT_PROCUREMENT_FRESHNESS_HOURS = 48;

export interface ProcurementPricingInput {
	unitCost: number;
	quoteQuantity?: number;
	shippingTotal?: number;
	feesPerUnit?: number;
	otherDirectCostPerUnit?: number;
	markupRate?: number;
}

export interface ProcurementPricingResult {
	landedCost: number;
	sellPrice: number;
	grossProfit: number;
	grossMarginPct: number;
}

const roundMoney = (value: number) =>
	Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateProcurementPricing(
	input: ProcurementPricingInput,
): ProcurementPricingResult {
	const quoteQuantity = input.quoteQuantity ?? 1;
	const markupRate = input.markupRate ?? DEFAULT_PROCUREMENT_MARKUP_RATE;
	const unitCost = input.unitCost;
	const shippingTotal = input.shippingTotal ?? 0;
	const feesPerUnit = input.feesPerUnit ?? 0;
	const otherDirectCostPerUnit = input.otherDirectCostPerUnit ?? 0;

	if (!Number.isFinite(quoteQuantity) || quoteQuantity <= 0) {
		throw new Error("quoteQuantity must be greater than zero");
	}

	for (const [name, value] of Object.entries({
		unitCost,
		shippingTotal,
		feesPerUnit,
		otherDirectCostPerUnit,
		markupRate,
	})) {
		if (!Number.isFinite(value) || value < 0) {
			throw new Error(`${name} must be a non-negative finite number`);
		}
	}

	const landedCost =
		unitCost +
		shippingTotal / quoteQuantity +
		feesPerUnit +
		otherDirectCostPerUnit;
	const sellPrice = landedCost * (1 + markupRate);
	const grossProfit = sellPrice - landedCost;
	const grossMarginPct = sellPrice === 0 ? 0 : (grossProfit / sellPrice) * 100;

	return {
		landedCost: roundMoney(landedCost),
		sellPrice: roundMoney(sellPrice),
		grossProfit: roundMoney(grossProfit),
		grossMarginPct: roundMoney(grossMarginPct),
	};
}
