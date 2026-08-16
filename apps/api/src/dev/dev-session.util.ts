import { AUTH_COOKIE_PREFIX } from "@crm/auth/cookies";

export const DEV_SESSION_COOKIE_NAME = `${AUTH_COOKIE_PREFIX}.session_token`;
export const DEV_SESSION_DAYS = 7;

async function signToken(value: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(value),
	);
	return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export async function signDevSessionCookieValue(
	value: string,
	secret: string,
): Promise<string> {
	const signature = await signToken(value, secret);
	return encodeURIComponent(`${value}.${signature}`);
}

export async function verifyDevSessionCookieValue(
	signedValue: string,
	secret: string,
): Promise<string> {
	const decoded = decodeURIComponent(signedValue);
	const separator = decoded.lastIndexOf(".");
	if (separator <= 0) {
		throw new Error("Invalid dev session cookie.");
	}

	const value = decoded.slice(0, separator);
	const providedSignature = decoded.slice(separator + 1);
	const expectedSignature = await signToken(value, secret);

	if (providedSignature !== expectedSignature) {
		throw new Error("Invalid dev session cookie.");
	}

	return value;
}

export function devSessionLoginPath(signedValue: string): string {
	return `/api/dev/session-login?session=${signedValue}`;
}

export function devSessionLoginUrl(
	appUrl: string,
	signedValue: string,
): string {
	return new URL(devSessionLoginPath(signedValue), appUrl).toString();
}
