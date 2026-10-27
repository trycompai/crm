import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { auth } from "@crm/auth/auth";
import { GOOGLE_PROVIDER_ID, SYNC_SCOPES } from "@crm/auth/scopes";
import { db } from "@crm/db";
import { MailboxTokenService } from "../src/mailbox/mailbox-token.service";

const userId = `mailbox-token-${crypto.randomUUID()}`;
const accountId = `mailbox-account-${crypto.randomUUID()}`;
const service = new MailboxTokenService(db);

const accessTokenSpy = () =>
	spyOn(auth.api, "getAccessToken").mockResolvedValue({
		accessToken: "test-mailbox-access-token",
		accessTokenExpiresAt: undefined,
		scopes: [...SYNC_SCOPES],
		idToken: undefined,
	});

let getAccessToken: ReturnType<typeof accessTokenSpy>;

beforeEach(async () => {
	await db.user.create({
		data: {
			id: userId,
			name: "Mailbox token test",
			email: `${userId}@example.test`,
		},
	});
	getAccessToken = accessTokenSpy();
});

afterEach(async () => {
	getAccessToken.mockRestore();
	await db.user.delete({ where: { id: userId } });
});

async function grant(scope: string) {
	await db.account.create({
		data: {
			id: accountId,
			userId,
			providerId: GOOGLE_PROVIDER_ID,
			accountId: "provider-subject-differs-from-local-account-id",
			scope,
		},
	});
}

describe("mailbox token account selection", () => {
	it("uses the local account ID for Better Auth token refresh", async () => {
		await grant(SYNC_SCOPES.join(" "));
		expect(await service.accessTokenFor(userId, "gmail")).toEqual({
			outcome: "ok",
			accessToken: "test-mailbox-access-token",
		});
		expect(getAccessToken).toHaveBeenCalledTimes(1);
		expect(getAccessToken).toHaveBeenCalledWith({
			body: { accountId, userId },
		});
	});

	it("does not request a token without an account", async () => {
		expect(await service.accessTokenFor(userId, "gmail")).toMatchObject({
			outcome: "not-connected",
		});
		expect(getAccessToken).not.toHaveBeenCalled();
	});

	it("does not request a token without the mailbox scope", async () => {
		await grant("openid email");
		expect(await service.accessTokenFor(userId, "gmail")).toMatchObject({
			outcome: "not-connected",
		});
		expect(getAccessToken).not.toHaveBeenCalled();
	});
});
