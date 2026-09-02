import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { db } from "@crm/db";
import { workspaceSlug } from "@crm/db/workspace";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { applySetCookies } from "better-auth/cookies";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import * as z from "zod";
import {
	DEFAULT_WORKSPACE_NAME,
	WORKSPACE_ID,
	type WorkspaceRole,
} from "../src/organization";
import { GOOGLE_PROVIDER_ID, SLACK_PROVIDER_ID } from "../src/scopes";
import { slackConnectGuard } from "../src/slack-connect";

const suffix = process.env.TEST_RUN_ID ?? "slack-connect-spec";

const EMAIL_SUFFIX = `.slack-connect.${suffix}@example.test`;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const BASE_URL = "http://localhost:3001";
const JSON_HEADERS = { "content-type": "application/json" };

const provider = (providerId: string) => ({
	providerId,
	authorizationUrl: `https://${providerId}.example.test/authorize`,
	tokenUrl: `https://${providerId}.example.test/token`,
	userInfoUrl: `https://${providerId}.example.test/userinfo`,
	clientId: `${providerId}-client`,
	clientSecret: `${providerId}-secret`,
	getToken: async () => {
		throw new APIError("BAD_REQUEST", { message: "Token exchange reached." });
	},
});

const guarded = betterAuth({
	baseURL: BASE_URL,
	secret: "slack-connect-spec-secret",
	database: prismaAdapter(db, { provider: "postgresql" }),
	emailAndPassword: { enabled: false },
	account: { skipStateCookieCheck: true },
	hooks: { before: slackConnectGuard },
	plugins: [
		genericOAuth({
			config: [provider(SLACK_PROVIDER_ID), provider(GOOGLE_PROVIDER_ID)],
		}),
	],
});

const authorization = z.object({ url: z.string().url() });
const refusal = z.object({ message: z.string() });

type Snapshot = {
	organization: {
		name: string;
		slug: string;
		website: string | null;
		metadata: string | null;
	} | null;
	members: { id: string; userId: string; role: string; createdAt: Date }[];
};

let snapshot: Snapshot;

const idOf = (label: string) => `slack-connect-${suffix}-${label}`;

const sessionCookie = async (userId: string): Promise<string> => {
	const context = await guarded.$context;
	const token = idOf(`${userId}-token`);

	await db.session.create({
		data: {
			id: idOf(`${userId}-session`),
			token,
			userId,
			expiresAt: new Date(Date.now() + SESSION_MS),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});

	const cookie = context.authCookies.sessionToken;
	const serialize = createAuthMiddleware(async (ctx) =>
		ctx.setSignedCookie(cookie.name, token, context.secret, cookie.attributes),
	);

	const headers = new Headers();
	applySetCookies(headers, [await serialize({ headers: new Headers() })]);

	return headers.get("cookie") ?? "";
};

const seat = async (
	label: string,
	role: WorkspaceRole | null,
): Promise<string> => {
	const now = new Date();

	const user = await db.user.create({
		data: {
			id: idOf(label),
			name: label,
			email: `${label}${EMAIL_SUFFIX}`,
			createdAt: now,
			updatedAt: now,
		},
		select: { id: true },
	});

	if (role) {
		await db.member.create({
			data: {
				id: idOf(`${label}-member`),
				organizationId: WORKSPACE_ID,
				userId: user.id,
				role,
				createdAt: now,
			},
		});
	}

	return sessionCookie(user.id);
};

const startConnect = (
	path: string,
	cookie?: string,
	providerId: string = SLACK_PROVIDER_ID,
) =>
	guarded.handler(
		new Request(`${BASE_URL}/api/auth${path}`, {
			method: "POST",
			headers: cookie ? { ...JSON_HEADERS, cookie } : JSON_HEADERS,
			body: JSON.stringify({ provider: providerId, callbackURL: "/" }),
		}),
	);

const linkSlack = (cookie?: string) => startConnect("/link-social", cookie);

const completeCallback = (
	state: string,
	cookie?: string,
	providerId: string = SLACK_PROVIDER_ID,
) =>
	guarded.handler(
		new Request(
			`${BASE_URL}/api/auth/callback/${providerId}?code=test-code&state=${state}`,
			{ headers: cookie ? { cookie } : undefined },
		),
	);

const linkTransaction = async (
	cookie: string,
	providerId: string = SLACK_PROVIDER_ID,
): Promise<{ state: string; cookie: string }> => {
	const state = `slack-connect-state-${crypto.randomUUID()}`;
	await db.verification.create({
		data: {
			id: state,
			identifier: state,
			value: JSON.stringify({
				callbackURL: "/",
				codeVerifier: "slack-connect-code-verifier",
				expiresAt: Date.now() + 60_000,
				link: { email: `${providerId}@example.test`, userId: providerId },
			}),
			expiresAt: new Date(Date.now() + 60_000),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
	return { state, cookie };
};

const completeLink = async (startCookie: string, keepCallbackCookie = true) => {
	const transaction = await linkTransaction(startCookie);
	return completeCallback(
		transaction.state,
		keepCallbackCookie ? transaction.cookie : undefined,
	);
};

const messageOf = async (response: Response): Promise<string> =>
	refusal.parse(await response.json()).message;

const arrived = async (response: Response): Promise<boolean> =>
	authorization.safeParse(await response.json()).success;

const clear = async () => {
	await db.verification.deleteMany({
		where: { identifier: { startsWith: "slack-connect-state-" } },
	});
	await db.member.deleteMany({ where: { organizationId: WORKSPACE_ID } });
	await db.organization.deleteMany({ where: { id: WORKSPACE_ID } });
	await db.user.deleteMany({ where: { email: { endsWith: EMAIL_SUFFIX } } });
};

beforeAll(async () => {
	const organization = await db.organization.findUnique({
		where: { id: WORKSPACE_ID },
		select: { name: true, slug: true, website: true, metadata: true },
	});

	snapshot = {
		organization,
		members: await db.member.findMany({
			where: { organizationId: WORKSPACE_ID },
			select: { id: true, userId: true, role: true, createdAt: true },
		}),
	};
});

beforeEach(async () => {
	await clear();

	await db.organization.create({
		data: {
			id: WORKSPACE_ID,
			name: DEFAULT_WORKSPACE_NAME,
			slug: workspaceSlug(DEFAULT_WORKSPACE_NAME),
			createdAt: new Date(),
		},
	});
});

afterAll(async () => {
	await clear();

	if (snapshot.organization) {
		await db.organization.create({
			data: {
				id: WORKSPACE_ID,
				createdAt: new Date(),
				...snapshot.organization,
			},
		});

		await db.member.createMany({
			data: snapshot.members.map((member) => ({
				...member,
				organizationId: WORKSPACE_ID,
			})),
		});
	}
});

describe("Slack linking callback authorization", () => {
	it("turns away a linking browser after its session ends", async () => {
		const cookie = await seat("lead", "admin");
		const response = await completeLink(cookie, false);

		expect(response.status).toBe(401);
		expect(await messageOf(response)).toContain("Sign in to the CRM");
	});

	it("turns away an admin who became a member", async () => {
		const cookie = await seat("lead", "admin");
		const transaction = await linkTransaction(cookie);
		await db.member.update({
			where: { id: idOf("lead-member") },
			data: { role: "member" },
		});
		await seat("owner", "owner");
		const response = await completeCallback(
			transaction.state,
			transaction.cookie,
		);

		expect(response.status).toBe(403);
		expect(await messageOf(response)).toContain("Only an owner or an admin");
	});

	it("turns away an admin removed from the workspace", async () => {
		const cookie = await seat("lead", "admin");
		const transaction = await linkTransaction(cookie);
		await db.member.delete({ where: { id: idOf("lead-member") } });
		const response = await completeCallback(
			transaction.state,
			transaction.cookie,
		);

		expect(response.status).toBe(403);
		expect(await messageOf(response)).toContain("member of this workspace");
	});

	it("lets an admin reach token exchange", async () => {
		const cookie = await seat("lead", "admin");
		const response = await completeLink(cookie);

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toContain("error=invalid_code");
	});

	it("lets an owner reach token exchange", async () => {
		const cookie = await seat("founder", "owner");
		const response = await completeLink(cookie);

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toContain("error=invalid_code");
	});

	it("lets a member reach token exchange without a workspace manager", async () => {
		const cookie = await seat("rep", "member");
		await seat("other", "member");

		const response = await completeLink(cookie);

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toContain("error=invalid_code");
	});
});

describe("Slack connection starts", () => {
	it("turns away a member who asks to link Slack", async () => {
		await seat("owner", "owner");
		const response = await linkSlack(await seat("rep", "member"));

		expect(response.status).toBe(403);
	});

	it("lets a browser with no session ask to sign in with Slack", async () => {
		await seat("owner", "owner");
		const response = await startConnect("/sign-in/social");

		expect(response.status).toBe(200);
		expect(await arrived(response)).toBe(true);
	});

	it("turns away a browser with no session", async () => {
		await seat("owner", "owner");
		const response = await linkSlack();

		expect(response.status).toBe(401);
	});

	it("lets an admin ask to link Slack", async () => {
		const response = await linkSlack(await seat("lead", "admin"));

		expect(response.status).toBe(200);
		expect(await arrived(response)).toBe(true);
	});
});

describe("every provider that is not Slack", () => {
	it("lets a member link Google", async () => {
		await seat("owner", "owner");
		const response = await startConnect(
			"/link-social",
			await seat("rep", "member"),
			GOOGLE_PROVIDER_ID,
		);

		expect(response.status).toBe(200);
		expect(await arrived(response)).toBe(true);
	});

	it("lets the Google callback through with no session at all", async () => {
		const response = await completeCallback(
			"test-state",
			undefined,
			GOOGLE_PROVIDER_ID,
		);

		expect(response.status).toBe(302);
	});

	it("lets a Slack sign-in callback through with no session", async () => {
		const state = `slack-connect-state-${crypto.randomUUID()}`;
		await db.verification.create({
			data: {
				id: state,
				identifier: state,
				value: JSON.stringify({
					callbackURL: "/",
					codeVerifier: "slack-sign-in-code-verifier",
					expiresAt: Date.now() + 60_000,
				}),
				expiresAt: new Date(Date.now() + 60_000),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		const response = await completeCallback(state);

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toContain("error=invalid_code");
	});
});
