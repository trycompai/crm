import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { APIError } from "better-auth/api";
import { verifyJwsAccessToken } from "better-auth/oauth2";
import { z } from "zod";
import { auth } from "./auth";
import { OAUTH } from "./oauth-config";

const oauthResource = oauthProviderResourceClient(auth).getActions();
const jwksCacheKey = {};
const accessTokenScope = z.string().optional();

export const getProtectedResourceMetadata =
	oauthResource.getProtectedResourceMetadata;

export async function verifyAccessTokenRequest(
	request: Parameters<typeof oauthResource.verifyAccessTokenRequest>[0],
	opts?: Parameters<typeof oauthResource.verifyAccessTokenRequest>[1],
) {
	const authorization =
		request instanceof Request
			? request.headers.get("authorization")
			: request.authorizationHeader;
	const match = authorization?.match(/^Bearer\s+(.+)$/i);
	if (!match?.[1]) {
		throw new APIError("UNAUTHORIZED", {
			message: "A bearer access token is required.",
		});
	}

	const payload = await verifyJwsAccessToken(match[1], {
		jwksFetch: () => auth.api.getJwks(),
		jwksCacheKey,
		verifyOptions: {
			issuer: OAUTH.issuer,
			audience: OAUTH.resource,
			...opts?.verifyOptions,
		},
	});
	if (opts?.requiredScopes?.length) {
		const scope = accessTokenScope.parse(payload.scope);
		const scopes = new Set(scope ? scope.split(/\s+/).filter(Boolean) : []);
		const missing = opts.requiredScopes.filter((scope) => !scopes.has(scope));
		if (missing.length) {
			throw new APIError("FORBIDDEN", {
				message: `The token requires ${missing.join(" ")}.`,
			});
		}
	}
	return payload;
}
