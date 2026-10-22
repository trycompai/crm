import { DEV_SESSION } from "./dev-session-config";

type DevSessionResponseInput = {
	appUrl: URL;
	cookieName: string;
	cookieValue: string;
};

export function localAppUrl(value?: string): URL {
	const origin = value
		?.split(",")
		.map((candidate) => candidate.trim())
		.find(Boolean);
	return new URL(origin ?? "http://localhost:3000");
}

export function localLoginHost(appUrl: URL): string {
	if (appUrl.hostname === "localhost" || appUrl.hostname === "127.0.0.1") {
		return appUrl.hostname;
	}

	throw new Error("APP_URL must use localhost or 127.0.0.1 for dev:session.");
}

export function createDevSessionResponse({
	appUrl,
	cookieName,
	cookieValue,
}: DevSessionResponseInput): Response {
	const cookie = [
		`${cookieName}=${cookieValue}`,
		"Path=/",
		"HttpOnly",
		"SameSite=Lax",
		`Max-Age=${DEV_SESSION.cookie.maxAgeSeconds}`,
	].join("; ");

	return new Response(null, {
		status: 302,
		headers: {
			location: appUrl.toString(),
			"set-cookie": cookie,
		},
	});
}
