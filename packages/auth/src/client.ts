import { ssoClient } from "@better-auth/sso/client";
import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: globalThis.window?.location.origin,
	plugins: [ssoClient(), genericOAuthClient()],
});

export const { getSession, signIn, signOut, useSession } = authClient;

export type AuthClient = typeof authClient;
