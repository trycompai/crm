import { db, type ProspectRouteStatus, type ProspectStatus } from "@crm/db";
import { PRIORITY } from "@crm/db/agent-tasks";
import { scheduleTask } from "./tasks";

const PERSONAL_DOMAINS = new Set([
	"gmail.com",
	"googlemail.com",
	"hotmail.com",
	"outlook.com",
	"yahoo.com",
	"icloud.com",
	"aol.com",
	"proton.me",
	"protonmail.com",
]);

const GENERIC_PREFIXES = new Set([
	"admin",
	"contact",
	"enquiries",
	"enquiry",
	"hello",
	"info",
	"office",
	"sales",
	"support",
	"team",
]);

export function weightedProspectScore(input: {
	painStrength: number;
	productFit: number;
	timing: number;
	reachability: number;
	evidenceQuality: number;
}): number {
	return Math.round(
		(input.painStrength / 5) * 25 +
			(input.productFit / 5) * 25 +
			(input.timing / 5) * 20 +
			(input.reachability / 5) * 15 +
			(input.evidenceQuality / 5) * 15,
	);
}

export function domainOf(value: string | null): string | null {
	if (!value) return null;
	try {
		return new URL(value.includes("://") ? value : `https://${value}`).hostname
			.toLowerCase()
			.replace(/^www\./, "");
	} catch {
		return null;
	}
}

export function isPublicDirectWorkEmail(
	email: string | null,
	website: string | null,
): boolean {
	if (!email) return false;
	const normalized = email.trim().toLowerCase();
	const [local, domain] = normalized.split("@");
	if (!local || !domain) return false;
	if (PERSONAL_DOMAINS.has(domain) || GENERIC_PREFIXES.has(local)) return false;

	const websiteDomain = domainOf(website);
	return websiteDomain !== null && domain === websiteDomain;
}

type PromotionEvidence = {
	receiptId: string | null;
	sourceType: string;
	url: string;
	signalDate: Date | null;
	observed: string | null;
};

type PromotionCandidate = {
	status: ProspectStatus;
	enrichmentStatus: string;
	website: string | null;
	fitScore: number | null;
	painStrength: number | null;
	productFit: number | null;
	timing: number | null;
	reachability: number | null;
	evidenceQuality: number | null;
	companyProof: string | null;
	painSignal: string | null;
	whyFit: string | null;
	whyNow: string | null;
	suggestedChannel: string | null;
	caution: string | null;
	personalHook: string | null;
	jobDayProblem: string | null;
	nextAction: string | null;
	draftSubject: string | null;
	draftBody: string | null;
	namedPerson: string | null;
	role: string | null;
	personSourceUrl: string | null;
	routeStatus: ProspectRouteStatus;
	routeEmail: string | null;
	evidence: PromotionEvidence[];
};

export function perfectProspectGate(
	prospect: PromotionCandidate,
	now = new Date(),
): { passed: true } | { passed: false; reason: string } {
	if (
		prospect.status === "DISQUALIFIED" ||
		prospect.enrichmentStatus !== "COMPLETE"
	) {
		return { passed: false, reason: "Research is not complete." };
	}

	const dimensions = [
		prospect.painStrength,
		prospect.productFit,
		prospect.timing,
		prospect.reachability,
		prospect.evidenceQuality,
	];
	if (!dimensions.every((score) => score === 5) || prospect.fitScore !== 100) {
		return { passed: false, reason: "Every score dimension must be 5/5." };
	}

	const complete = [
		prospect.companyProof,
		prospect.painSignal,
		prospect.whyFit,
		prospect.whyNow,
		prospect.suggestedChannel,
		prospect.caution,
		prospect.personalHook,
		prospect.jobDayProblem,
		prospect.nextAction,
		prospect.draftSubject,
		prospect.draftBody,
	].every((value) => Boolean(value?.trim()));
	if (!complete) {
		return { passed: false, reason: "The complete prospect card is required." };
	}

	const retained = prospect.evidence.filter(
		(item) => item.receiptId && item.observed?.trim(),
	);
	if (new Set(retained.map((item) => item.url)).size < 2) {
		return {
			passed: false,
			reason: "Two observed public evidence sources are required.",
		};
	}

	const companyDomain = domainOf(prospect.website);
	const recentBoundary = now.getTime() - 120 * 24 * 60 * 60 * 1000;
	const currentJob = retained.some(
		(item) =>
			item.sourceType === "OFFICIAL_JOB_POSTING" &&
			item.signalDate !== null &&
			item.signalDate.getTime() >= recentBoundary &&
			item.signalDate.getTime() <= now.getTime() &&
			domainOf(item.url) === companyDomain,
	);
	if (!companyDomain || !currentJob) {
		return {
			passed: false,
			reason:
				"A dated official company-domain job posting from the last 120 days is required.",
		};
	}

	if (!prospect.namedPerson || !prospect.role || !prospect.personSourceUrl) {
		return {
			passed: false,
			reason: "A public source must confirm the named person and role.",
		};
	}
	const personEvidence = retained.find(
		(item) => item.url === prospect.personSourceUrl,
	);
	const personObserved = personEvidence?.observed?.toLowerCase() ?? "";
	if (
		!personEvidence ||
		!personObserved.includes(prospect.namedPerson.toLowerCase()) ||
		!personObserved.includes(prospect.role.toLowerCase())
	) {
		return {
			passed: false,
			reason:
				"Retained evidence must visibly support the named person and role.",
		};
	}

	if (
		!isPublicDirectWorkEmail(prospect.routeEmail, prospect.website) ||
		!new Set(["DIRECT_ROUTE_REVIEW", "SEND_READY_REVIEW"]).has(
			prospect.routeStatus,
		)
	) {
		return {
			passed: false,
			reason: "A verified direct public work route is required.",
		};
	}
	const routeEmail = prospect.routeEmail?.toLowerCase() ?? "";
	if (
		!retained.some((item) => item.observed?.toLowerCase().includes(routeEmail))
	) {
		return {
			passed: false,
			reason:
				"Retained public evidence must visibly contain the exact work email.",
		};
	}

	return { passed: true };
}

export async function promotePerfectProspect(prospectId: string) {
	const prospect = await db.prospect.findUnique({
		where: { id: prospectId },
		include: { evidence: true },
	});
	if (!prospect) {
		return { promoted: false as const, reason: "No such prospect." };
	}
	if (prospect.status === "PROMOTED") {
		return {
			promoted: true as const,
			reason: "Already promoted.",
			companyId: prospect.companyId,
			contactId: prospect.contactId,
		};
	}

	const gate = perfectProspectGate(prospect);
	if (!gate.passed) return { promoted: false as const, reason: gate.reason };

	const routeEmail = prospect.routeEmail?.trim().toLowerCase() as string;
	const domain = domainOf(prospect.website) as string;
	const [suppressedContact, suppressedDomain] = await Promise.all([
		db.suppressedContact.findUnique({ where: { email: routeEmail } }),
		db.suppressedDomain.findUnique({ where: { domain } }),
	]);
	if (suppressedContact || suppressedDomain) {
		return { promoted: false as const, reason: "The route is suppressed." };
	}
	const routeOwner = await db.contact.findFirst({
		where: { email: { equals: routeEmail, mode: "insensitive" } },
		select: { company: { select: { domain: true } } },
	});
	if (routeOwner?.company?.domain && routeOwner.company.domain !== domain) {
		return {
			promoted: false as const,
			reason: "The verified route already belongs to a different CRM company.",
		};
	}

	const result = await db.$transaction(async (tx) => {
		const existingCompany =
			(await tx.company.findUnique({ where: { domain } })) ??
			(await tx.company.findFirst({
				where: {
					name: { equals: prospect.companyName, mode: "insensitive" },
					countryCode: prospect.countryCode,
				},
			}));
		const company = existingCompany
			? await tx.company.update({
					where: { id: existingCompany.id },
					data: {
						website: existingCompany.website ?? prospect.website,
						country: existingCompany.country ?? prospect.country,
						countryCode: existingCompany.countryCode ?? prospect.countryCode,
						description: existingCompany.description ?? prospect.companyProof,
					},
				})
			: await tx.company.create({
					data: {
						name: prospect.companyName,
						domain,
						website: prospect.website,
						country: prospect.country,
						countryCode: prospect.countryCode,
						description: prospect.companyProof,
						source: "IMPORT",
					},
				});

		const name = splitName(prospect.namedPerson as string);
		const existingContact =
			(await tx.contact.findFirst({
				where: { email: { equals: routeEmail, mode: "insensitive" } },
			})) ??
			(await tx.contact.findFirst({
				where: {
					companyId: company.id,
					firstName: {
						equals: name.firstName,
						mode: "insensitive",
					},
					lastName: {
						equals: name.lastName,
						mode: "insensitive",
					},
				},
			}));
		const linkedinUrl = linkedin(prospect.personSourceUrl);
		const contact = existingContact
			? await tx.contact.update({
					where: { id: existingContact.id },
					data: {
						companyId: existingContact.companyId ?? company.id,
						email: existingContact.email ?? routeEmail,
						title: existingContact.title ?? prospect.role,
						linkedinUrl: existingContact.linkedinUrl ?? linkedinUrl,
					},
				})
			: await tx.contact.create({
					data: {
						firstName: name.firstName,
						lastName: name.lastName,
						email: routeEmail,
						title: prospect.role,
						linkedinUrl,
						companyId: company.id,
						source: "IMPORT",
					},
				});

		if (!company.primaryContactId) {
			await tx.company.update({
				where: { id: company.id },
				data: { primaryContactId: contact.id },
			});
		}

		await tx.prospect.update({
			where: { id: prospectId },
			data: {
				status: "PROMOTED",
				companyId: company.id,
				contactId: contact.id,
				promotedAt: new Date(),
				blockReason: null,
			},
		});

		return {
			companyId: company.id,
			contactId: contact.id,
			createdCompany: !existingCompany,
			createdContact: !existingContact,
		};
	});

	await Promise.all([
		scheduleTask({
			companyId: result.companyId,
			kind: "brand",
			reason: `Promoted from verified prospect research: ${prospect.companyName}`,
			dueAt: new Date(),
			priority: PRIORITY.brand,
			budget: 2,
		}),
		scheduleTask({
			companyId: result.companyId,
			kind: "company-profile",
			reason: `Promoted from verified prospect research: ${prospect.companyName}`,
			dueAt: new Date(),
			priority: PRIORITY.companyProfile,
			budget: 4,
		}),
		scheduleTask({
			contactId: result.contactId,
			kind: "identify",
			reason: `Promoted from a verified public route: ${prospect.companyName}`,
			dueAt: new Date(),
			priority: PRIORITY.identify,
			budget: 4,
		}),
	]);

	return {
		promoted: true as const,
		reason: "Perfect qualification passed.",
		...result,
	};
}

function splitName(value: string): {
	firstName: string;
	lastName: string | null;
} {
	const parts = value.trim().split(/\s+/);
	return {
		firstName: parts.shift() ?? value.trim(),
		lastName: parts.length > 0 ? parts.join(" ") : null,
	};
}

function linkedin(value: string | null): string | null {
	if (!value) return null;
	return domainOf(value)?.endsWith("linkedin.com") ? value : null;
}
