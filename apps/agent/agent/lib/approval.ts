import type { Approval } from "eve/tools";
import { APP_AUTH } from "./app-auth";

export function isAutomated(session: {
	auth: {
		current?: {
			authenticator?: string;
			principalId?: string;
			principalType?: string;
		} | null;
	};
}): boolean {
	const auth = session.auth.current;
	return (
		auth?.authenticator === APP_AUTH.authenticator &&
		auth.principalId === APP_AUTH.principalId &&
		auth.principalType === APP_AUTH.principalType
	);
}

export function sensitiveWrite(instead: string): Approval {
	return ({ session }) =>
		isAutomated(session)
			? {
					type: "denied" as const,
					reason: `Not something to do unattended. ${instead}`,
				}
			: "user-approval";
}
