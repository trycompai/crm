import { AUTH_COOKIE_PREFIX } from "@crm/auth/cookies";
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import {
	type Gate,
	ONBOARDING_COOKIE,
	ONBOARDING_PATH,
	RESEARCH_COOKIE,
	RESEARCH_PATH,
	readOnboardingGate,
	readResearchGate,
	settle,
} from "@/lib/onboarding";

const SIGN_IN_PATH = "/sign-in";

const UNGATED = [SIGN_IN_PATH, "/grant-access", "/eve"];

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	if (
		getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX }) === null
	) {
		return pathname === SIGN_IN_PATH
			? NextResponse.next()
			: NextResponse.redirect(new URL(SIGN_IN_PATH, request.nextUrl));
	}

	if (isUngated(pathname)) return NextResponse.next();

	const onboarding = request.cookies.has(ONBOARDING_COOKIE)
		? "settled"
		: await readOnboardingGate(request);

	const settled = onboarding === "settled" ? [ONBOARDING_COOKIE] : [];

	if (onboarding === "required") {
		return remember(request, sendTo(ONBOARDING_PATH, request), ...settled);
	}

	const research = request.cookies.has(RESEARCH_COOKIE)
		? "settled"
		: await readResearchGate(request);

	if (research === "required") {
		return remember(request, sendTo(RESEARCH_PATH, request), ...settled);
	}

	if (research === "settled") settled.push(RESEARCH_COOKIE);

	return remember(request, past(request, onboarding, research), ...settled);
}

function isUngated(pathname: string): boolean {
	return UNGATED.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}

function home(request: NextRequest): NextResponse {
	return NextResponse.redirect(new URL("/", request.nextUrl));
}

function sendTo(path: string, request: NextRequest): NextResponse {
	return request.nextUrl.pathname === path
		? NextResponse.next()
		: NextResponse.redirect(new URL(path, request.nextUrl));
}

function past(
	request: NextRequest,
	onboarding: Gate,
	research: Gate,
): NextResponse {
	const done = onboarding === "settled" && research === "settled";

	const setup =
		request.nextUrl.pathname === ONBOARDING_PATH ||
		request.nextUrl.pathname === RESEARCH_PATH;

	return done && setup ? home(request) : NextResponse.next();
}

function remember(
	request: NextRequest,
	response: NextResponse,
	...cookies: string[]
): NextResponse {
	for (const name of cookies) settle(request, response, name);

	return response;
}

export const config = {
	matcher: [
		"/((?!api|_next/static|_next/image|.*\\.(?:ico|png|svg|jpg|jpeg|gif|webp|webmanifest)$).*)",
	],
};
