import { AUTH_COOKIE_PREFIX } from "@crm/auth/cookies";
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { isMarketing } from "@/lib/env";
import {
	ONBOARDING_PATH,
	RESEARCH_PATH,
	readWorkspaceGate,
} from "@/lib/onboarding";
import { workspaceUrl } from "@/lib/workspace-url";

const LANDING_PATH = "/";

const SIGN_IN_PATH = "/sign-in";

const UNGATED = ["/grant-access", "/eve"];

const SECTIONS = [
	"/companies",
	"/contacts",
	"/deals",
	"/instances",
	"/marketing",
	"/settings",
];

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	if (pathname === SIGN_IN_PATH) return NextResponse.next();

	if (
		getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX }) === null
	) {
		return isPublic(pathname)
			? NextResponse.next()
			: NextResponse.redirect(new URL(SIGN_IN_PATH, request.nextUrl));
	}

	if (isUngated(pathname)) return NextResponse.next();

	const workspace = await readWorkspaceGate(request);

	if (workspace.gate === "required") return sendTo(ONBOARDING_PATH, request);

	const settled = workspace.gate === "settled";

	if (!settled || !workspace.slug) return NextResponse.next();

	return sendTo(appPath(pathname, workspace.slug), request);
}

function appPath(pathname: string, slug: string): string {
	if (pathname === LANDING_PATH || isSetup(pathname)) {
		return workspaceUrl(slug);
	}

	if (SECTIONS.some((section) => isUnder(pathname, section))) {
		return workspaceUrl(slug, pathname);
	}

	const [first, ...rest] = pathname.slice(1).split("/");

	if (first === slug) return pathname;

	return workspaceUrl(slug, rest.length ? `/${rest.join("/")}` : "/");
}

function isUnder(pathname: string, prefix: string): boolean {
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isPublic(pathname: string): boolean {
	return pathname === LANDING_PATH && isMarketing();
}

function isUngated(pathname: string): boolean {
	return UNGATED.some((prefix) => isUnder(pathname, prefix));
}

function isSetup(pathname: string): boolean {
	return pathname === ONBOARDING_PATH || pathname === RESEARCH_PATH;
}

function sendTo(path: string, request: NextRequest): NextResponse {
	if (request.nextUrl.pathname === path) return NextResponse.next();

	const url = new URL(path, request.nextUrl);
	url.search = request.nextUrl.search;

	return NextResponse.redirect(url);
}

export const config = {
	matcher: [
		"/((?!api|_next/static|_next/image|.*\\.(?:ico|png|svg|jpg|jpeg|gif|webp|webmanifest)$).*)",
	],
};
