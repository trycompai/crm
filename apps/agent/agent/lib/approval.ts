import {
	type AgentPermissionMode,
	agentPermissionMode,
} from "@crm/validation/agent-permission";
import type { Approval, ApprovalContext } from "eve/tools/approval";
import { APP_AUTH } from "./app-auth";
import { attribute } from "./session-purpose";

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
	return (context) => {
		if (isAutomated(context.session)) {
			return {
				type: "denied" as const,
				reason: `Not something to do unattended. ${instead}`,
			};
		}
		return permissionModeOf(context) === "bypass"
			? "approved"
			: "user-approval";
	};
}

export function changeWrite(): Approval {
	return (context) => {
		const mode = permissionModeOf(context);
		return mode === "manual" ? "user-approval" : "approved";
	};
}

export function permissionModeOf(
	context: ApprovalContext,
): AgentPermissionMode | null {
	return agentPermissionMode
		.nullable()
		.catch(null)
		.parse(attribute(context, "permissionMode"));
}
