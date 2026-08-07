import {
	auth,
	type MailboxProviderId,
	parseScopes,
	type SignInAccount,
} from "@crm/auth";
import { type Db } from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import {
	GOOGLE_PROVIDER_ID,
	PROVIDER_FOR_SOURCE,
	SCOPE_FOR_SOURCE,
	type SyncSource,
} from "./mailbox.constants";

export type TokenFailure =
	| { outcome: "needs-reconnect"; reason: string }
	| { outcome: "not-connected"; reason: string };

export type TokenResult = { outcome: "ok"; accessToken: string } | TokenFailure;

const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

@Injectable()
export class MailboxTokenService {
	private readonly logger = new Logger(MailboxTokenService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async grantedScopes(
		userId: string,
		providerId: MailboxProviderId,
	): Promise<Set<string>> {
		const account = await this.db.account.findFirst({
			where: { userId, providerId },
			select: { scope: true },
		});

		return parseScopes(account?.scope);
	}

	async isConnected(userId: string, source: SyncSource): Promise<boolean> {
		const scopes = await this.grantedScopes(
			userId,
			PROVIDER_FOR_SOURCE[source],
		);
		return scopes.has(SCOPE_FOR_SOURCE[source]);
	}

	async signInAccounts(userId: string): Promise<SignInAccount[]> {
		return this.db.account.findMany({
			where: { userId },
			select: { providerId: true, scope: true },
		});
	}

	async hasRefreshToken(
		userId: string,
		providerId: MailboxProviderId,
	): Promise<boolean> {
		const account = await this.db.account.findFirst({
			where: { userId, providerId },
			select: { refreshToken: true },
		});

		return Boolean(account?.refreshToken);
	}

	async accessTokenFor(
		userId: string,
		source: SyncSource,
	): Promise<TokenResult> {
		const providerId = PROVIDER_FOR_SOURCE[source];

		if (!(await this.isConnected(userId, source))) {
			return {
				outcome: "not-connected",
				reason: `The ${source} scope has not been granted.`,
			};
		}

		try {
			const { accessToken } = await auth.api.getAccessToken({
				body: { providerId, userId },
			});

			if (!accessToken) {
				return {
					outcome: "needs-reconnect",
					reason: `${label(providerId)} returned no access token.`,
				};
			}

			return { outcome: "ok", accessToken };
		} catch (error) {
			this.logger.warn({
				message: "Mailbox token refresh failed",
				userId,
				providerId,
				source,
				reason: error instanceof Error ? error.message : String(error),
			});

			return {
				outcome: "needs-reconnect",
				reason: `${label(providerId)} would not refresh the access token.`,
			};
		}
	}

	async revoke(
		userId: string,
		providerId: MailboxProviderId,
	): Promise<boolean> {
		if (
			providerId === GOOGLE_PROVIDER_ID &&
			!(await this.revokeWithGoogle(userId))
		) {
			return false;
		}

		const cleared = await this.db.account.updateMany({
			where: { userId, providerId },
			data: {
				accessToken: null,
				refreshToken: null,
				scope: null,
				accessTokenExpiresAt: null,
				refreshTokenExpiresAt: null,
			},
		});

		if (cleared.count === 0) return false;

		this.logger.log({ message: "Mailbox access revoked", userId, providerId });
		return true;
	}

	private async revokeWithGoogle(userId: string): Promise<boolean> {
		const account = await this.db.account.findFirst({
			where: { userId, providerId: GOOGLE_PROVIDER_ID },
			select: { refreshToken: true, accessToken: true },
		});

		const token = account?.refreshToken ?? account?.accessToken;
		if (!token) return true;

		const response = await fetch(GOOGLE_REVOKE_URL, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ token }),
		});

		if (response.ok) return true;

		this.logger.warn({
			message: "Google token revocation failed",
			userId,
			status: response.status,
		});

		return false;
	}
}

function label(providerId: MailboxProviderId): string {
	return providerId === GOOGLE_PROVIDER_ID ? "Google" : "Microsoft";
}
