export const APP_AUTH = {
	attributes: {},
	authenticator: "app",
	principalId: "eve:app",
	principalType: "runtime",
} as const;

export type AppAuth = {
	attributes: Readonly<Record<string, string | readonly string[]>>;
	authenticator: string;
	principalId: string;
	principalType: string;
};
