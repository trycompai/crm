import { auth, type SignInAccount } from "@crm/auth";
import { type Db } from "@crm/db";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import {
	GOOGLE_PROVIDER_ID,
	SCOPE_FOR_SOURCE,
	type SyncSource,
} from "./google.constants";

export type TokenFailure =
	| { outcome: "needs-reconnect"; reason: string }
	| { outcome: "not-connected"; reason: string };

export type TokenResult = { outcome: "ok"; accessToken: string } | TokenFailure;

@Injectable()
export class GoogleTokenService {
	private readonly logger = new Logger(GoogleTokenService.name);

	constructor(@InjectDatabase() private readonly db: Db) {}

	async grantedScopes(userId: string): Promise<string[]> {
		const account = await this.db.account.findFirst({
			where: { userId, providerId: GOOGLE_PROVIDER_ID },
			select: { scope: true },
		});

		return (
			account?.scope
				?.split(",")
				.map((scope) => scope.trim())
				.filter(Boolean) ?? []
		);
	}

	async isConnected(userId: string, source: SyncSource): Promise<boolean> {
		const scopes = await this.grantedScopes(userId);
		return scopes.includes(SCOPE_FOR_SOURCE[source]);
	}

	async signInAccounts(userId: string): Promise<SignInAccount[]> {
		return this.db.account.findMany({
			where: { userId },
			select: { providerId: true, scope: true },
		});
	}

	async hasRefreshToken(userId: string): Promise<boolean> {
		const account = await this.db.account.findFirst({
			where: { userId, providerId: GOOGLE_PROVIDER_ID },
			select: { refreshToken: true },
		});

		return Boolean(account?.refreshToken);
	}

	async accessTokenFor(
		userId: string,
		source: SyncSource,
	): Promise<TokenResult> {
		if (!(await this.isConnected(userId, source))) {
			return {
				outcome: "not-connected",
				reason: `The ${source} scope has not been granted.`,
			};
		}

		try {
			const { accessToken } = await auth.api.getAccessToken({
				body: { providerId: GOOGLE_PROVIDER_ID, userId },
			});

			if (!accessToken) {
				return {
					outcome: "needs-reconnect",
					reason: "Google returned no access token.",
				};
			}

			return { outcome: "ok", accessToken };
		} catch (error) {
			this.logger.warn({
				message: "Google token refresh failed",
				userId,
				source,
				reason: error instanceof Error ? error.message : String(error),
			});

			return {
				outcome: "needs-reconnect",
				reason: "Google would not refresh the access token.",
			};
		}
	}

	async accessTokenWithScope(
		userId: string,
		scope: string,
		label: string,
	): Promise<TokenResult> {
		const scopes = await this.grantedScopes(userId);
		if (!scopes.includes(scope)) {
			return {
				outcome: "not-connected",
				reason: `The ${label} scope has not been granted.`,
			};
		}
		try {
			const { accessToken } = await auth.api.getAccessToken({
				body: { providerId: GOOGLE_PROVIDER_ID, userId },
			});
			return accessToken
				? { outcome: "ok", accessToken }
				: {
						outcome: "needs-reconnect",
						reason: "Google returned no access token.",
					};
		} catch {
			return {
				outcome: "needs-reconnect",
				reason: "Google would not refresh the access token.",
			};
		}
	}

	async revoke(userId: string): Promise<boolean> {
		const account = await this.db.account.findFirst({
			where: { userId, providerId: GOOGLE_PROVIDER_ID },
			select: { refreshToken: true, accessToken: true },
		});

		const token = account?.refreshToken ?? account?.accessToken;
		if (!token) return false;

		const response = await fetch("https://oauth2.googleapis.com/revoke", {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ token }),
		});

		if (!response.ok) {
			this.logger.warn({
				message: "Google token revocation failed",
				userId,
				status: response.status,
			});
			return false;
		}

		await this.db.account.updateMany({
			where: { userId, providerId: GOOGLE_PROVIDER_ID },
			data: {
				accessToken: null,
				refreshToken: null,
				scope: null,
				accessTokenExpiresAt: null,
				refreshTokenExpiresAt: null,
			},
		});

		this.logger.log({ message: "Google access revoked", userId });
		return true;
	}
}
