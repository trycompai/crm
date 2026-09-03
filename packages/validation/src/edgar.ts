import { z } from "zod";

const cik = z
	.string()
	.trim()
	.regex(/^\d{1,10}$/);
const day = z
	.string()
	.trim()
	.regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number().nullable();

export const edgarHealth = z.object({
	ok: z.literal(true),
	version: z.string(),
	edgartools: z.string(),
	identitySet: z.boolean(),
});

export const edgarCompanyMatch = z.object({
	cik,
	name: z.string().trim().min(1),
	ticker: z.string().trim().nullable(),
	exchange: z.string().trim().nullable(),
});

export const edgarCompanySearch = z.object({
	companies: z.array(edgarCompanyMatch),
});

export const edgarAddress = z.object({
	street: z.string().nullable(),
	city: z.string().nullable(),
	state: z.string().nullable(),
	zip: z.string().nullable(),
});

export const edgarCompany = z.object({
	cik,
	name: z.string().trim().min(1),
	tickers: z.array(z.string()),
	exchanges: z.array(z.string()),
	sic: z.string().nullable(),
	sicDescription: z.string().nullable(),
	stateOfIncorporation: z.string().nullable(),
	fiscalYearEnd: z.string().nullable(),
	category: z.string().nullable(),
	businessAddress: edgarAddress.nullable(),
	website: z.string().nullable(),
	formerNames: z.array(z.string()),
	url: z.string().url(),
});

export const edgarFiling = z.object({
	accession: z.string().trim().min(1),
	form: z.string().trim().min(1),
	filedAt: day,
	reportDate: day.nullable(),
	description: z.string().nullable(),
	url: z.string().url(),
});

export const edgarFilings = z.object({
	filings: z.array(edgarFiling),
	truncated: z.boolean(),
});

export const edgarFilingHit = edgarFiling.extend({
	company: z.object({ cik, name: z.string().trim().min(1) }),
});

export const edgarFilingSearch = z.object({
	filings: z.array(edgarFilingHit),
	total: z.number().int().nonnegative(),
});

export const edgarOwner = z.object({
	filer: z.string().trim().min(1),
	form: z.string().trim().min(1),
	filedAt: day,
	shares: money,
	percent: money,
	soleVoting: money,
	sharedVoting: money,
	purpose: z.string().nullable(),
	url: z.string().url(),
});

export const edgarOwners = z.object({
	owners: z.array(edgarOwner),
	filingsRead: z.number().int().nonnegative(),
});

export const edgarInsiderTransaction = z.object({
	insider: z.string().trim().min(1),
	title: z.string().nullable(),
	form: z.string().trim().min(1),
	filedAt: day,
	kind: z.string().nullable(),
	shares: money,
	price: money,
	url: z.string().url(),
});

export const edgarInsiders = z.object({
	transactions: z.array(edgarInsiderTransaction),
});

export const edgarCompensationYear = z.object({
	fiscalYearEnd: day.nullable(),
	peoTotalComp: money,
	peoActuallyPaidComp: money,
	neoAverageTotalComp: money,
	neoAverageActuallyPaidComp: money,
});

export const edgarPerformanceYear = z.object({
	fiscalYearEnd: day.nullable(),
	peoActuallyPaidComp: money,
	neoAverageActuallyPaidComp: money,
	tsr: money,
	peerTsr: money,
	netIncome: money,
	selectedMeasureValue: money,
});

export const edgarExecutivePay = z.object({
	name: z.string().trim().min(1),
	title: z.string().nullable(),
	year: z.number().int().nullable(),
	salary: money,
	bonus: money,
	stockAwards: money,
	optionAwards: money,
	nonEquityIncentive: money,
	otherCompensation: money,
	total: money,
});

export const edgarProxyHolder = z.object({
	name: z.string().trim().min(1),
	percentOfClass: money,
	shares: money,
});

export const edgarProposal = z.object({
	number: z.number().int().nullable(),
	description: z.string(),
	type: z.string().nullable(),
});

export const edgarProxy = z.object({
	accession: z.string().trim().min(1),
	filedAt: day,
	url: z.string().url(),
	peo: z.object({
		name: z.string().nullable(),
		totalComp: money,
		actuallyPaidComp: money,
	}),
	neoAverage: z.object({ totalComp: money, actuallyPaidComp: money }),
	compensationByYear: z.array(edgarCompensationYear),
	payVsPerformance: z.array(edgarPerformanceYear),
	executives: z.array(edgarExecutivePay),
	holders: z.array(edgarProxyHolder),
	proposals: z.array(edgarProposal),
	performanceMeasures: z.array(z.string()),
	selectedMeasureName: z.string().nullable(),
	ceoPayRatio: z
		.object({ ceo: money, medianEmployee: money, ratio: money })
		.nullable(),
	insiderTradingPolicyAdopted: z.boolean().nullable(),
});

export const edgarCompensationComparison = z.object({
	rows: z.array(
		z.object({
			ticker: z.string(),
			cik: cik.nullable(),
			name: z.string().nullable(),
			fiscalYearEnd: day.nullable(),
			peoName: z.string().nullable(),
			peoTotalComp: money,
			peoActuallyPaidComp: money,
			tsr: money,
			netIncome: money,
			reason: z.string().nullable(),
		}),
	),
});

export type EdgarHealth = z.infer<typeof edgarHealth>;
export type EdgarCompanyMatch = z.infer<typeof edgarCompanyMatch>;
export type EdgarCompany = z.infer<typeof edgarCompany>;
export type EdgarFiling = z.infer<typeof edgarFiling>;
export type EdgarFilingHit = z.infer<typeof edgarFilingHit>;
export type EdgarOwner = z.infer<typeof edgarOwner>;
export type EdgarInsiderTransaction = z.infer<typeof edgarInsiderTransaction>;
export type EdgarProxy = z.infer<typeof edgarProxy>;
export type EdgarCompensationComparison = z.infer<
	typeof edgarCompensationComparison
>;
