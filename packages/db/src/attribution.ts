export const COOKIE_FIRST_TOUCH = "_crm_fs";

export const MEDIUMS = [
	"organic",
	"social",
	"referral",
	"email",
	"cpc",
	"direct",
	"other",
] as const;

export type Medium = (typeof MEDIUMS)[number];

export interface RawTouch {
	source?: string;
	medium?: string;
	campaign?: string;
	term?: string;
	content?: string;
	referrer?: string;
	landing?: string;
	at?: number;
}

export interface Touch {
	source: string;
	medium: Medium;
	campaign: string | null;
	term: string | null;
	content: string | null;
	referrer: string | null;
	landing: string | null;
	at: Date;
}

const SEARCH: Record<string, string> = {
	"google.": "Google",
	"bing.": "Bing",
	"duckduckgo.": "DuckDuckGo",
	"yahoo.": "Yahoo",
	"baidu.": "Baidu",
	"yandex.": "Yandex",
	"ecosia.": "Ecosia",
	"startpage.": "Startpage",
	"search.brave.": "Brave Search",
};

const SOCIAL: Record<string, string> = {
	"linkedin.": "LinkedIn",
	"lnkd.in": "LinkedIn",
	"twitter.": "X",
	"x.com": "X",
	"t.co": "X",
	"facebook.": "Facebook",
	"fb.com": "Facebook",
	"instagram.": "Instagram",
	"youtube.": "YouTube",
	"youtu.be": "YouTube",
	"reddit.": "Reddit",
	"tiktok.": "TikTok",
	"news.ycombinator.": "Hacker News",
	"producthunt.": "Product Hunt",
	"github.": "GitHub",
	"slack.": "Slack",
};

const MAIL: Record<string, string> = {
	"mail.google.": "Gmail",
	"outlook.": "Outlook",
	"mail.yahoo.": "Yahoo Mail",
};

const SECOND_LEVEL = new Set([
	"co",
	"com",
	"net",
	"org",
	"gov",
	"edu",
	"ac",
	"or",
	"ne",
]);

const PAID_MEDIUMS = new Set([
	"cpc",
	"ppc",
	"paid",
	"paidsearch",
	"paid_search",
]);

const MAX = 120;

export function classifyTouch(raw: RawTouch, at: Date = new Date()): Touch {
	const when = raw.at ? new Date(raw.at) : at;
	const campaign = clean(raw.campaign);
	const term = clean(raw.term);
	const content = clean(raw.content);
	const referrer = clean(raw.referrer);
	const landing = clean(raw.landing);

	const utmSource = clean(raw.source);
	const utmMedium = clean(raw.medium)?.toLowerCase();

	if (utmSource) {
		return {
			source: utmSource,
			medium: mediumFrom(utmMedium),
			campaign,
			term,
			content,
			referrer,
			landing,
			at: valid(when) ? when : at,
		};
	}

	const host = hostOf(referrer);

	if (!host) {
		return {
			source: "Direct",
			medium: "direct",
			campaign,
			term,
			content,
			referrer: null,
			landing,
			at: valid(when) ? when : at,
		};
	}

	const mail = match(host, MAIL);
	const search = mail ? null : match(host, SEARCH);
	const social = mail || search ? null : match(host, SOCIAL);

	const medium: Medium = mail
		? "email"
		: search
			? "organic"
			: social
				? "social"
				: "referral";

	return {
		source: mail ?? search ?? social ?? host,
		medium: utmMedium ? mediumFrom(utmMedium) : medium,
		campaign,
		term,
		content,
		referrer,
		landing,
		at: valid(when) ? when : at,
	};
}

export function isSameTouch(a: Touch, b: Touch): boolean {
	return (
		a.source === b.source &&
		a.medium === b.medium &&
		(a.campaign ?? "") === (b.campaign ?? "")
	);
}

export function describeTouch(touch: {
	source: string | null;
	medium: string | null;
	campaign: string | null;
}): string {
	if (!touch.source) return "Unknown";

	const medium =
		touch.medium && touch.medium !== "direct" ? touch.medium : null;
	const parts = [touch.source, medium, touch.campaign].filter(Boolean);

	return parts.join(" · ");
}

function mediumFrom(value: string | null | undefined): Medium {
	if (!value) return "other";
	if (PAID_MEDIUMS.has(value)) return "cpc";
	if ((MEDIUMS as readonly string[]).includes(value)) return value as Medium;
	if (value.includes("mail")) return "email";
	if (value.includes("social")) return "social";
	if (value.includes("organic")) return "organic";

	return "other";
}

function match(host: string, table: Record<string, string>): string | null {
	const labels = host.split(".");

	for (const [needle, name] of Object.entries(table)) {
		if (matches(labels, needle)) return name;
	}

	return null;
}

function matches(labels: string[], needle: string): boolean {
	const open = needle.endsWith(".");
	const wanted = (open ? needle.slice(0, -1) : needle).split(".");

	for (let start = 0; start + wanted.length <= labels.length; start += 1) {
		if (wanted.some((label, index) => labels[start + index] !== label))
			continue;

		const tail = labels.slice(start + wanted.length);

		if (open ? isSuffix(tail) : tail.length === 0) return true;
	}

	return false;
}

function isSuffix(tail: string[]): boolean {
	if (tail.length === 1) return true;
	if (tail.length !== 2) return false;

	return SECOND_LEVEL.has(tail[0] ?? "") && /^[a-z]{2}$/.test(tail[1] ?? "");
}

function hostOf(referrer: string | null): string | null {
	if (!referrer) return null;

	try {
		return new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
	} catch {
		return null;
	}
}

function clean(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;

	return trimmed.length > MAX ? trimmed.slice(0, MAX) : trimmed;
}

function valid(date: Date): boolean {
	return !Number.isNaN(date.getTime());
}
