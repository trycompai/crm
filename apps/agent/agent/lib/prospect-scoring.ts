import { ProductKey, ProspectKind } from "@crm/db";

export type ProspectObservation = {
	productId: ProductKey;
	kind: ProspectKind;
	countryCode?: string | null;
	legalForm?: string | null;
	domain?: string | null;
	email?: string | null;
	emailVerified?: boolean;
	consentGranted?: boolean;
	text: string;
	sourceCount: number;
};

export type ProspectScore = {
	fit: number;
	intent: number;
	contactability: number;
	total: number;
	eligible: boolean;
	rationale: string;
};

const BEAM_TECH = [
	"capacitor",
	"ionic",
	"react native",
	"cordova",
	"electron",
	"codepush",
	"code push",
	"appflow",
	"capgo",
];
const BEAM_INTENT = [
	"mobile engineer",
	"platform engineer",
	"devops",
	"release",
	"ci/cd",
	"over-the-air",
	"ota",
];
const PROP_FIT = [
	"imobili",
	"property",
	"real estate",
	"renova",
	"reabilita",
	"revenda",
	"investimento",
];
const ARCHIVE_FIT = [
	"fatura",
	"contabil",
	"finance",
	"administr",
	"fornecedor",
	"operações",
	"operations",
];

export function scoreProspect(input: ProspectObservation): ProspectScore {
	const text = normalise(input.text);
	const reasons: string[] = [];
	let fit = 0;
	let intent = 0;

	if (input.productId === ProductKey.BEAMDEPLOY) {
		const technologies = matches(text, BEAM_TECH);
		const signals = matches(text, BEAM_INTENT);
		fit = clamp(technologies * 10 + (input.domain ? 5 : 0), 0, 50);
		intent = clamp(signals * 6, 0, 30);
		if (technologies)
			reasons.push(`${technologies} mobile technology signal(s)`);
		if (signals) reasons.push(`${signals} delivery or hiring signal(s)`);
	} else if (input.productId === ProductKey.PROPMARGIN) {
		const signals = matches(text, PROP_FIT);
		fit = clamp(signals * 12 + (input.countryCode === "PT" ? 10 : 0), 0, 50);
		intent = clamp(signals * 5, 0, 30);
		if (signals) reasons.push(`${signals} property investment signal(s)`);
	} else {
		const signals = matches(text, ARCHIVE_FIT);
		fit = clamp(signals * 9 + (input.countryCode === "PT" ? 10 : 0), 0, 50);
		intent = clamp(signals * 4, 0, 30);
		if (signals)
			reasons.push(`${signals} administration or invoicing signal(s)`);
	}

	let contactability = 0;
	if (input.domain) contactability += 5;
	if (input.email) contactability += 5;
	if (input.emailVerified) contactability += 10;
	if (input.consentGranted) contactability = 20;
	contactability = clamp(contactability, 0, 20);

	const individualRequiresConsent = input.kind === ProspectKind.INDIVIDUAL;
	const eligible =
		(!individualRequiresConsent || input.consentGranted === true) &&
		input.sourceCount >= 1;
	if (!eligible)
		reasons.push("individual electronic outreach has no recorded consent");
	if (input.sourceCount < 2)
		reasons.push("needs a second independent source before drafting");

	const total = eligible ? fit + intent + contactability : 0;
	return {
		fit,
		intent,
		contactability,
		total,
		eligible,
		rationale: reasons.length
			? reasons.join("; ")
			: "No qualifying signal yet.",
	};
}

function matches(text: string, terms: string[]): number {
	return terms.filter((term) => text.includes(normalise(term))).length;
}

function normalise(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
