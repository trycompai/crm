import { resolvesToPublicHost } from "@crm/db/safe-fetch";
import { EMAIL_REVIEW } from "./email-review-config";

export type RequestVerdict =
	| { allowed: true }
	| { allowed: false; reason: string };

export function ownOrigins(): string[] {
	const origins: string[] = [];

	for (const variable of EMAIL_REVIEW.requests.ownOriginVariables) {
		const value = process.env[variable]?.trim();
		if (!value) continue;

		try {
			origins.push(new URL(value).origin);
		} catch {}
	}

	return origins;
}

export async function requestVerdict(
	url: string,
	allowedOrigins: readonly string[],
): Promise<RequestVerdict> {
	if (url === "about:blank" || url.startsWith("data:"))
		return { allowed: true };

	let target: URL;

	try {
		target = new URL(url);
	} catch {
		return { allowed: false, reason: "that address cannot be read" };
	}

	if (target.protocol !== "http:" && target.protocol !== "https:") {
		return {
			allowed: false,
			reason: `${target.protocol.replace(":", "")} addresses are not fetched`,
		};
	}

	if (allowedOrigins.includes(target.origin)) return { allowed: true };

	const isPublic = await resolvesToPublicHost(
		target.hostname,
		EMAIL_REVIEW.requests.dnsTimeoutMs,
	);

	if (!isPublic) {
		return {
			allowed: false,
			reason: `${target.host} is not a public address`,
		};
	}

	return { allowed: true };
}
