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
import {
	callbackOAuth,
	createAuthMiddleware,
	linkSocialAccount,
	signInSocial,
} from "better-auth/api";
import { applySetCookies } from "better-auth/cookies";
import * as z from "zod";
import {
	DEFAULT_WORKSPACE_NAME,
	WORKSPACE_ID,
	type WorkspaceRole,
} from "../src/organization";
import { GOOGLE_PROVIDER_ID, SLACK_PROVIDER_ID } from "../src/scopes";
import { slackConnectGuard } from "../src/slack-connect";
import { slackOAuthCallback } from "../src/slack-oauth-callback";

const suffix = process.env.TEST_RUN_ID ?? "slack-connect-spec";

const EMAIL_SUFFIX = `.slack-connect.${suffix}@example.test`;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const BASE_URL = "http://localhost:3001";
const JSON_HEADERS = { "content-type": "application/json" };

const reached = { reached: true };

const guarded = betterAuth({
	baseURL: BASE_URL,
	secret: "slack-connect-spec-secret",
	database: prismaAdapter(db, { provider: "postgresql" }),
	emailAndPassword: { enabled: false },
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			await slackConnectGuard(ctx);
			if (
				ctx.path === "/link-social" ||
				ctx.path === "/sign-in/social" ||
				ctx.path.startsWith("/callback/")
			) {
				return ctx.json(reached);
			}
		}),
	},
	plugins: [slackOAuthCallback],
});

const arrival = z.object({ reached: z.literal(true) });
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

const completeConnect = (
	cookie?: string,
	providerId: string = SLACK_PROVIDER_ID,
) =>
	guarded.handler(
		new Request(
			`${BASE_URL}/api/auth/callback/${providerId}?code=test-code&state=test-state`,
			{ headers: cookie ? { cookie } : undefined },
		),
	);

const messageOf = async (response: Response): Promise<string> =>
	refusal.parse(await response.json()).message;

const arrived = async (response: Response): Promise<boolean> =>
	arrival.safeParse(await response.json()).success;

const clear = async () => {
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

describe("the Slack callback that writes the connection", () => {
	it("turns away a browser with no session", async () => {
		const response = await completeConnect();

		expect(response.status).toBe(401);
		expect(await messageOf(response)).toContain("Sign in to the CRM");
	});

	it("turns away a member", async () => {
		await seat("owner", "owner");
		const response = await completeConnect(await seat("rep", "member"));

		expect(response.status).toBe(403);
		expect(await messageOf(response)).toContain("Only an owner or an admin");
	});

	it("turns away someone signed in who is not in this workspace", async () => {
		await seat("owner", "owner");
		const response = await completeConnect(await seat("stranger", null));

		expect(response.status).toBe(403);
		expect(await messageOf(response)).toContain("member of this workspace");
	});

	it("lets an admin finish", async () => {
		const response = await completeConnect(await seat("lead", "admin"));

		expect(response.status).toBe(200);
		expect(await arrived(response)).toBe(true);
	});

	it("lets an owner finish", async () => {
		const response = await completeConnect(await seat("founder", "owner"));

		expect(response.status).toBe(200);
		expect(await arrived(response)).toBe(true);
	});

	it("lets a member finish when the workspace has no owner and no admin", async () => {
		const cookie = await seat("rep", "member");
		await seat("other", "member");

		const response = await completeConnect(cookie);

		expect(response.status).toBe(200);
		expect(await arrived(response)).toBe(true);
	});
});

describe("the two paths that start a Slack connection", () => {
	it("turns away a member who asks to link Slack", async () => {
		await seat("owner", "owner");
		const response = await linkSlack(await seat("rep", "member"));

		expect(response.status).toBe(403);
	});

	it("turns away a member who asks to sign in with Slack", async () => {
		await seat("owner", "owner");
		const response = await startConnect(
			"/sign-in/social",
			await seat("rep", "member"),
		);

		expect(response.status).toBe(403);
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
		const response = await completeConnect(undefined, GOOGLE_PROVIDER_ID);

		expect(response.status).toBe(200);
		expect(await arrived(response)).toBe(true);
	});
});

describe("the paths the guard has to know about", () => {
	it("matches the shared social OAuth endpoints", () => {
		const paths = [callbackOAuth, linkSocialAccount, signInSocial()]
			.map((endpoint) => endpoint.path)
			.sort();

		expect(paths).toEqual(["/callback/:id", "/link-social", "/sign-in/social"]);
	});
});

describe("registered Slack callback", () => {
	it("keeps the existing callback URL and passes its state to the guarded endpoint", async () => {
		const response = await guarded.handler(
			new Request(
				`${BASE_URL}/api/auth/oauth2/callback/slack?code=callback-code&state=callback-state`,
			),
		);
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			`${BASE_URL}/api/auth/callback/slack?code=callback-code&state=callback-state`,
		);
	});
});
