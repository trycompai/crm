# Plan — Gmail & Calendar

Put the conversation back in the CRM. Three features, in the order they should
be built:

1. **Meetings on the record.** A calendar event with someone from Acme shows on
   Acme's timeline — before it happens, and after.
2. **Email threads in-line.** A thread with someone from Acme shows on Acme's
   timeline, collapsed to a subject and a snippet, expandable to the messages.
3. **Auto-created companies and contacts.** Booking a meeting or holding a
   two-way thread with a new domain creates the company and the contact, so
   nobody types what Google already knows.

Read it with [`AGENTS.md`](../../AGENTS.md), [`api.md`](../api.md),
[`design.md`](../design.md) and [`crm-plan.md`](../crm-plan.md). The conventions
there are assumed, not repeated: single tenant, tRPC as the data surface,
services throw `HttpException`, freshness via `useCrmCache()`, all UI from
`/packages/ui`.

---

## 1. The decisions that carry the design

Six choices. Everything else follows.

1. **Gmail and Calendar are granted at sign-in, and using the CRM is
   conditional on them.** This is an internal, single-tenant tool where seeing
   the conversation on a record *is* the product, so a rep with an account and no
   mailbox is a half-configured account nobody notices is broken. The scopes go
   on the provider config; because Google's granular consent lets someone untick
   one and still finish signing in, the app also gates on what was actually
   granted. §3.
2. **Google's per-mailbox ids are not identities.** Gmail `threadId` is scoped
   to one mailbox, so two reps on one thread would create two CRM threads.
   Identity is the RFC 822 `Message-ID` for email and `iCalUID` for calendar,
   both of which are global. §4.2.
3. **Email and calendar get real tables; the timeline gets a projection.** One
   `Activity` row per thread and per event, linked by FK. The timeline query,
   its indexes, its filters and its cursor paging are untouched. §4.
4. **Nothing is stored unless it is relevant.** A message is persisted only if a
   participant resolves to a company we track, or qualifies to create one.
   A rep's inbox contains their doctor. §5.
5. **Auto-creation needs two-way engagement.** A thread the rep replied to, or a
   meeting on the calendar. Not a received newsletter. §6.
6. **Sync is cron-driven and its cursor lives in Postgres.** The API is a
   serverless function; there is no worker to hold state, and the existing
   in-process `EnrichmentQueue` deliberately drops work on shutdown. §7.

### Choice table

| Decision | Choice | Why |
| --- | --- | --- |
| Connect flow | Scopes on the provider config, requested at sign-in | §3.1. Internal tool — mailbox access is a condition of having an account. |
| Enforcement | `requireGoogleAccess()` gate in the app shell | §3.1. Granular consent means "signed in" never implies "granted". |
| Repair path | `authClient.linkSocial({ provider: "google", scopes })` | §3.1. Re-consent for a partial grant or a pre-existing account. |
| Connected? | `Account.scope` contains both scopes | §3.1. The grant itself is the state — nothing to keep in sync. |
| Token refresh | `auth.api.getAccessToken({ providerId: "google", userId })` | Better Auth refreshes on demand. No hand-rolled refresh. |
| Disconnect | There isn't one — only purge-and-re-import, or revoke | §3.4. Syncing is mandatory, and a local disconnect would be undone by the next reconcile anyway. |
| Scopes | `gmail.readonly`, `calendar.readonly`, read-only | Nothing writes to Google in v1. Sending mail is a separate decision. |
| Google app type | **Internal** (Workspace-only) | Skips OAuth verification entirely. §3.3. |
| Email identity | `Message-ID` header, unique | Gmail `threadId` is per-mailbox. §4.2. |
| Thread identity | Root of `References` / `In-Reply-To`, unique | Same conversation, one CRM thread, whoever synced it. |
| Event identity | `(iCalUID, originalStartTime)`, unique | `iCalUID` is shared across attendees *and* recurrence instances. §4.2. |
| Timeline | One projected `Activity` per thread/event, FK-linked | Keeps the one-index-scan timeline in `activities.service.ts`. |
| Relevance | Participant domain must resolve to a `Company`, or qualify to create one | §5. Privacy and junk prevention are the same rule. |
| Bodies | Stored, plain text, quoted history stripped | "In-line" means readable. Never logged, never in list payloads. |
| Sync trigger | Vercel Cron → authenticated internal route | §7. Pub/Sub push is a later upgrade behind the same handler. |
| Sync state | `MailboxSync` row per account per source | Serverless has no memory between invocations. |
| Backfill | **None.** Forward-only from first sight of a mailbox | §7.3. Nobody asked for three months of old mail in their CRM, and it deletes a whole class of machinery. |
| Feature flag | None. Sync is simply on | §13. It gates nothing that can genuinely be absent, and defaults to off — so it is only ever wrong. |
| Freshness | Poll while syncing, mirroring `enrichment-status` | A background write the browser did not cause. `api.md`. |
| New UI | Added to `/packages/ui` | `design.md` — thread disclosure and attendee list are new primitives. |

### Judgment calls worth your veto

- **Calendar ships before Gmail.** Smaller API, cleaner dedupe key, no body
  parsing, no privacy surface worth arguing about, and it proves the whole
  connect → cron → project → render pipeline on the easy case. Gmail then adds
  only Gmail's problems. If you want threads first, say so — but Phase 2 is
  about two weeks cheaper than Phase 3 for most of the perceived value.
- **Read-only, both APIs.** No sending, no event creation, no "log this email"
  button writing back. It halves the scope review and removes every way this
  feature can damage a customer relationship. Writing is a v2 conversation.
- **Auto-create fires without an approval queue.** The guardrails in §6 are
  tight enough that a review queue would mostly be a list of correct rows
  waiting for someone to click Accept — and approval queues rot. Instead every
  auto-created record is tagged with its provenance and is filterable, so a bad
  rule is visible and reversible in bulk. Say the word if you want the queue.
- **We store message bodies.** The alternative — metadata plus a deep link to
  Gmail — is more private and much less useful, because the point is reading the
  thread without leaving the record. §10 covers what that obliges us to do.
- **Personal mail is dropped at ingest, not stored-then-hidden.** Slightly more
  work at sync time, and the only version of this that survives someone reading
  the database.

---

## 2. What exists that we build on

| Thing | Where | Use |
| --- | --- | --- |
| Google OAuth, Better Auth | `packages/auth/src/auth.ts` | Add `scope` and `accessType: "offline"` here. Scope strings live in `packages/auth/src/scopes.ts`, imported by the API and the app. |
| `Account.accessToken` / `refreshToken` / `scope` | `schema.prisma` | Better Auth already persists per-provider tokens. |
| `domainFromEmail()` + free-domain blocklist | `apps/api/src/companies/domain.ts` | The matching backbone. Already rejects gmail.com et al. |
| `EnrichmentService.companyForEmail()` | `apps/api/src/enrichment/enrichment.service.ts:197` | Find-or-create company by domain, then enqueue enrichment. Auto-creation reuses this verbatim. |
| `ActivityType.EMAIL` / `MEETING` | `schema.prisma` | The enum values already exist and are already in `NOTE_TYPES`. |
| Timeline, cursor-paged, filter tabs | `apps/api/src/activities/activities.service.ts` | Extended, not replaced. |
| Enrichment polling pattern | `apps/app/components/crm/enrichment-status.tsx` | Copy the shape for sync status. |
| Cache fan-out | `apps/app/lib/trpc/cache.ts` | Add `cache.google()`; do not list keys at call sites. |

---

## 3. Connecting an account

### 3.1 Scopes at sign-in, and the gate behind them

The scopes go on the provider config in `packages/auth/src/auth.ts`, so every
sign-in asks for them:

```ts
socialProviders.google = {
  ...env.google,
  scope: [...SYNC_SCOPES],   // gmail.readonly, calendar.readonly
  accessType: "offline",     // so Google issues a refresh token
};
```

Four behaviours make this work, all read out of the installed
`better-auth@1.6.25` rather than assumed:

- **Scopes merge, they don't replace.** The Google provider builds
  `["email", "profile", "openid"]`, then appends `options.scope`, then appends
  any per-call `scopes`.
- **Incremental authorisation is already on.** The provider hardcodes
  `additionalParams: { include_granted_scopes: "true" }`, so a token issued for
  a widened grant covers the union rather than only the new scopes.
- **Re-consenting updates the account in place.** The OAuth callback finds the
  existing account by `(providerId, accountId)` and updates the tokens, both
  expiries and `scope`. That makes the repair path idempotent.
- **`Account.scope` is the connection state.** The granted scopes are persisted
  as a string, so "did they actually grant it?" is a column read.

**Requesting is not the same as granting.** Google's granular consent lets
someone untick a scope and finish signing in anyway, and any account created
before these scopes were required still carries the old grant. Either way the
person lands inside a CRM that looks signed-in and silently syncs nothing — so
asking at sign-in is necessary but not sufficient, and the app gates on the
result:

- `requireGoogleAccess()` (`apps/app/lib/session.ts`) reads `Account.scope`,
  `cache()`d so it costs one query per request, and redirects to
  `/grant-access` when either scope is missing.
- The `(app)` layout calls it instead of `requireSession()`, so the gate covers
  every page in the shell at once.
- `/grant-access` lives outside the `(app)` group deliberately — a page inside
  it would be redirected by the very layout doing the gating. It explains what
  is read and why, and offers `linkSocial` to re-consent, plus a sign-out for
  anyone who would rather not.

`prompt: "consent"` is deliberately **not** set: it is a provider-level option,
so it would show the consent screen on every sign-in forever. It is not needed,
because a first sign-in — and any sign-in asking for a scope not yet granted —
prompts anyway, and it is that prompt which mints the refresh token. The
missing-refresh-token case is detected (`hasRefreshToken`) and repaired rather
than pre-empted.

### 3.2 Reading and refreshing tokens

Never touch `Account.accessToken` directly. A `GoogleTokenService` wraps:

```ts
const { accessToken } = await auth.api.getAccessToken({
  body: { providerId: "google", userId },
});
```

which refreshes if expired (within five seconds of expiry, per the
implementation) and persists the new token. Confirmed present in 1.6.25 as
`/get-access-token`. If it throws, the connection is dead — mark the
`MailboxSync` row `NEEDS_RECONNECT` and surface a reconnect prompt; do not retry
in a loop.

### 3.3 Google Cloud setup (Phase 0, and it gates everything)

- One OAuth client, existing GCP project, add the two scopes.
- Set the consent screen **User type: Internal**. This is the whole ball game.
  `gmail.readonly` is a **restricted** scope (Google's own classification, not a
  judgement call), and an External app using it needs OAuth verification *plus*
  a CASA security assessment, renewed annually — months of work. For an Internal
  app Google's documentation is explicit: *"scopes aren't listed on the consent
  screen and use of restricted or sensitive scopes doesn't require further
  review by Google."* This CRM is already internal-only behind Google sign-in,
  so the exemption costs us nothing.

  Two caveats worth writing down now, because both are expensive later: the
  exemption is tied to the **Internal user type specifically** — an External app
  that merely happens to target Workspace users does not get it — and going
  External at any point in the future means the full restricted-scope review.
  If this CRM will ever be sold or opened to another domain, that decision
  belongs here, not in a year.
- Enable the Gmail API and the Google Calendar API on the project.
- The callback is the **existing** `…/api/auth/callback/google`. Extending the
  grant adds no new redirect URI, which is one fewer thing to get wrong across
  preview environments.

### 3.4 There is no disconnect

Making mailbox access a condition of having an account settles this section:
there is no supported state where a signed-in rep is not syncing, so there is no
disconnect button.

That is not only a policy choice, it is what the mechanics allow. A local
disconnect would delete the `MailboxSync` rows, and the next reconcile — which
derives those rows from the grant — would rebuild them within five minutes. A
button that appears to work and silently undoes itself is worse than no button.
Better Auth also **refuses to unlink the last account**
(`FAILED_TO_UNLINK_LAST_ACCOUNT`), and Google is our only sign-in, so unlinking
was never available either.

What the settings page offers instead:

- **Delete and re-import** (`google.purgeSyncedData`) — deletes every thread and
  event this mailbox contributed, cascading to the projected activities, then
  resets the cursors so the window re-imports from scratch. This is the answer to
  "get my mail out of the CRM", and it should not need a migration.
- **Revoke Google access** — calls Google's revoke endpoint. One OAuth client
  means one grant per user, so this ends *CRM access itself*, not just syncing:
  the scopes disappear, the gate catches the next request, and the person lands
  on `/grant-access`. Worded as such and behind a confirm, never as a default.

The only design with independent revocation — mailbox access off, sign-in intact
— is a **separate GCP OAuth client** for sync. Under a mandatory-sync policy
that state is not wanted, so the second client stays unbuilt. §15.

**The missing-refresh-token edge case** still applies: if Google decides not to
re-prompt, no refresh token is issued and `getAccessToken` fails an hour later.
`hasRefreshToken` detects it and the settings page shows a reconnect banner
rather than the sync dying quietly.


---

## 4. Data model

### 4.1 New models

```prisma
enum GoogleSyncStatus {
  IDLE
  RUNNING
  NEEDS_RECONNECT
  FAILED
}

enum EmailDirection {
  INBOUND
  OUTBOUND
}

/// Per-user, per-source cursor. In Postgres because the API is serverless and
/// the in-process queue drops work on shutdown by design.
model MailboxSync {
  id        String @id @default(cuid())
  userId    String
  user      User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// "gmail" | "calendar".
  source    String

  status    GoogleSyncStatus @default(IDLE)
  /// Gmail: the last processed historyId. Calendar: nextSyncToken.
  /// Stamped with "now" on first sight — there is no backfill, so nothing
  /// before that point is ever read.
  cursor    String?
  lastSyncedAt DateTime?
  lastError    String?

  @@unique([userId, source])
  @@map("mailboxSync")
}

/// One conversation, whoever's mailbox it came from.
model EmailThread {
  id            String @id @default(cuid())
  /// The RFC 822 Message-ID of the thread root — global, unlike Gmail's
  /// mailbox-scoped threadId. This is what stops two reps on one thread
  /// producing two CRM threads.
  rootMessageId String @unique
  subject       String?

  companyId String?
  company   Company? @relation(fields: [companyId], references: [id], onDelete: SetNull)
  contactId String?
  contact   Contact? @relation(fields: [contactId], references: [id], onDelete: SetNull)

  firstMessageAt DateTime
  lastMessageAt  DateTime
  messageCount   Int      @default(0)

  messages EmailMessage[]
  activity Activity?

  @@index([companyId, lastMessageAt])
  @@map("emailThread")
}

model EmailMessage {
  id       String      @id @default(cuid())
  threadId String
  thread   EmailThread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  /// Global message identity. Unique, so account B's sync skips what
  /// account A already ingested.
  rfcMessageId String @unique
  /// Whose mailbox produced this copy, and its id there — for deep links.
  syncedByUserId String?
  gmailMessageId String?

  direction EmailDirection
  fromEmail String
  fromName  String?
  /// [{ email, name, kind: "to" | "cc" }]. Not a table: nothing queries it.
  recipients Json
  subject   String?
  snippet   String?
  /// Plain text, quoted history stripped. Never logged; never in list payloads.
  body      String?
  sentAt    DateTime

  @@index([threadId, sentAt])
  @@map("emailMessage")
}

model CalendarEvent {
  id String @id @default(cuid())
  /// Shared by every attendee's copy of the event, and by every instance of a
  /// recurrence — which is why the start time is part of the key.
  iCalUid           String
  originalStartTime DateTime
  /// Set on an instance of a recurring series.
  recurringEventId  String?

  title       String?
  description String?
  location    String?
  conferenceUrl String?
  startsAt    DateTime
  endsAt      DateTime
  isAllDay    Boolean @default(false)
  status      String
  organizerEmail String?

  companyId String?
  company   Company? @relation(fields: [companyId], references: [id], onDelete: SetNull)
  contactId String?
  contact   Contact? @relation(fields: [contactId], references: [id], onDelete: SetNull)

  syncedByUserId String?
  googleEventId  String?

  attendees CalendarAttendee[]
  activity  Activity?

  @@unique([iCalUid, originalStartTime])
  @@index([companyId, startsAt])
  @@map("calendarEvent")
}

model CalendarAttendee {
  id      String        @id @default(cuid())
  eventId String
  event   CalendarEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)

  email        String
  name         String?
  /// needsAction | declined | tentative | accepted
  responseStatus String?
  isOrganizer  Boolean @default(false)
  contactId    String?
  contact      Contact? @relation(fields: [contactId], references: [id], onDelete: SetNull)

  @@unique([eventId, email])
  @@map("calendarAttendee")
}

/// Domains we never match on and never create from — vendors, ATSs,
/// newsletters. Grows by hand and by a "not a customer" action in the UI.
model SuppressedDomain {
  domain    String   @id
  reason    String?
  createdAt DateTime @default(now())
  @@map("suppressedDomain")
}
```

### 4.2 Why those keys, specifically

Both were checked against Google's docs rather than assumed, because getting
either wrong produces duplicates that are painful to unpick later.

- **Gmail `threadId` is mailbox-scoped.** If two of our reps are on one thread,
  each mailbox reports a different `threadId` for it. Deduping on `threadId`
  would put the same conversation on Acme's timeline twice. The RFC 822
  `Message-ID` header is globally unique per message, so `EmailMessage`
  deduplicates on that, and the thread is keyed by the root message id — the
  first entry of `References`, else `In-Reply-To`, else the message's own
  `Message-ID`.
- **`iCalUID` is shared across attendees' copies** — that is its purpose, per
  RFC 5545 and Google's own reference — **and it is also shared by every
  instance of a recurring series**, where only the `id` differs. So the key is
  `(iCalUid, originalStartTime)`: `originalStartTime` identifies the instance
  even if that instance has been moved.

### 4.3 Changes to existing models

```prisma
enum RecordSource {
  MANUAL
  IMPORT
  EMAIL
  CALENDAR
}

model Company {
  // …
  source          RecordSource @default(MANUAL)
  emailThreads    EmailThread[]
  calendarEvents  CalendarEvent[]
}

model Contact {
  // …
  source          RecordSource @default(MANUAL)
  emailThreads    EmailThread[]
  calendarEvents  CalendarEvent[]
  eventAttendance CalendarAttendee[]
}

model Activity {
  // …
  /// The projection link. Unique: one timeline entry per thread and per event.
  emailThreadId   String?        @unique
  emailThread     EmailThread?   @relation(fields: [emailThreadId], references: [id], onDelete: Cascade)
  calendarEventId String?        @unique
  calendarEvent   CalendarEvent? @relation(fields: [calendarEventId], references: [id], onDelete: Cascade)
}

model User {
  // …
  mailboxSyncs MailboxSync[]
}
```

`Activity.createdById` stays required and is set to the user whose mailbox
ingested the item — but the UI renders synced entries as "via Gmail" rather than
as something that person wrote, because they didn't.

Migration: `bun run --filter=@crm/db db:migrate`, named
`add_google_sync`. Nothing backfills; existing rows default to `MANUAL`.

### 4.4 Why project into `Activity` rather than union three tables

The timeline is one indexed range scan over `activity(companyId, createdAt)`,
with cursor paging and four filter counts. A union across three tables loses the
index, makes the cursor a compound mess, and rewrites code that works. Instead
sync writes one `Activity` per thread and per event and keeps it current:

- New message in a known thread → update the projected activity's `occurredAt`
  and snippet. One row per thread, not per message.
- Event moved or cancelled → update the projected activity, or delete it when
  the event is cancelled.

The row is a summary. Expanding it fetches the messages or the attendees through
a separate procedure (§8), so the timeline payload does not carry email bodies.

---

## 5. Matching: from a Google payload to a CRM record

One resolver, `GoogleMatchService`, used by both syncs. Given the participant
addresses of a thread or an event:

1. **Drop our own people.** Any address on our own Workspace domain, and any
   address belonging to a `User`. What is left is the external side.
2. **Drop noise.** `domainFromEmail()` already returns `null` for free hosts.
   Also drop `SuppressedDomain` hits and no-reply local parts
   (`noreply`, `no-reply`, `notifications`, `donotreply`, `mailer-daemon`,
   `bounce`, `via .*` senders).
3. **Contact first, then company.** An exact `Contact.email` match wins —
   `Contact.email` is already unique. Otherwise resolve the domain against
   `Company.domain`, which is already unique and normalised.
4. **If nothing matches**, hand off to §6. If §6 declines, **the item is not
   stored at all.**
5. **Stamp both ids.** Per the existing timeline convention, an activity carries
   `companyId` even when it is really about a contact, so the company timeline
   stays a single scan.

Multiple external domains on one thread (a customer plus their lawyer) attach to
the domain with the most participants, tie-broken by whichever already exists as
a `Company`. It is a heuristic; it is also visibly wrong when it is wrong, and
re-attaching is a single field edit.

---

## 6. Auto-creating companies and contacts

The rule is **two-way engagement**, evaluated per source:

| Source | Creates when | Rationale |
| --- | --- | --- |
| Calendar | An event with ≥1 external attendee, status not `cancelled`, and our user is organiser or has not declined | Somebody put time in a diary. That is as strong a signal as this CRM gets. |
| Gmail | The connected user has **sent** ≥1 message in the thread | A reply proves a relationship. Inbound-only is a newsletter, a recruiter, or spam. |

Then, in both cases, all of:

- The external domain is non-free (`domainFromEmail()` returns non-null), not
  our own, and not in `SuppressedDomain`.
- The sender is not a no-reply address.
- The thread has ≥1 message, or the event ≥1 confirmed external attendee.

Creation itself reuses what exists: **`EnrichmentService.companyForEmail(email)`
already does exactly this job** — normalise the domain, find or upsert the
`Company`, and enqueue enrichment so the logo, industry and description fill in
behind the scenes. Contacts are created alongside, with the display name from
the `From` header or the attendee's `displayName` split into first/last, falling
back to the local part.

Everything created this way is stamped `source = EMAIL | CALENDAR`, which gives
a filter on the companies and contacts tables, a bulk undo, and an honest answer
to "where did all these come from".

A per-user **"Auto-create records" toggle**, default **on for calendar, off for
Gmail** on first connect. Meetings are unambiguous; the first week of mailbox
auto-creation is where a bad rule shows up, and it should be a deliberate opt-in
after the rep has seen what the sync matches.

---

## 7. Sync mechanics

### 7.1 Shape

The API is a bundled Vercel function (`apps/api/api/index.ts`) — no long-lived
process, so no in-memory scheduler. A **Vercel Cron** hits an internal route
every 5 minutes; the route iterates connected accounts and runs one incremental
pass each.

```ts
// apps/api/vercel.ts  (vercel.ts is the current recommendation over vercel.json)
crons: [{ path: "/internal/sync/google", schedule: "*/5 * * * *" }],
```

The route sits outside tRPC — it is not a user action — and is guarded by a
`CRON_SECRET` bearer check plus Vercel's cron header, alongside `/health` as one
of the few non-tRPC surfaces `api.md` permits. It returns immediately after a
bounded amount of work.

> **Plan check:** minute-level cron needs a Pro plan; Hobby is once a day. Worth
> confirming before Phase 2.

### 7.2 Incremental sync

Both APIs are cursor-based, and both invalidate cursors. Verified behaviour:

- **Gmail** — `users.history.list(startHistoryId)` returns changes since a
  `historyId`. History records are retained "typically at least one week"; an
  out-of-range `startHistoryId` returns **HTTP 404**, and the client must fall
  back to a full sync. We do not: forward-only means the cursor is re-pointed at
  now and the gap is dropped, because refetching it would be importing old mail.
- **Calendar** — `events.list` returns `nextSyncToken` on the final page. An
  expired or ACL-invalidated token returns **HTTP 410 Gone**, requiring a full
  resync. Incremental results always include deleted entries, so cancellations
  arrive as events to remove — delete the projected activity when one does.

### 7.3 No backfill — forward-only

Nothing from before a mailbox was first seen is ever imported.

- **Gmail** — the first pass calls `users.getProfile`, stores the current
  `historyId` as the cursor, and imports **nothing**. Every later tick is
  `history.list` from that point, so only mail that arrives after connection is
  read. When the cursor falls out of Gmail's retention window (a 404, which
  takes roughly a week of the sync not running), the gap is *not* fetched: the
  cursor is re-pointed at now and the miss is logged.
- **Calendar** — `timeMin` is `now`, never earlier. Events that *start* from now
  onwards are imported, including ones booked before sync was switched on,
  because a meeting in next Tuesday's diary is the entire point of the feature
  and putting it on a timeline is not back-dating anything. Past meetings are
  never read.

What this deletes, which is most of the reason to do it: the chunk loop, the
`backfilledTo` resume column, the `BACKFILLING` status, `GMAIL_BACKFILL_DAYS`,
the cursor-invalidation path that re-entered a backfill, and the progress UI
that had to explain all of it. A tick is now one shape — "what changed since the
cursor?" — rather than two.

The cost is honest and small: a company added today shows conversations from
today. The history is in Gmail, where it always was.

### 7.4 Idempotency and ordering

Every write is an upsert on the natural key from §4.2, so re-running a window is
free. Two reps' syncs racing on the same thread is settled by the unique index
on `rfcMessageId`, exactly as the `Company.domain` index already settles two
contacts arriving at a new company.

### 7.5 Later: near-real-time

Gmail `users.watch` + Cloud Pub/Sub push turns 5 minutes into seconds. It also
adds a Pub/Sub topic, a push endpoint, and a `watch` registration that **expires
every 7 days** and must be renewed on a schedule. Build it behind the same
handler the cron calls, once the polling version has proven the matching rules.
Not Phase 2 work.

---

## 8. API surface

One module, `apps/api/src/google`, one router per `api.md`
(`google.router.ts`, `@Router({ alias: "google" })`, `@UseMiddlewares(AuthMiddleware)`),
thin over services.

| Procedure | Kind | Notes |
| --- | --- | --- |
| `google.status` | query | Per-source: connected, `status`, `lastSyncedAt`, `lastError`, auto-create toggles. Drives the settings page and the poll. |
| `google.purgeSyncedData` | mutation | Deletes every thread and event this mailbox contributed. Syncing continues forward from the current cursor. Not a disconnect — see §3.4. |
| `google.revokeAccess` | mutation | The explicit hard revoke. Calls Google's revoke endpoint; the rep re-consents at next sign-in. Confirmed in the UI, never the default. |
| `google.syncNow` | mutation | Enqueues a pass for the calling user. Rate-limited; it is a nicety, not the mechanism. |
| `google.setAutoCreate` | mutation | `{ source, enabled }`. |
| `google.suppressDomain` | mutation | "Not a customer" — adds to `SuppressedDomain` and optionally deletes what it matched. |
| `email.thread` | query | `{ threadId }` → messages with bodies. Only called on expand. |
| `calendar.event` | query | `{ eventId }` → attendees, conference link, description. |

Connecting needs no procedure — the client calls `authClient.linkSocial()`
directly, and `google.status` reads the result off `Account.scope`.

Extensions to existing surfaces:

- `activities.contracts.ts` — add `"email"` and `"meetings"` to `TimelineFilter`;
  `activities.service.ts` — the matching arms in `filterClause()` and the extra
  counts in `timelineCounts()`.
- `ENTRY_SELECT` — include a *summary* of the linked thread/event
  (`messageCount`, `lastMessageAt`, `startsAt`, attendee count). Not bodies.
- `companies.service.ts` / `contacts.service.ts` — `nextMeetingAt` and
  `lastEmailAt` on the detail payload, and `source` as a filterable column.

Regenerate and **commit** `apps/api/src/generated/server.ts` with the router
change, per `api.md`.

---

## 9. UI

### 9.1 New primitives — in `/packages/ui`, per `design.md`

Nothing bespoke in `apps/app`, no `className` overrides, no new radii:

- `accordion.tsx` — via `bun run --filter=@crm/ui ui:add accordion`. The thread
  disclosure. Not currently in the package.
- `thread-message.tsx` — one message: sender, time, direction, body. Composes
  `avatar`, `separator`.
- `attendee-list.tsx` — stacked avatars with response status, over `avatar` and
  `tooltip`.
- `connection-card.tsx` — a connected-service row with status and actions, over
  `card`, `status-indicator`, `button`. Reused by any future integration.

### 9.2 Timeline

`timeline-entry.tsx` gets two branches beside the existing `STAGE_CHANGE` one:

- **EMAIL** — subject, `"3 messages · latest 2h ago"`, direction arrow, snippet.
  Expands into an accordion of `ThreadMessage`s, fetching `email.thread` on
  first open. Deep-links to Gmail via the stored `gmailMessageId`.
- **MEETING** — title, time range, `AttendeeList`, conference link. An upcoming
  meeting sorts by `startsAt` and reads "in 2 days"; `relativeTimeFromIso()`
  already exists in `@crm/ui/lib/format`.

`activity-icon.tsx` already maps both types. Filter tabs gain **Email** and
**Meetings** (`timeline-search-params.ts`, nuqs, per the existing pattern).

### 9.3 Settings

A new `apps/app/app/(app)/settings/page.tsx` — there is no settings route yet.
**One card, not one per source.** Both scopes come from a single grant at
sign-in, so "Gmail connected but Calendar not" is not a state that exists, and
rendering it as two identical cards invented a distinction the system does not
have. The card carries connection health, when it last checked, and the two
auto-create toggles — the only decision on the page with a consequence. The
destructive actions from §3.4 sit underneath as quiet text links, because
neither is anybody's daily business. No connect button: the gate guarantees the
scopes before anyone reaches this page.

### 9.4 Freshness

Sync is a background write no client action caused, so per `api.md` it is
**polled, not invalidated**. Mirror the enrichment pattern exactly — a
`components/crm/sync-status.tsx` exporting `isSyncing()` and `SYNC_POLL_MS`, so
the rule has one definition. Poll on the settings page *and* on the record sheet
while a sync is running, remembering the lesson already recorded in
`api.md`: the company sheet polled and the companies table did not, and a
newly-added company stayed blank in the table until a reload.

User-initiated actions still invalidate through `useCrmCache()`. Add a
`cache.google()` that fans out to the activity keys plus companies and contacts
lists — and note that `activities.timeline` must use `pathKey()`, not
`queryKey()`, because it is read both as an infinite query and as a plain one.

---

## 10. Privacy, security, logging

This is the part that makes the feature acceptable rather than merely working.

- **Relevance filtering at ingest, not at read.** Non-matching mail is never
  written. §5.
- **Never log content.** `api.md` already bans headers, query strings and
  bodies. Extend it in spirit: no subjects, no snippets, no addresses in log
  lines. Log counts, ids, and domains. `logger.log({ message: "Gmail sync",
  userId, threadsWritten, messagesWritten })` — one object, per the rules.
- **Bodies never appear in list payloads.** `ENTRY_SELECT` carries a snippet;
  bodies come only from `email.thread`, one thread at a time.
- **Read scopes only**, and the reconnect path revokes and re-consents rather
  than silently widening.
- **Disconnect means it.** Deleting the account row stops sync; `{ purge: true }`
  removes the messages, threads, events and their projected activities. Someone
  will ask for this on their last day, and the answer should not be a migration.
- **Every rep sees every synced thread** — that follows from "signed in is the
  entire authorisation model" in `api.md`, and it is a real consequence worth
  saying out loud before the first sync runs, not after. If that is not
  acceptable, it is a row-level permissions decision that belongs in this plan
  now rather than as a retrofit.

---

## 11. Failure modes to design for

| Failure | Response |
| --- | --- |
| Refresh token revoked | `NEEDS_RECONNECT` on the sync row, banner in settings, stop trying. |
| `historyId` too old (404) | Clear cursor, resume from now, log the gap. §7.3. |
| `syncToken` gone (410) | Clear cursor, re-read from `now` forward. §7.2. |
| Google rate limits (429/403) | Exponential backoff persisted on the sync row; skip that account this tick. |
| Cron tick overruns | Chunked work with a wall-clock budget; the cursor makes the next tick resume, not restart. |
| Two reps, one thread | Unique `rfcMessageId`. §4.2. |
| Auto-create makes junk | `source` filter → bulk delete → `SuppressedDomain`. §6. |
| Deploy mid-tick | The cursor only advances on a settled pass, so at worst a window is re-read — every write is an upsert. |

---

## 12. Phases

| Phase | Scope | Done when |
| --- | --- | --- |
| **0 — Google Cloud** | Internal consent screen, both APIs enabled, redirect URIs for all envs | Consent screen shows the two scopes; no verification required. |
| **1 — Connect** | Scopes on the provider, `accessType: "offline"`, `requireGoogleAccess()` gate, `/grant-access`, `GoogleTokenService`, `MailboxSync`, settings page, `google.status`. No sync. | A fresh sign-in grants both scopes and lands in the app; a user who unticks one is bounced to `/grant-access` and can re-consent; an account predating the requirement is caught by the same gate. |
| **2 — Calendar** | Calendar sync, `CalendarEvent`/`CalendarAttendee`, matching, projection, `MEETING` timeline entry, Meetings filter | A meeting with an existing company appears on its timeline within 5 minutes, and a cancellation removes it. |
| **3 — Gmail** | Gmail sync, `EmailThread`/`EmailMessage`, thread accordion, Email filter | A thread with an existing company appears collapsed and expands to readable messages. |
| **4 — Auto-create** | §6 rules, `RecordSource`, `SuppressedDomain`, filters, bulk undo, toggles | A meeting with an unknown work domain creates an enriched company and a contact; a newsletter creates nothing. |
| **5 — Real-time (optional)** | `users.watch` + Pub/Sub push, 7-day renewal | Threads land in seconds; the cron stays as the safety net. |

Phases 1–3 are the user's stated ask. Phase 4 is the "would be cool", and it
should not ship before Phase 3 has run on real mailboxes for a week — the
matching rules need to be observed against real mail before they are allowed to
write rows.

---

## 13. Environment

| Variable | Where | Notes |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | exists | Unchanged. Same client, same callback — the grant is just widened at sign-in. |
| `CRON_SECRET` | new | Bearer guard on `/internal/sync/google`. The route fails closed without it, so a local checkout simply never runs the cron. |

Nothing else. There is deliberately **no feature flag**: a switch earns its keep
only when it gates something that can genuinely be absent, and sync has
everything it needs the moment the app boots — the OAuth client is mandatory
because Google is the only sign-in, and the scopes are a condition of having an
account. A switch that can disable a mandatory feature, defaulting to off, is a
switch that is only ever wrong. **Our own domains are derived** from the `User`
table rather than configured, so they cannot go stale when the team adds a
second one.

All added to `EnvironmentVariables` in `apps/api/src/config/env.validation.ts`
with `class-validator` decorators, and to `docs/environment.md`.

---

## 14. Testing

- **Unit, no network.** Matching (§5) and the auto-create rules (§6) are pure
  functions over parsed payloads — table-driven `bun test` with fixtures for the
  awkward cases: two external domains, a no-reply sender, a free-host address, a
  thread the rep never replied to, a declined meeting, a moved recurrence
  instance.
- **Idempotency.** Run a fixture window twice; assert row counts are identical.
- **Cross-mailbox dedupe.** Ingest the same conversation as two different
  mailboxes with different `threadId`s; assert one `EmailThread`, one projected
  `Activity`.
- **Cursor invalidation.** Stub 404 and 410 and assert the cursor is cleared and
  the next pass resumes from now, rather than a crash or a silent stall.

---

## 15. Open questions

1. **Whose mail syncs?** Every signed-in user who connects, or a defined sales
   group? Affects volume and the §10 visibility question.
2. **Visibility.** §10 — every rep seeing every synced thread follows from the
   current auth model. Confirm that is intended.
3. **Retention.** Do synced messages age out (say, 24 months), or live as long
   as the company record?
4. **Attachments.** Out of scope here. `crm-plan.md` §7 already picks Vercel Blob
   for CRM attachments; email attachments would reuse it, but v1 stores names
   and sizes only, not bytes.
5. **Cron granularity.** Confirm the Vercel plan supports `*/5`.
6. **Does hard revocation need to be per-feature?** §3.4 — with one OAuth client
   there is one Google grant, so revoking mailbox access also revokes sign-in.
   Under the mandatory-sync policy that is arguably the correct behaviour, since
   an account that will not grant the scopes cannot use the CRM anyway. Revisit
   only if someone needs "keep my login, stop reading my mail", which the policy
   currently says is not a state we support.

---

## 16. Status and handoff (calendar + Gmail + auto-create)

### Shipped (phases 0–3 + phase 4 rules)

Phases **0–3** are in the tree (calendar + Gmail threads). Phase **4** auto-create
rules and acceptance tests ship in the same wave; Gmail auto-create stays off by default.

| Concern | Where |
| --- | --- |
| Scopes + offline access | `packages/auth/src/scopes.ts`, `packages/auth/src/auth.ts` |
| App shell gate | `apps/app/lib/session.ts` → `requireMailboxAccess()`, `/grant-access` |
| `MailboxSync` + event/email tables + `Activity` FKs | `packages/db/prisma/schema.prisma` |
| Calendar list client + pure helpers | `apps/api/src/google/calendar.client.ts` |
| Calendar forward-only sync, relevance, projection | `apps/api/src/google/calendar-sync.service.ts` |
| Gmail history client + MIME parse | `apps/api/src/google/gmail.client.ts`, `gmail-mime.ts` |
| Gmail forward-only sync (`historyId`) | `apps/api/src/google/gmail-sync.service.ts` |
| Thread write + EMAIL activity projection | `apps/api/src/mailbox/thread-writer.service.ts` |
| Match (contact → company; create only if allowed) | `apps/api/src/mailbox/mailbox-match.service.ts` |
| Cron tick + dispatch | `apps/api/src/sync/mailbox-sync.service.ts`, `sync.controller.ts` |
| Expand path with full bodies | `google.thread` → `ConversationService.thread` |
| Timeline filters `meetings` / `email` + accordion UI | `activities.contracts.ts`, `timeline-search-params.ts`, `email-thread-entry.tsx` |
| Connection / status / purge | `apps/api/src/google/google-connection.service.ts` |
| Acceptance tests | `apps/api/test/calendar-sync.spec.ts`, `calendar-client.spec.ts`, `gmail-sync.spec.ts` |

Rules already enforced for calendar:

- Identity is `(iCalUid, originalStartTime)` unique.
- Only events that resolve to a tracked company/contact are stored when
  `autoCreate` is off (phase-1 relevance).
- Cancellations delete the `CalendarEvent` and cascade the projected `Activity`.
- Cursor invalidation (410) clears the cursor and resumes from `now` (no backfill).
- `timeMin` is now; horizon is 180 days.

Rules already enforced for Gmail:

- Identity is RFC 822 `Message-ID` (normalised) for messages and the root of
  `References` / `In-Reply-To` / own id for threads — not Gmail `threadId`.
- Cross-mailbox copies of one conversation produce one `EmailThread` and one
  projected `Activity`.
- Only threads that resolve to a tracked company/contact are stored when
  `autoCreate` is off (Gmail auto-create stays off in this wave).
- Timeline list payloads carry a snippet on `Activity.body` and thread summary
  fields only. Full message bodies load on expand via `google.thread`.
- First sight of a mailbox stores the current `historyId` and imports nothing.
- History 404 clears the cursor and resumes from now (no backfill).

### Phase 4 auto-create (shipped on existing substrate)

### Shipped (phase 4 rules on the existing substrate)

Phase **4** reuses the Gmail and Calendar sync path. Nest matches and creates
rows only. Intelligence still lives in `apps/agent` via `company.created` /
`contact.created` tasks. No generic agent-copy and no auto-send.

| Concern | Where |
| --- | --- |
| Two-way Gmail gate | `ThreadWriterService.store` — `allowCreate: row.autoCreate && repliedTo` |
| Calendar gate | `CalendarSyncService.apply` — `allowCreate: row.autoCreate && !declinedByUs` |
| Create + provenance | `MailboxMatchService` stamps `RecordSource.EMAIL` / `CALENDAR` on company and contact |
| Defaults | `GoogleConnectionService.onConnected` — calendar `autoCreate: true`, gmail `false` |
| Toggles | `google.setAutoCreate` / settings connection card |
| Undo | companies/contacts `source` filter + `bulkDelete`; `google.suppressDomain` (+ optional purge) |
| Noise filters | free hosts, no-reply local parts, `SuppressedDomain`, own Workspace domain |
| Acceptance tests | `apps/api/test/mailbox-auto-create.spec.ts` |

Rules locked by tests:

- Inbound-only (newsletter) never creates, even when Gmail auto-create is on.
- Rep-sent mail with auto-create on creates company + contact with `source = EMAIL`.
- Auto-create off: unknown domains create nothing; known companies still attach.
- Calendar allowCreate stamps `source = CALENDAR`; declined-by-us does not create.
- Free hosts, no-reply, and suppressed domains create nothing.

### Ops note (not a code gate)

Plan §12 still prefers a week of real-mailbox soak before flipping Gmail
auto-create on by default. The product default stays **calendar on, gmail off**.

### Out of scope here

- Phase 5 Pub/Sub real-time (`users.watch`).
- Sending mail from the CRM.
- Lifecycle specialist agents (qualify/engage) — separate Deploy-gated work.
- Changing the Gmail default to on.

### Done when (this lane)

A meeting with an unknown work domain creates a company and contact tagged
`CALENDAR`. A newsletter creates nothing. Gmail creates only on two-way
engagement when the toggle is on. Provenance filters and suppress-domain undo
remain available. The suite in `mailbox-auto-create.spec.ts` is green.
