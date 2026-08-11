const nonTerminalStates = new Set([
	"OPEN",
	"IN_PROGRESS",
	"WAITING",
	"BLOCKED",
]);

export type WorkCapabilities = {
	canClaim: boolean;
	canAssign: boolean;
	canStart: boolean;
	canWait: boolean;
	canBlock: boolean;
	canComplete: boolean;
	canDismiss: boolean;
};

export function workCapabilities(input: {
	state: string;
	ownerId: string | null;
	userId: string;
	isAdmin: boolean;
}): WorkCapabilities {
	const nonTerminal = nonTerminalStates.has(input.state);
	const canAct = input.isAdmin || input.ownerId === input.userId;
	return {
		canClaim: input.state === "OPEN" && input.ownerId === null,
		canAssign: input.isAdmin && nonTerminal,
		canStart: canAct && input.state === "OPEN",
		canWait:
			canAct && (input.state === "OPEN" || input.state === "IN_PROGRESS"),
		canBlock:
			canAct &&
			(input.state === "OPEN" ||
				input.state === "IN_PROGRESS" ||
				input.state === "WAITING"),
		canComplete: canAct && nonTerminal,
		canDismiss: canAct && nonTerminal,
	};
}
