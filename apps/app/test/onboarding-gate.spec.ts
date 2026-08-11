import { afterEach, describe, expect, it } from "bun:test";
import { AUTH_COOKIE_PREFIX } from "@crm/auth/cookies";
import { NextRequest } from "next/server";
import { readWorkspaceGate } from "../lib/onboarding";
import { proxy } from "../proxy";

const SESSION_COOKIE = `${AUTH_COOKIE_PREFIX}.session_token=abc.def`;

const SLUG = "comp-ai";

const realFetch = globalThis.fetch;

const realMarketing = process.env.IS_MARKETING;

afterEach(() => {
	globalThis.fetch = realFetch;
	marketing(realMarketing);
});

function marketing(value: string | undefined) {
	if (value === undefined) delete process.env.IS_MARKETING;
	else process.env.IS_MARKETING = value;
}

function stub(handler: (url: string) => Promise<Response>) {
	globalThis.fetch = ((input: string | URL | Request) =>
		handler(String(input))) as unknown as typeof fetch;
}

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function answerWith(body: unknown, status = 200) {
	stub(async () => json(body, status));
}

const workspace = (data: {
	onboarded: boolean;
	canRename: boolean;
	slug?: string;
}) => ({ result: { data: { slug: SLUG, ...data } } });

function setup({
	onboarded = true,
	canRename = true,
	slug = SLUG,
}: {
	onboarded?: boolean;
	canRename?: boolean;
	slug?: string;
} = {}) {
	const calls = { workspace: 0 };

	stub(async (url) => {
		if (url.includes("workspace.get")) {
			calls.workspace += 1;
			return json(workspace({ onboarded, canRename, slug }));
		}

		return json({});
	});

	return calls;
}

function request(pathname: string, cookies: string[] = []) {
	return new NextRequest(new URL(pathname, "http://localhost:3000"), {
		headers: cookies.length ? { cookie: cookies.join("; ") } : {},
	});
}

function redirectedTo(response: Response): string | null {
	const location = response.headers.get("location");

	return location ? new URL(location).pathname : null;
}

async function gateOf(pathname: string) {
	return (await readWorkspaceGate(request(pathname, [SESSION_COOKIE]))).gate;
}

describe("readWorkspaceGate", () => {
	it("reads the answer out of a plain tRPC envelope", async () => {
		answerWith(workspace({ onboarded: false, canRename: true }));

		expect(await gateOf("/")).toBe("required");
	});

	it("settles for someone who could not answer the form anyway", async () => {
		answerWith(workspace({ onboarded: false, canRename: false }));

		expect(await gateOf("/")).toBe("settled");
	});

	it("carries the slug the app is served under", async () => {
		answerWith(workspace({ onboarded: true, canRename: true }));

		expect(await readWorkspaceGate(request("/", [SESSION_COOKIE]))).toEqual({
			gate: "settled",
			slug: SLUG,
		});
	});

	it("is unknown rather than required when the API cannot be read", async () => {
		answerWith({ error: { message: "UNAUTHORIZED" } }, 401);
		expect(await gateOf("/")).toBe("unknown");

		stub(async () => {
			throw new Error("connect ECONNREFUSED");
		});
		expect(await gateOf("/")).toBe("unknown");

		answerWith({ result: { data: { nothing: "useful" } } });
		expect(await gateOf("/")).toBe("unknown");
	});
});

describe("proxy", () => {
	it("shows a stranger the landing page and nothing behind it", async () => {
		marketing("true");

		expect(redirectedTo(await proxy(request("/")))).toBeNull();
		expect(redirectedTo(await proxy(request("/sign-in")))).toBeNull();
		expect(redirectedTo(await proxy(request(`/${SLUG}`)))).toBe("/sign-in");
		expect(redirectedTo(await proxy(request(`/${SLUG}/companies`)))).toBe(
			"/sign-in",
		);
	});

	it("sends a stranger to sign in when the install has no landing page", async () => {
		marketing(undefined);

		expect(redirectedTo(await proxy(request("/")))).toBe("/sign-in");
		expect(redirectedTo(await proxy(request("/sign-in")))).toBeNull();
	});

	it("never aims a redirect at the sign-in page itself", async () => {
		marketing(undefined);
		setup({ onboarded: false });

		expect(redirectedTo(await proxy(request("/sign-in")))).toBeNull();
		expect(
			redirectedTo(await proxy(request("/sign-in", [SESSION_COOKIE]))),
		).toBeNull();
		expect(
			redirectedTo(await proxy(request("/sign-in?method=google"))),
		).toBeNull();
	});

	it("reads the flag on every request, and only the literal true turns it on", async () => {
		marketing("false");
		expect(redirectedTo(await proxy(request("/")))).toBe("/sign-in");

		marketing("1");
		expect(redirectedTo(await proxy(request("/")))).toBe("/sign-in");

		marketing("true");
		expect(redirectedTo(await proxy(request("/")))).toBeNull();
	});

	it("ignores a neighbour's cookie from the parent domain", async () => {
		expect(AUTH_COOKIE_PREFIX).not.toBe("better-auth");
		setup();

		expect(
			redirectedTo(
				await proxy(
					request(`/${SLUG}/companies`, [
						"better-auth.session_token=someone.else",
					]),
				),
			),
		).toBe("/sign-in");
	});

	it("gates a signed-in rep who has not answered the form", async () => {
		setup({ onboarded: false });

		expect(
			redirectedTo(
				await proxy(request(`/${SLUG}/companies`, [SESSION_COOKIE])),
			),
		).toBe("/onboarding");
	});

	it("lets the form itself render", async () => {
		setup({ onboarded: false });

		expect(
			redirectedTo(await proxy(request("/onboarding", [SESSION_COOKIE]))),
		).toBeNull();
	});

	it("asks again on every request, and remembers nothing", async () => {
		const calls = setup();

		const first = await proxy(request(`/${SLUG}/companies`, [SESSION_COOKIE]));

		expect([...first.cookies.getAll()]).toHaveLength(0);
		expect(calls).toEqual({ workspace: 1 });

		await proxy(request(`/${SLUG}/companies`, [SESSION_COOKIE]));

		expect(calls).toEqual({ workspace: 2 });
	});

	it("notices when the answer changes underneath it", async () => {
		setup();
		expect(
			redirectedTo(
				await proxy(request(`/${SLUG}/companies`, [SESSION_COOKIE])),
			),
		).toBeNull();

		// A reset database, a removed key: the browser is carrying nothing that
		// could keep saying the gate was satisfied.
		setup({ onboarded: false });
		expect(
			redirectedTo(
				await proxy(request(`/${SLUG}/companies`, [SESSION_COOKIE])),
			),
		).toBe("/onboarding");
	});

	it("takes a settled rep off both setup pages and into the workspace", async () => {
		setup();

		expect(
			redirectedTo(await proxy(request("/onboarding", [SESSION_COOKIE]))),
		).toBe(`/${SLUG}`);

		expect(
			redirectedTo(
				await proxy(request("/onboarding/research", [SESSION_COOKIE])),
			),
		).toBe(`/${SLUG}`);
	});

	it("never fights /grant-access, which would ping-pong forever", async () => {
		setup({ onboarded: false });

		expect(
			redirectedTo(await proxy(request("/grant-access", [SESSION_COOKIE]))),
		).toBeNull();
	});

	it("leaves the agent bridge alone", async () => {
		setup({ onboarded: false });

		expect(
			redirectedTo(await proxy(request("/eve/v1/info", [SESSION_COOKIE]))),
		).toBeNull();
	});

	it("fails open when the API is unreachable", async () => {
		stub(async () => {
			throw new Error("connect ECONNREFUSED");
		});

		const response = await proxy(
			request(`/${SLUG}/companies`, [SESSION_COOKIE]),
		);

		expect(redirectedTo(response)).toBeNull();
	});
});

describe("the slug the app is served under", () => {
	it("sends a signed-in rep off the landing page and into the workspace", async () => {
		setup();

		expect(redirectedTo(await proxy(request("/", [SESSION_COOKIE])))).toBe(
			`/${SLUG}`,
		);
	});

	it("puts the slug on a link that predates it, keeping the query", async () => {
		setup();

		const response = await proxy(
			request("/companies?record=contact:abc", [SESSION_COOKIE]),
		);

		expect(response.headers.get("location")).toBe(
			`http://localhost:3000/${SLUG}/companies?record=contact:abc`,
		);
	});

	it("preserves bare app section deep links when adding the workspace slug", async () => {
		setup();

		const paths = [
			"/calendar",
			"/customers",
			"/instances",
			"/marketing",
			"/prospects",
			"/service",
			"/work",
		];

		for (const path of paths) {
			expect(
				redirectedTo(
					await proxy(request(`${path}?view=mine`, [SESSION_COOKIE])),
				),
			).toBe(`/${SLUG}${path}`);
		}
	});

	it("moves a stale slug onto the current one, keeping the rest", async () => {
		setup();

		expect(
			redirectedTo(
				await proxy(request("/old-name/settings/members", [SESSION_COOKIE])),
			),
		).toBe(`/${SLUG}/settings/members`);
	});

	it("leaves a request that already carries the slug alone", async () => {
		setup();

		expect(
			redirectedTo(
				await proxy(request(`/${SLUG}/settings/sso`, [SESSION_COOKIE])),
			),
		).toBeNull();
	});

	it("rewrites nothing when the API could not say what the slug is", async () => {
		setup({ slug: "" });

		expect(
			redirectedTo(await proxy(request("/companies", [SESSION_COOKIE]))),
		).toBeNull();
	});
});

describe("the research key gate", () => {
	it("lets an onboarded rep work without an optional Context key", async () => {
		setup();

		expect(
			redirectedTo(
				await proxy(request(`/${SLUG}/companies`, [SESSION_COOKIE])),
			),
		).toBeNull();
	});

	it("takes the obsolete key setup page into the workspace", async () => {
		setup();

		expect(
			redirectedTo(
				await proxy(request("/onboarding/research", [SESSION_COOKIE])),
			),
		).toBe(`/${SLUG}`);
	});

	it("still requires the workspace question", async () => {
		setup({ onboarded: false });

		expect(
			redirectedTo(
				await proxy(request(`/${SLUG}/companies`, [SESSION_COOKIE])),
			),
		).toBe("/onboarding");
	});

	it("sends them into the workspace once it is named", async () => {
		setup({ onboarded: true });

		expect(
			redirectedTo(await proxy(request("/onboarding", [SESSION_COOKIE]))),
		).toBe(`/${SLUG}`);
	});
});
