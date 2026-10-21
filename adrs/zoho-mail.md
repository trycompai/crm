# Read Zoho Mail as a third mailbox provider

We run this CRM against a business that hosts its mail on Zoho, not on Google
Workspace or Microsoft 365. Today that means the agent has nothing to read: our
sales mailbox is `@elitesystemsdesign.com` on Zoho, and the only mail the CRM
can see belongs to a personal Gmail account that isn't where the business
actually happens. Every company, contact and thread the product is supposed to
fill in by itself has to be typed in by hand instead.

Zoho Mail is not a niche choice — it's the usual answer for a small company that
wanted its own domain without paying per seat for Workspace. So this is less
"support my setup" than "the second-tier mail host that the CRM's whole premise
quietly excludes".

## Why not the two easy answers

**Generic IMAP** would cover Zoho and everything else in one go, and it's the
obvious suggestion. We didn't do it, for two reasons. It would be the only
provider with no OAuth story — a password in the database, or an app-specific
password the user has to mint and re-mint, against a codebase where every other
credential is a refreshable token in the `account` table. And IMAP gives no
usable incremental cursor without holding a connection and a UID validity map,
which is a different shape of sync service from the two that already exist. It
is a bigger change that fits the codebase worse.

**A side script** that pushes mail in through an intake API was the other
option. It puts the mail in the CRM but leaves it outside everything that makes
the mailbox layer worth having: no connection card, no scope checking, no
purge, no reconnect flow, no `syncedByUserId` to purge against.

## What we did instead

Followed #73. The provider union in `packages/auth/src/scopes.ts` and the
`satisfies Record<…>` maps in `mailbox.constants.ts` are already the shape a
third provider slots into — the compiler names every arm that needs filling,
which is exactly the property you want when adding one. `ThreadWriterService`,
`MailboxMatchService`, `SyncStateService` and the `EmailThread`/`EmailMessage`
models needed no changes at all; `zohoMessageId` and `zohoWebLink` sit beside
the Gmail and Outlook columns.

Four things about Zoho are genuinely different from Graph, and they are where
the code is not a copy of the Outlook adapter:

- **It is a generic OAuth provider, not a better-auth social one.** It goes
  through the same `genericOAuth` plugin Slack already uses, so it links onto an
  existing account rather than only being a sign-in. That matters for the case
  above: sign in with Google, attach a Zoho mailbox on a different domain.
- **`Authorization: Zoho-oauthtoken <token>`, not `Bearer`.** `MailboxApiClient`
  grew one optional scheme argument.
- **There is no "changed since" filter.** The list endpoint pages with
  `start`/`limit` over a date-sorted list, so the incremental sync reads
  newest-first and stops at the first message the last tick already saw. The
  cursor is epoch milliseconds rather than an ISO string.
- **The list carries no RFC `Message-ID`.** Without one, the same mail seen
  through Gmail and through Zoho would be stored twice, so each new message
  costs a second call to the header endpoint. That is the main cost of this
  adapter and the reason its per-tick ceiling is lower than Outlook's.

## What it breaks

`hasSyncScopes`, `mailboxGrantsNeeded` and the `SYNC_SOURCES` maps gain a third
arm, which is a compile error everywhere until filled in — that is the union
doing its job, and every site is in this diff. `rebuildThreads` was duplicated
verbatim in the Google and Microsoft connection services; rather than add a
third copy it moved to `mailbox/thread-rebuild.ts`. Nothing else changes for an
install that never sets `ZOHO_CLIENT_ID`: unset, the provider is not registered,
the connection card says so, and no new query runs.
