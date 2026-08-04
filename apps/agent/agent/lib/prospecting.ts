import { createHash } from "node:crypto";
import {
	ConsentStatus,
	db,
	type ProductKey,
	ProspectKind,
	ProspectStatus,
} from "@crm/db";
import { type BraveHit, braveSearch } from "./brave";
import { githubTechnologySignals } from "./github-prospects";
import {
	contactsByDomain,
	discoverCompanies,
	type HunterCompany,
	type HunterContact,
} from "./hunter";
import { scoreProspect } from "./prospect-scoring";

const MONTHLY_HARD_CAP_CENTS = 60_000;

export async function runProspectDiscovery(productId: ProductKey) {
	const product = await db.product.findUnique({ where: { id: productId } });
	if (!product) throw new Error("No such product.");
	const run = await db.prospectingRun.findFirst({
		where: { productId, status: "PENDING" },
		orderBy: { scheduledFor: "asc" },
	});
	if (!run)
		return {
			ok: true,
			reason: "No pending discovery run.",
			discovered: 0,
			qualified: 0,
			costCents: 0,
		};

	const spend = await monthlySpend();
	if (spend >= MONTHLY_HARD_CAP_CENTS) {
		await db.prospectingRun.update({
			where: { id: run.id },
			data: {
				status: "SKIPPED",
				error: "Monthly provider budget reached.",
				finishedAt: new Date(),
			},
		});
		return {
			ok: false,
			reason: "Monthly provider budget reached.",
			discovered: 0,
			qualified: 0,
			costCents: 0,
		};
	}

	await db.prospectingRun.update({
		where: { id: run.id },
		data: { status: "RUNNING", startedAt: new Date() },
	});
	try {
		const profile = discoveryProfile(productId);
		const [hunter, brave, github] = await Promise.all([
			discoverCompanies(profile.hunterQuery, run.targetCount),
			braveSearch(profile.webQuery, 20),
			productId === "BEAMDEPLOY"
				? githubTechnologySignals(profile.githubTerms)
				: Promise.resolve([]),
		]);

		const companies = hunter.ok ? hunter.data : [];
		const webHits = brave.ok ? brave.data : [];
		const discovered = await persistCompanies({
			productId,
			runId: run.id,
			companies,
			webHits,
			github,
			contactLimit: product.outreachDailyCap,
		});
		const costCents =
			(brave.ok ? brave.costCents : 0) + discovered.contactsFound;

		await db.prospectingRun.update({
			where: { id: run.id },
			data: {
				status: "COMPLETE",
				discovered: discovered.count,
				qualified: discovered.qualified,
				costCents,
				finishedAt: new Date(),
			},
		});
		return {
			ok: true,
			discovered: discovered.count,
			qualified: discovered.qualified,
			costCents,
		};
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		await db.prospectingRun.update({
			where: { id: run.id },
			data: {
				status: "FAILED",
				error: reason.slice(0, 500),
				finishedAt: new Date(),
			},
		});
		return { ok: false, reason, discovered: 0, qualified: 0, costCents: 0 };
	}
}

async function persistCompanies(input: {
	productId: ProductKey;
	runId: string;
	companies: HunterCompany[];
	webHits: BraveHit[];
	github: {
		owner: string;
		repositoryUrl: string;
		evidenceUrl: string;
		term: string;
	}[];
	contactLimit: number;
}) {
	let count = 0;
	let qualified = 0;
	let contactsFound = 0;
	for (const company of input.companies) {
		if (!company.domain) continue;
		const domain = normaliseDomain(company.domain);
		if (!domain || (await suppressed(input.productId, domain))) continue;
		const relatedWeb = input.webHits.filter(
			(hit) =>
				hit.url.includes(domain) ||
				hit.title.toLowerCase().includes(company.name.toLowerCase()),
		);
		const relatedGithub = input.github.filter(
			(hit) =>
				hit.owner.toLowerCase() ===
				company.name.toLowerCase().replace(/\s+/g, ""),
		);
		let contact: HunterContact | undefined;
		if (contactsFound < input.contactLimit) {
			const contacts = await contactsByDomain(domain);
			if (contacts.ok) contact = chooseContact(contacts.data, input.productId);
			if (contact) contactsFound += 1;
		}

		const evidence = [
			{
				kind: "hunter.company",
				detail: company.description || `Hunter matched ${company.name}.`,
				sourceUrl: `https://${domain}`,
				sourceName: "Hunter",
			},
			...relatedWeb.slice(0, 2).map((hit) => ({
				kind: "web.signal",
				detail: `${hit.title}: ${hit.description}`.slice(0, 1000),
				sourceUrl: hit.url,
				sourceName: "Brave Search",
			})),
			...relatedGithub.slice(0, 2).map((hit) => ({
				kind: "github.technology",
				detail: `${hit.term} appears in ${hit.repositoryUrl}.`,
				sourceUrl: hit.evidenceUrl,
				sourceName: "GitHub",
			})),
			...(contact?.sources.slice(0, 1).map((url) => ({
				kind: "contact.source",
				detail: `${contact?.name} — ${contact?.title ?? "professional contact"}.`,
				sourceUrl: url,
				sourceName: "Hunter",
			})) ?? []),
		];
		const text = [
			company.name,
			company.description,
			...evidence.map((item) => item.detail),
		].join(" ");
		const countryCode =
			company.countryCode ?? (input.productId === "BEAMDEPLOY" ? null : "PT");
		const score = scoreProspect({
			productId: input.productId,
			kind: ProspectKind.COMPANY,
			countryCode,
			domain,
			email: contact?.email,
			emailVerified: contact?.verification === "valid",
			text,
			sourceCount: new Set(evidence.map((item) => item.sourceName)).size,
		});
		const independentSources = new Set(evidence.map((item) => item.sourceName))
			.size;
		const status =
			score.total >= 70 && independentSources >= 2
				? ProspectStatus.REVIEW
				: ProspectStatus.DISCOVERED;
		const email = contact?.email.toLowerCase() ?? null;
		const emailHash = email ? hash(email) : null;
		const existing = await db.prospectCandidate.findFirst({
			where: {
				productId: input.productId,
				OR: [{ domain }, ...(emailHash ? [{ emailHash }] : [])],
			},
			select: { id: true },
		});
		const data = {
			kind: ProspectKind.COMPANY,
			status,
			name: contact?.name ?? company.name,
			companyName: company.name,
			domain,
			website: `https://${domain}`,
			email,
			emailHash,
			countryCode,
			title: contact?.title,
			source: "hybrid-discovery",
			consentStatus: ConsentStatus.NOT_REQUIRED,
			fitScore: score.fit,
			intentScore: score.intent,
			contactabilityScore: score.contactability,
			totalScore: score.total,
			scoreRationale: score.rationale,
			eligibilityReason: score.eligible ? null : score.rationale,
			lastResearchedAt: new Date(),
			retentionExpiresAt: daysFromNow(
				status === ProspectStatus.REVIEW ? 730 : 90,
			),
		};
		const candidate = existing
			? await db.prospectCandidate.update({
					where: { id: existing.id },
					data,
					select: { id: true },
				})
			: await db.prospectCandidate.create({
					data: { productId: input.productId, ...data },
					select: { id: true },
				});

		await db.prospectRunCandidate.upsert({
			where: {
				runId_candidateId: { runId: input.runId, candidateId: candidate.id },
			},
			create: { runId: input.runId, candidateId: candidate.id },
			update: {},
		});
		for (const item of evidence) {
			await db.prospectEvidence.upsert({
				where: {
					candidateId_kind_sourceUrl: {
						candidateId: candidate.id,
						kind: item.kind,
						sourceUrl: item.sourceUrl,
					},
				},
				create: { candidateId: candidate.id, ...item },
				update: {
					detail: item.detail,
					sourceName: item.sourceName,
					observedAt: new Date(),
				},
			});
		}
		count += 1;
		if (status === ProspectStatus.REVIEW) qualified += 1;
		if (status === ProspectStatus.REVIEW && email) {
			await queueDraftTask(candidate.id, input.productId, company.name);
		}
	}
	return { count, qualified, contactsFound };
}

async function queueDraftTask(
	candidateId: string,
	productId: ProductKey,
	companyName: string,
) {
	const existing = await db.agentTask.findFirst({
		where: { kind: "prospect-draft", candidateId, finishedAt: null },
		select: { id: true },
	});
	if (existing) return;
	await db.agentTask.create({
		data: {
			kind: "prospect-draft",
			candidateId,
			productId,
			reason: `Prepare a first-touch draft for ${companyName}; evidence and score are ready for human review.`,
			dueAt: new Date(),
			priority: 4,
			budget: 2,
		},
	});
}

function discoveryProfile(productId: ProductKey) {
	if (productId === "BEAMDEPLOY")
		return {
			hunterQuery:
				"Software companies in Portugal, the European Union, United Kingdom, or United States that build mobile applications with Capacitor, Ionic, React Native, Cordova, or Electron",
			webQuery:
				"company hiring mobile platform engineer Capacitor Ionic React Native CodePush Appflow Capgo",
			githubTerms: [
				"@capacitor/core",
				"react-native-code-push",
				"@capgo/capacitor-updater",
			],
		};
	if (productId === "PROPMARGIN")
		return {
			hunterQuery:
				"Portuguese incorporated companies that invest in, renovate, promote, buy, or resell real estate",
			webQuery:
				"site:.pt empresa investimento imobiliário reabilitação revenda imóveis",
			githubTerms: [],
		};
	return {
		hunterQuery:
			"Portuguese incorporated small businesses with finance, administration, operations, suppliers, and recurring invoicing",
		webQuery:
			"site:.pt empresa gestão administrativa faturas fornecedores contabilidade",
		githubTerms: [],
	};
}

function chooseContact<
	T extends { title: string | null; verification: string | null },
>(contacts: T[], productId: ProductKey): T | undefined {
	const titles =
		productId === "BEAMDEPLOY"
			? [
					"cto",
					"vp engineering",
					"head of mobile",
					"platform",
					"devops",
					"engineering",
				]
			: [
					"founder",
					"owner",
					"director",
					"gerente",
					"administr",
					"finance",
					"opera",
				];
	return [...contacts].sort((a, b) => rank(b) - rank(a))[0];
	function rank(contact: T) {
		const title = contact.title?.toLowerCase() ?? "";
		const index = titles.findIndex((value) => title.includes(value));
		return (
			(contact.verification === "valid" ? 20 : 0) +
			(index >= 0 ? titles.length - index : 0)
		);
	}
}

async function suppressed(productId: ProductKey, domain: string) {
	return Boolean(
		await db.suppressionEntry.findFirst({
			where: { domain, OR: [{ productId: null }, { productId }] },
			select: { id: true },
		}),
	);
}

async function monthlySpend() {
	const start = new Date();
	start.setUTCDate(1);
	start.setUTCHours(0, 0, 0, 0);
	const result = await db.prospectingRun.aggregate({
		where: { createdAt: { gte: start } },
		_sum: { costCents: true },
	});
	return result._sum.costCents ?? 0;
}

function normaliseDomain(value: string) {
	const candidate = value
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.split("/")[0]
		?.replace(/^www\./, "");
	return candidate && /^[a-z0-9.-]+$/.test(candidate) ? candidate : null;
}
function hash(value: string) {
	return createHash("sha256").update(value).digest("hex");
}
function daysFromNow(days: number) {
	return new Date(Date.now() + days * 86_400_000);
}
