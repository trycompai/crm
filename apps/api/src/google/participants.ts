import { domainFromEmail, isMachineDomain } from "../companies/domain";

export type Participant = {
	email: string;
	name: string | null;
};

const AUTOMATED_LOCAL_PARTS = [
	"noreply",
	"no-reply",
	"donotreply",
	"do-not-reply",
	"notifications",
	"notification",
	"mailer-daemon",
	"postmaster",
	"bounce",
	"bounces",
	"auto-confirm",
	"automated",
	"calendar-invite",
	"calendar",
	"invite",
	"invites",
	"invitations",
	"meetings",
	"scheduling",
	"booking",
	"bookings",
	"reply",
	"support",
	"help",
	"hello",
	"info",
	"contact",
	"sales",
	"billing",
	"accounts",
	"team",
];

export function parseAddress(input: string): Participant | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	const angled = trimmed.match(/^(.*)<([^<>]+)>\s*$/);

	const rawEmail = (angled?.[2] ?? trimmed).trim().toLowerCase();
	if (!isEmailish(rawEmail)) return null;

	const rawName = angled?.[1]?.trim() ?? "";
	const name = rawName.replace(/^"(.*)"$/, "$1").trim();

	return { email: rawEmail, name: name || null };
}

export function parseAddressList(
	header: string | null | undefined,
): Participant[] {
	if (!header) return [];

	const parts: string[] = [];
	let current = "";
	let inQuotes = false;
	let inAngles = false;

	for (const char of header) {
		if (char === '"') inQuotes = !inQuotes;
		if (char === "<") inAngles = true;
		if (char === ">") inAngles = false;

		if (char === "," && !inQuotes && !inAngles) {
			parts.push(current);
			current = "";
			continue;
		}
		current += char;
	}
	parts.push(current);

	const seen = new Set<string>();
	const participants: Participant[] = [];

	for (const part of parts) {
		const parsed = parseAddress(part);
		if (!parsed || seen.has(parsed.email)) continue;
		seen.add(parsed.email);
		participants.push(parsed);
	}

	return participants;
}

export function isAutomatedAddress(email: string): boolean {
	const local = email.split("@")[0]?.toLowerCase() ?? "";
	if (!local) return true;

	return AUTOMATED_LOCAL_PARTS.some(
		(pattern) =>
			local === pattern ||
			local.startsWith(`${pattern}-`) ||
			local.startsWith(`${pattern}+`) ||
			local.startsWith(`${pattern}_`),
	);
}

const OPAQUE_LOCAL_PARTS = [
	/^(c_)?[0-9a-f]{24,}$/,
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
];

export function isMachineAddress(email: string): boolean {
	const at = email.lastIndexOf("@");
	if (at < 1) return true;

	if (isMachineDomain(email.slice(at + 1))) return true;

	const local = email.slice(0, at).toLowerCase();
	return OPAQUE_LOCAL_PARTS.some((pattern) => pattern.test(local));
}

export function isDerivedName(
	email: string,
	firstName: string,
	lastName: string | null,
): boolean {
	const derived = splitName(null, email);
	return (
		derived.firstName === firstName && (derived.lastName ?? null) === lastName
	);
}

export function workDomain(email: string): string | null {
	return domainFromEmail(email);
}

export type ExternalFilterOptions = {
	ourDomains: ReadonlySet<string>;
	ourAddresses: ReadonlySet<string>;
	suppressedDomains: ReadonlySet<string>;
	suppressedEmails: ReadonlySet<string>;
};

export function externalParticipants(
	participants: readonly Participant[],
	options: ExternalFilterOptions,
): Participant[] {
	return participants.filter((participant) => {
		if (options.ourAddresses.has(participant.email)) return false;
		if (options.suppressedEmails.has(participant.email)) return false;
		if (isMachineAddress(participant.email)) return false;

		const domain = workDomain(participant.email);
		if (!domain) return false;
		if (options.ourDomains.has(domain)) return false;
		if (options.suppressedDomains.has(domain)) return false;
		if (isAutomatedAddress(participant.email)) return false;

		return true;
	});
}

export function dominantDomain(
	participants: readonly Participant[],
	preferKnown: ReadonlySet<string> = new Set(),
): string | null {
	const counts = new Map<string, number>();

	for (const participant of participants) {
		const domain = workDomain(participant.email);
		if (!domain) continue;
		counts.set(domain, (counts.get(domain) ?? 0) + 1);
	}

	if (counts.size === 0) return null;

	let best: string | null = null;
	let bestScore = -1;

	for (const [domain, count] of counts) {
		const score = count * 2 + (preferKnown.has(domain) ? 1 : 0);
		if (score > bestScore) {
			best = domain;
			bestScore = score;
		}
	}

	return best;
}

export function splitName(
	name: string | null,
	email: string,
): { firstName: string; lastName: string | null } {
	const cleaned = name?.trim().replace(/\s+/g, " ") ?? "";

	if (cleaned && !cleaned.includes("@")) {
		const comma = cleaned.match(/^([^,]+),\s*(.+)$/);
		if (comma?.[1] && comma[2]) {
			return { firstName: comma[2].trim(), lastName: comma[1].trim() };
		}

		const [first, ...rest] = cleaned.split(" ");
		if (first) {
			return {
				firstName: first,
				lastName: rest.length > 0 ? rest.join(" ") : null,
			};
		}
	}

	const local = email.split("@")[0] ?? email;
	const words = local
		.split(/[._-]+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1));

	if (words.length === 0) return { firstName: email, lastName: null };

	return {
		firstName: words[0] as string,
		lastName: words.length > 1 ? words.slice(1).join(" ") : null,
	};
}

function isEmailish(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
