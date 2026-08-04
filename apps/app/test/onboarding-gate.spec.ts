import { afterEach, describe, expect, it } from "bun:test";
import { AUTH_COOKIE_PREFIX } from "@crm/auth/cookies";
import { NextRequest } from "next/server";
import {
	ONBOARDING_COOKIE,
	RESEARCH_COOKIE,
	readOnboardingGate,
	readResearchGate,
} from "../lib/onboarding";
import { proxy } from "../proxy";

const SESSION_COOKIE = `${AUTH_COOKIE_PREFIX}.session_token=abc.def`;

const realFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = realFetch;
});

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

const workspace = (data: { onboarded: boolean; canRename: boolean }) => ({
	result: { data },
});

const researchKey = (configured: boolean) => ({
	result: { data: { configured, hint: configured ? "••••9876" : null } },
});

/** Answers both gate procedures, counting the calls to each. */
function setup({
	onboarded = true,
	canRename = true,
	configured = true,
}: {
	onboarded?: boolean;
	canRename?: boolean;
	configured?: boolean;
} = {}) {
	const calls = { workspace: 0, research: 0 };

	stub(async (url) => {
		if (url.includes("workspace.get")) {
			calls.workspace += 1;
			return json(workspace({ onboarded, canRename }));
		}

		calls.research += 1;
		return json(researchKey(configured));
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

describe("readOnboardingGate", () => {
	it("reads the answer out of a plain tRPC envelope", async () => {
		answerWith(workspace({ onboarded: false, canRename: true }));

		expect(await readOnboardingGate(request("/", [SESSION_COOKIE]))).toBe(
			"required",
		);
	});

	it("settles for someone who could not answer the form anyway", async () => {
		answerWith(workspace({ onboarded: false, canRename: false }));

		expect(await readOnboardingGate(request("/", [SESSION_COOKIE]))).toBe(
			"settled",
		);
	});

	it("is unknown rather than required when the API cannot be read", async () => {
		answerWith({ error: { message: "UNAUTHORIZED" } }, 401);
		expect(await readOnboardingGate(request("/", [SESSION_COOKIE]))).toBe(
			"unknown",
		);

		stub(async () => {
			throw new Error("connect ECONNREFUSED");
		});
		expect(await readOnboardingGate(request("/", [SESSION_COOKIE]))).toBe(
			"unknown",
		);

		answerWith({ result: { data: { nothing: "useful" } } });
		expect(await readOnboardingGate(request("/", [SESSION_COOKIE]))).toBe(
			"unknown",
		);
	});
});

describe("readResearchGate", () => {
	it("is settled once a key is saved, and required until then", async () => {
		answerWith(researchKey(true));
		expect(await readResearchGate(request("/", [SESSION_COOKIE]))).toBe(
			"settled",
		);

		answerWith(researchKey(false));
		expect(await readResearchGate(request("/", [SESSION_COOKIE]))).toBe(
			"required",
		);
	});

	it("is unknown rather than required when the API cannot be read", async () => {
		stub(async () => {
			throw new Error("connect ECONNREFUSED");
		});

		expect(await readResearchGate(request("/", [SESSION_COOKIE]))).toBe(
			"unknown",
		);
	});
});

describe("proxy", () => {
	it("sends a stranger to sign in, and leaves them there", async () => {
		expect(redirectedTo(await proxy(request("/companies")))).toBe("/sign-in");
		expect(redirectedTo(await proxy(request("/sign-in")))).toBeNull();
	});

	it("ignores a neighbour's cookie from the parent domain", async () => {
		expect(AUTH_COOKIE_PREFIX).not.toBe("better-auth");
		setup();

		expect(
			redirectedTo(
				await proxy(
					request("/companies", ["better-auth.session_token=someone.else"]),
				),
			),
		).toBe("/sign-in");
	});

	it("gates a signed-in rep who has not answered the form", async () => {
		setup({ onboarded: false });

		expect(
			redirectedTo(await proxy(request("/companies", [SESSION_COOKIE]))),
		).toBe("/onboarding");
	});

	it("lets the form itself render", async () => {
		setup({ onboarded: false });

		expect(
			redirectedTo(await proxy(request("/onboarding", [SESSION_COOKIE]))),
		).toBeNull();
	});

	it("asks once, then remembers", async () => {
		const calls = setup();

		const first = await proxy(request("/companies", [SESSION_COOKIE]));

		for (const name of [ONBOARDING_COOKIE, RESEARCH_COOKIE]) {
			const marker = first.cookies.get(name);
			expect(marker?.value).toBe("1");
			expect(marker?.httpOnly).toBe(true);
		}

		expect(calls).toEqual({ workspace: 1, research: 1 });

		await proxy(
			request("/companies", [
				SESSION_COOKIE,
				`${ONBOARDING_COOKIE}=1`,
				`${RESEARCH_COOKIE}=1`,
			]),
		);

		expect(calls).toEqual({ workspace: 1, research: 1 });
	});

	it("takes a settled rep off both setup pages", async () => {
		setup();

		expect(
			redirectedTo(await proxy(request("/onboarding", [SESSION_COOKIE]))),
		).toBe("/");

		expect(
			redirectedTo(
				await proxy(request("/onboarding/research", [SESSION_COOKIE])),
			),
		).toBe("/");
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

		const response = await proxy(request("/companies", [SESSION_COOKIE]));

		expect(redirectedTo(response)).toBeNull();
		expect(response.cookies.get(ONBOARDING_COOKIE)).toBeUndefined();
		expect(response.cookies.get(RESEARCH_COOKIE)).toBeUndefined();
	});
});

describe("the research key gate", () => {
	it("sends an onboarded rep with no key to the key form", async () => {
		setup({ configured: false });

		expect(
			redirectedTo(await proxy(request("/companies", [SESSION_COOKIE]))),
		).toBe("/onboarding/research");
	});

	it("lets that form render rather than looping onto itself", async () => {
		setup({ configured: false });

		expect(
			redirectedTo(
				await proxy(request("/onboarding/research", [SESSION_COOKIE])),
			),
		).toBeNull();
	});

	it("asks the first question first", async () => {
		const calls = setup({ onboarded: false, configured: false });

		expect(
			redirectedTo(await proxy(request("/companies", [SESSION_COOKIE]))),
		).toBe("/onboarding");

		expect(calls.research).toBe(0);
	});

	it("does not settle the marker for a rep still being asked", async () => {
		setup({ configured: false });

		const response = await proxy(request("/companies", [SESSION_COOKIE]));

		expect(response.cookies.get(RESEARCH_COOKIE)).toBeUndefined();
	});

	it("remembers the workspace answer even while the key is outstanding", async () => {
		setup({ configured: false });

		const response = await proxy(request("/companies", [SESSION_COOKIE]));

		expect(response.cookies.get(ONBOARDING_COOKIE)?.value).toBe("1");
	});
});
