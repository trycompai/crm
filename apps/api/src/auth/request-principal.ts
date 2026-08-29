import type { Session, SessionUser } from "@crm/auth";

export type CredentialKind = "session" | "apiKey" | "oauth";

export type RequestPrincipal = {
	credentialKind: CredentialKind;
	user: SessionUser;
	clientId: string | null;
	scopes: ReadonlySet<string>;
	session: Session | null;
	expiresAt: Date | null;
};

export class RequestPrincipalError extends Error {
	constructor(
		readonly status: 400 | 401 | 403,
		readonly code: string,
		message: string,
		readonly challenge?: string,
	) {
		super(message);
		this.name = "RequestPrincipalError";
	}
}
