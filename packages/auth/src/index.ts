export { type Auth, auth, type Session, type SessionUser } from "./auth";
export { AUTH_COOKIE_PREFIX } from "./cookies";
export { isGoogleConfigured, isMicrosoftConfigured } from "./env";
export {
	canChangeRole,
	canManageCurrency,
	canRenameWorkspace,
	DEFAULT_WORKSPACE_NAME,
	ensureWorkspaceMembership,
	isWorkspaceAdmin,
	isWorkspaceRole,
	WORKSPACE_ID,
	WORKSPACE_ROLES,
	type WorkspaceRole,
} from "./organization";
export {
	CALENDAR_SCOPE,
	GMAIL_SCOPE,
	GOOGLE_PROVIDER_ID,
	hasSyncScopes,
	IDENTITY_SCOPES,
	isMailboxProvider,
	MAILBOX_PROVIDER_IDS,
	type MailboxProviderId,
	MICROSOFT_PROVIDER_ID,
	MICROSOFT_SYNC_SCOPES,
	mailboxGrantsNeeded,
	needsMailboxGrant,
	OUTLOOK_MAIL_SCOPE,
	parseScopes,
	REQUIRED_SCOPES,
	type SignInAccount,
	SYNC_SCOPES,
	SYNC_SCOPES_FOR,
	signsInOnlyWith,
	signsInWithGoogle,
	signsInWithMicrosoft,
} from "./scopes";
export { onSignedIn, type SignedInHandler } from "./signed-in";
export {
	canConfigureSso,
	ssoCallbackBase,
	ssoCallbackURL,
	ssoProviderName,
} from "./sso";
export {
	hasSignInAllowList,
	isWorkspaceEmail,
	primaryWorkspaceDomain,
	workspaceDomains,
} from "./workspace";
