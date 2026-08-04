export function normalizeDomain(
	input: string | null | undefined,
): string | null {
	const trimmed = input?.trim().toLowerCase();
	if (!trimmed) return null;

	const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed)
		? trimmed
		: `https://${trimmed}`;

	let host: string;
	try {
		host = new URL(withScheme).hostname;
	} catch {
		return null;
	}

	const bare = host.replace(/^www\./, "");

	return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(bare) ? bare : null;
}

export function domainFromEmail(
	email: string | null | undefined,
): string | null {
	const at = email?.trim().toLowerCase().lastIndexOf("@") ?? -1;
	if (at < 1) return null;
	const domain = normalizeDomain(email?.slice(at + 1));
	if (!domain) return null;
	return FREE_EMAIL_DOMAINS.has(domain) || isMachineDomain(domain)
		? null
		: domain;
}

export function isMachineDomain(input: string | null | undefined): boolean {
	const domain = normalizeDomain(input);
	if (!domain) return false;

	return (
		MACHINE_DOMAINS.has(domain) ||
		MACHINE_SUFFIXES.some((suffix) => domain.endsWith(suffix))
	);
}

const FREE_EMAIL_DOMAINS = new Set([
	"gmail.com",
	"googlemail.com",
	"yahoo.com",
	"yahoo.co.uk",
	"hotmail.com",
	"hotmail.co.uk",
	"outlook.com",
	"live.com",
	"msn.com",
	"icloud.com",
	"me.com",
	"mac.com",
	"aol.com",
	"proton.me",
	"protonmail.com",
	"gmx.com",
	"gmx.de",
	"mail.com",
	"yandex.ru",
	"qq.com",
	"163.com",
]);

const MACHINE_DOMAINS = new Set([
	"calendar.google.com",
	"googlegroups.com",
	"docs.google.com",
	"drive.google.com",
	"appspotmail.com",
	"amazonses.com",
	"sendgrid.net",
	"zoomcrc.com",
]);

const MACHINE_SUFFIXES = [
	".calendar.google.com",
	".bounces.google.com",
	".appspotmail.com",
	".amazonses.com",
	".sendgrid.net",
	".invalid",
	".local",
	".localhost",
];
