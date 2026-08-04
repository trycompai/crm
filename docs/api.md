
# API Rules - Always review when working on our API

## Prospecting integration boundary

The signed machine endpoints `POST /integrations/v1/leads` and
`POST /integrations/v1/suppressions` are deliberate exceptions to the browser
tRPC surface. They validate bounded strict payloads and authenticate the exact
body with a per-product timestamped HMAC. Candidate review and outreach actions
remain on the authenticated `prospecting` tRPC router. Vendor research and
scoring remain in the agent. See [product prospecting](./prospecting.md).

## Logging: use the Nest logger, attach fields, never `console.log`

Logging lives in `apps/api/src/logging`. `ContextLogger` extends Nest's
`ConsoleLogger` and is installed in `main.ts`, so `new Logger(Thing.name)`
anywhere in the app picks it up. **Format and level are not configurable** —
they follow `NODE_ENV`: JSON at `log` and above in production, colourised with
`debug`/`verbose` locally.

- **Attach data as one object, not extra arguments.** Nest prints one line per
  argument, so `logger.log("Saved", { userId })` emits two lines. Write
  `logger.log({ message: "Saved", userId })` instead — the fields are hoisted to
  the top level in JSON and rendered after the text in development.
- **Errors pass the stack as the second argument**:
  `logger.error({ message: "…" }, error instanceof Error ? error.stack : String(error))`.
  Handing Nest the error object instead prints it as a second message and drops
  the trace.
- **Every request carries a `requestId`**, generated (or taken from an inbound
  `x-request-id`) by `RequestLoggerMiddleware`, returned on the response header,
  included in error bodies, and stored in `AsyncLocalStorage` so every log line
  during that request is correlated. `UserContextInterceptor` adds `userId` once
  the auth guard has resolved the session.
- **Better Auth routes are logged through its `middleware` option**
  (`BetterAuthModule.forRoot({ auth, middleware: logAuthRoute })`). It mounts its
  handler straight onto the HTTP adapter during module configuration, before
  Nest applies anything from `MiddlewareConsumer`, so `/api/auth/*` would
  otherwise never reach the middleware. `LoggingModule` must stay **first** in
  `AppModule`'s imports for the same reason.
- **Never log headers, query strings, or request bodies.** They routinely carry
  session cookies and personal data. Log the specific fields a handler knows are
  safe.
- **Prisma statement logging is opt-in** via `PRISMA_LOG_QUERIES=true`, and is
  emitted at `debug`. It is off by default because it buries every other line
  under a wall of `SELECT`s. Bound parameters are dropped even when it is on.
  Prisma warnings and errors always flow through the app logger via
  `PrismaLogBridge`; outside the API (seeds, scripts, the Next.js app) they fall
  back to the console sink in `packages/db/src/client.ts`.

## Intelligence never lives in the API

This is an **agentic-first platform**. The API serves HTTP, auth, tRPC and the
Google sync. It does not research, enrich, score, summarise, match identities or
decide anything about a person or a company — not as a fallback, not "just the
cheap bit", not behind a flag. That work belongs to the eve agent in
`apps/agent`, which owns the vendor clients, the confidence model and the
writes.

Nest's half of the contract is to **report that something happened** — a thread
was ingested, a company was created, an attendee is unknown — and let the agent
decide what it means. A Nest service that calls an enrichment API is a bug, and
the reason is in the tree: two identity matchers were copied across `apps/api`
and `apps/agent`, and the copies silently drifted until one of them matched
every employer on earth. See
[`docs/plan/contact-intelligence-agent.md`](./plan/contact-intelligence-agent.md).

`apps/api/src/enrichment/` is gone. What replaced it is
`apps/api/src/agent/agent-trigger.service.ts` — one service with one verb, which
writes an `AgentTask` row saying *this happened* and why it might matter. A row
rather than an HTTP call: the agent leases work from that table already, so the
row *is* the message, and it survives the agent being down, redeployed, or
slower than the request that produced it.

If you are about to add a vendor client to `apps/api`, you want
`apps/agent/agent/lib` instead.

## There is exactly one organization, and it is not a tenancy boundary

This is an internal tool behind Google sign-in, and it is **single tenant**.
There is no `x-organization-slug` header, no org context interceptor, no
org-scoped cache keys, and **no `organizationId` on any CRM record**. A company,
a contact, a deal and an activity are scoped by nothing, because there is
nothing to scope them to.

What does exist is a **singleton workspace**: the Better Auth `organization`
plugin, holding one row whose id is the literal string `workspace`
(`WORKSPACE_ID`, defined in [`@crm/db`](../packages/db/src/workspace.ts) and
re-exported by `@crm/auth` — the agent reads workspace rows and does not depend
on the auth package, and one id must not be two strings). It is there to answer
three questions a CRM has to answer about *itself* — what is this company
called, who works here, and what do we sell — and for nothing else.

- **The id is a constant, never a parameter.** Every read says
  `where: { id: WORKSPACE_ID }`. The moment a function takes an
  `organizationId`, the plugin has become tenancy plumbing and the rule above
  is broken. If you are porting something from the Comp AI MVP, delete the org
  threading rather than stubbing it — an `organizationId` that is always the
  same value is a column, an index and a `where` clause that buy nothing.
- **Signing in is the join, and there is no invite flow.**
  `ensureWorkspaceMembership` runs in `databaseHooks.session.create.before`, so
  the workspace and the caller's `Member` row exist by the time any request is
  served. `ALLOWED_SIGN_IN` already decides who may sign in; an invitation
  would be a second, quieter answer to the same question. The plugin's
  `invitation` table is created because the plugin owns its own schema — it is
  unused, and nothing in this repo writes to it.
- **The first account is the owner; everyone after is a member.** When the
  workspace row is created the hook enrols *every user that already exists*,
  oldest first as owner — otherwise an install that predates the plugin shows
  an empty Members page until each person happens to sign in again, which looks
  identical to being broken.
- **`ensureWorkspaceMembership` degrades, it does not throw.** A failure there
  would fail the session create, which is to say it would lock everyone out of
  the CRM to protect a settings page. It logs, returns `undefined`, and the next
  sign-in retries — the hook runs on every session, so it is self-healing.
- **Permissions are read from one place.** `canRenameWorkspace` and
  `canChangeRole` in `@crm/auth` are what the service enforces *and* what the
  UI disables its controls on, so the button and the 403 can never disagree.
  They match the plugin's own default statements — owner and admin — rather
  than inventing a second model beside it. `WorkspaceService` adds the one
  invariant the plugin has no opinion about: **the last owner cannot be
  demoted.** It is enforced in a transaction that takes `FOR UPDATE` on the
  owner rows before counting them, because counting and then updating is two
  statements: two admins demoting the two remaining owners at the same moment
  both counted two and both wrote, and a workspace with no owner is a workspace
  nobody can rename or hand back. The lock makes the second one read the first
  one's result and refuse.
- **Reads and writes go through tRPC, not `authClient.organization.*`.**
  Renaming the workspace is data, not authentication, so it belongs on the data
  surface with everything else — see the next rule.
- **The name and the website are asked for once, at the door, and there is no
  skipping it.** Both fields are `required` in the form *and* in
  `updateWorkspaceInput`, so the website cannot be dropped later from the
  settings page either — a CRM that knows what we sell on Monday and not on
  Tuesday is worse than one that never knew. The gate only catches somebody who
  could *answer* it (`canRename`), so a member never meets a form they are
  forbidden to submit, and it posts the same `workspace.update` mutation as the
  settings page rather than a second write path.
- **The state is `onboardedAt` inside the organization's `metadata`, not a
  column beside it.** The plugin ships that blob and owns the table; a second
  timestamp column is a second place the same fact is recorded, and the two
  drifted the first time somebody wrote a website through a revision of
  `WorkspaceService.update` that predated the column. A row with a name, a
  website and a null timestamp is a workspace that has plainly answered the
  question and is asked it forever. `isOnboarded` and `markOnboarded` in
  [`@crm/db/workspace`](../packages/db/src/workspace.ts) are the only readers
  and the only writer; `markOnboarded` keeps the first answer and preserves
  every other key, because the blob is the plugin's, not ours.
- **The gate is `proxy.ts`, and it is answered once per browser.** It used to
  live in `(app)/layout.tsx`, which meant a `workspace.get` round trip on every
  navigation into the app to re-establish a fact that changes once in the life
  of an install — and a second, opposing redirect on the `/onboarding` page to
  stop the first one looping. Two redirects pointing at each other is not a
  gate, it is a latch waiting for the two reads to disagree.
  - **`getSessionCookie()` decides signed-in, not a session lookup.** That is
    Better Auth's documented optimistic check for proxy, and it is all a
    redirect needs; every page behind it still resolves the real session
    server-side through `requireGoogleAccess()`.
  - **The answer is cached in an httpOnly `crm.onboarded` cookie**, so the
    common path costs nothing and the tRPC read happens once — twice for the
    person who actually fills the form in, since the cookie lands on the
    navigation after the mutation. The proxy is the only writer; the form does
    not set it, because two writers is how this went wrong in the first place.
    Forging the cookie skips a setup form and grants nothing, which is why it
    can be a cookie at all.
  - **`/sign-in`, `/grant-access` and `/eve` are ungated.**
    `requireGoogleAccess()` redirects to `/grant-access`, so gating it would
    ping-pong against the onboarding redirect for anyone who signed in without
    both scopes.
  - **An unreachable API fails open.** `readOnboardingGate` returns `unknown`
    on a non-200, a timeout or a parse failure, and an unknown gate lets the
    request through without writing the cookie. The alternative is an install
    that cannot reach its own API redirecting every request to a form that
    cannot be submitted.
- **There is a second gate behind the first**, `/onboarding/research`, which
  asks for the Context API key that gives the agent somewhere to look — see
  [the environment rules](./environment.md#the-context-key-is-asked-for-not-configured).
  It is the same shape as the onboarding gate and shares its machinery: a read
  (`settings.researchKey`), a `required`/`settled`/`unknown` answer, an httpOnly
  marker so it is asked once per browser, and fail-open on an unreachable API.
  - **The order is fixed and the second read is not made early.** A rep who has
    not named the workspace goes to `/onboarding` and `settings.researchKey` is
    never called — there is no point asking the second question while the first
    is open, and the test pins that the call count stays at zero.
  - **A settled workspace is remembered even while the key is outstanding.**
    The marker is written onto the *redirect* to the key form, so the workspace
    is not re-read on every request during the window a rep is being asked
    something else.
  - **There is no way past it but to answer, and that is the point.** It had a
    Skip, and Skip was the one path that could strand an install: every company
    added afterwards sits `PENDING` waiting for a key nobody is going to be
    asked for again, and nothing anywhere says so. A gate whose escape hatch
    silently accumulates broken records is not a gate. If it should become
    optional again, the missing piece is somewhere that surfaces *N companies
    are waiting on a key* — not a link that hides the question.
  - **Settings → General is the same write.** `settings.setResearchKey` is
    posted by both, so there is one write path and no second opinion about what
    a valid key looks like — including the check: that mutation asks the agent
    whether Context recognises the key and refuses to save one that comes back
    `401`. See
    [the environment rules](./environment.md#the-context-key-is-asked-for-not-configured)
    for why the call is the agent's to make and why a check that cannot be made
    still saves.
- **The name arrives as a placeholder, not as an answer.** A workspace is
  created as `DEFAULT_WORKSPACE_NAME` — the literal string `CRM` — and the field
  is empty with that behind it. It used to be derived from the sign-in domain,
  which put `Trycomp` in the box as though somebody had typed it, and a guess
  presented as an answer is a guess that gets accepted.
- **The website is the field with a consequence.** Saving it queues the agent's
  `workspace-profile` task, and what comes back is read into the opening context
  of every session the agent runs — see
  [the agent's rules](./agent.md#every-session-also-knows-who-we-are). The API
  writes the row and decides nothing about it, which is what keeps this on the
  right side of the first rule in this file.
- **It is a hostname, and `normalizeDomain` is the one thing that says so.**
  `WorkspaceService.update` runs the field through the same helper a company's
  domain goes through (`apps/api/src/companies/domain.ts`) and rejects what
  comes back null, so the message about entering `acme.com` is now true — it
  used to strip `https://` and a trailing slash and store whatever was left,
  which meant a typed sentence was accepted, marked the workspace onboarded,
  and sent the agent to research a website that does not exist. A second
  hostname rule beside that helper would be a second answer to one question.
  The value is stored canonical (lower case, no `www.`, no path), so saving a
  website that was previously stored uncanonically counts as a *change*: the
  existing `WorkspaceProfile` stops matching and is dropped by `profileOf`, and
  the same save queues the research that replaces it. That is the intended
  order — a profile that no longer matches the website is a description of the
  company we used to be.

## SSO is a row, not a deployment

Google is the sign-in method a clone starts with. An install that has its own
identity provider adds one on **Settings → SSO**, and the whole of that
configuration is an `ssoProvider` row written by Better Auth's
[`sso` plugin](https://www.better-auth.com/docs/plugins/sso) — not an
environment variable, because a self-hoster's admin cannot redeploy.

- **OpenID Connect only.** `apps/api/src/sso` registers a provider from an
  issuer, a client id and a client secret; everything else — the authorization,
  token, JWKS and userinfo endpoints — is read from the issuer's discovery
  document at registration time. The plugin can do SAML as well and there is
  deliberately no UI for it: SAML needs an X.509 certificate and an SP signing
  key this app has nowhere to generate or keep, and a half-configured SAML
  provider fails at the IdP with an error nobody here can read.
- **The provider belongs to the workspace, and the id is still a constant.**
  `SsoService` passes `WORKSPACE_ID`; it is never an input. That is also what
  gives the plugin's own `sso/register` its permission check for free, and
  `canConfigureSso` in [`@crm/auth`](../packages/auth/src/sso.ts) is the second
  half — the same owner-or-admin answer the settings page disables its button
  on, beside `canRenameWorkspace`.
- **The management surface is tRPC; signing in is not.** Listing, adding and
  removing a provider is configuration, so it goes through `sso.*` like every
  other read and write. `authClient.signIn.sso()` stays on the auth client,
  because that one *is* authentication.
- **`sso.signInOptions` is the one public procedure in the app.** The sign-in
  page is unauthenticated and has to know what it may offer, so it returns each
  provider's id and the name to print on the button, plus whether a Google
  client is configured at all — nothing else. `sso.list` carries the issuer, the
  domains and the last four of the client id, and it — like `sso.settings`,
  `sso.register` and `sso.remove` — takes `AuthMiddleware` at the method rather
  than the router, which is what leaves `sso.signInOptions` open. A client
  secret is never read back out of any of them.
- **It is the API's answer, not the app's.** Both processes read one `.env`, but
  `/api/auth/*` is served by the API, so whether Google sign-in works is a fact
  about *its* environment. The app asking itself would be right until the day
  the two are deployed with different configuration, and then it would offer a
  button that 500s.
- **An install with neither says so.** No Google client and no provider is not
  an empty sign-in page: it is the one state where the reader is the person who
  can fix it, so `/sign-in` names the two variables to set. A read that *fails*
  is different and must not print that — an unreachable API is not a missing
  configuration, so the page falls back to offering Google.
- **A configured provider replaces the Google button, it does not disable
  Google.** `/sign-in?method=google` still offers it. Hiding is the point —
  locking an admin out of their own CRM because they typed an issuer URL wrong
  is not. It only offers it when there *is* a Google client, so the escape hatch
  is never a button that cannot work.
- **Signing in with an IdP does not cost you Gmail.** Google is two separate
  things here — a way to prove who you are, and a mailbox to read — and an
  install that replaced the first still wants the second. So Gmail and Calendar
  are a *connection* for an SSO rep, not a condition of entry: `needsGoogleGrant`
  in [`@crm/auth`](../packages/auth/src/scopes.ts) walls only an account whose
  sole sign-in row is Google, and Settings → Connections carries the button that
  links one. See [the sync rules](./environment.md#gmail-and-calendar-sync).
- **`ALLOWED_SIGN_IN` still decides who gets in.** SSO says where someone
  authenticates; the allow-list says whether that address may have an account,
  and `databaseHooks.user.create.before` enforces it on an SSO sign-up exactly
  as it does on a Google one. Two questions, one answer each.
- **The plugin does not do the workspace join.**
  `organizationProvisioning: { disabled: true }`, because
  `ensureWorkspaceMembership` already runs on every session create. Two things
  enrolling the same person is two things to keep in step.

## tRPC is the data surface; REST is for auth and health

Everything the app reads or writes goes through `nestjs-trpc` routers under
`/api/trpc`, wired in `apps/api/src/trpc`. The remaining REST controllers are
`/api/auth/*` (Better Auth) and `/health`.

- **One router per module**, named `*.router.ts` so the codegen glob finds it,
  carrying `@Router({ alias: "…" })` and `@UseMiddlewares(AuthMiddleware)`.
  A router with no `AuthMiddleware` is public — there is no other guard.
- **Routers are thin.** They validate input with zod and call a service; the
  Prisma work lives in `*.service.ts`, which is also where a REST controller or
  a background job would call in.
- **Services throw Nest's `HttpException` family** (`NotFoundException`,
  `BadRequestException`, …). `DomainErrorMiddleware` maps those onto tRPC error
  codes, so a service does not need to know it is being called over tRPC.
- **Filtering, sorting and pagination happen in Prisma.** List procedures take
  the shared `listInput` (`apps/api/src/trpc/list-input.ts`) and return
  `{ rows, total, facetCounts }`. Never return a whole table and filter in the
  browser, and never interpolate `sort` into a Prisma field name — resolve it
  through `resolveOrderBy` against the columns that module allows.
- **The router type is generated**, not hand-written:
  `bun run --filter=api trpc:generate` writes `src/generated/server.ts`, which
  the app imports as `type { AppRouter } from "api/app-router"`. `bun run dev`
  keeps it in watch mode. If the app cannot see a new procedure, the generator
  has not run.
- **`src/generated/server.ts` is committed, and `build` must never regenerate
  it.** The generator ships a native binary that needs GLIBC 2.39 — newer than
  Vercel's build image — so a `build` task that depends on `trpc:generate` fails
  every deploy. That is why `apps/api/.gitignore` ignores `src/generated/*` with
  a `!src/generated/server.ts` exception, and why only `check-types` and `dev`
  run the generator. Regenerate locally and commit the result with the router
  change that caused it.

## Not every address on a thread is a person

`externalParticipants` (`apps/api/src/google/participants.ts`) is the one gate
between what Google returns and what becomes a record, and it has to throw away
three different kinds of thing before it gets to a lead: **us** (the allow-list
domains and the `User` table), **a decision a rep made** (`SuppressedContact`,
`SuppressedDomain`), and **an address no human has ever read**.

The third is `isMachineAddress`, and it exists because of a company called
`group.calendar.google.com` with one contact on it named "Interviews
scheduled". A secondary Google calendar is invited to an event as an ordinary
attendee — it is not flagged `resource`, the way a meeting room is — so it
arrived with a display name and a plausible-looking domain and the sync did
exactly what it does for a stranger at a customer: made a person, made a
company, and queued research on both.

- **A machine domain never becomes a company.** `isMachineDomain` in
  `apps/api/src/companies/domain.ts` sits beside `FREE_EMAIL_DOMAINS` because
  the two answer the same question — *is this host a company* — and
  `domainFromEmail` returns `null` for both. That is the load-bearing half:
  `companyForEmail` is the only way a company is derived from an address, so a
  caller that never heard of this rule still cannot create one.
  `.calendar.google.com` covers the shared calendars, the rooms, the imported
  ICS feeds and the holiday calendars in one entry.
- **It matches the *host*, never a substring.** `calendar.acme.com` and
  `sendgrid.com` are somebody's real company; only the exact hosts and the
  listed suffixes are refused.
- **An opaque local part is the second door.** `c_f5ec…@` and a bare UUID are
  identifiers, not names, and they come from providers whose infrastructure
  hostname we have not learned yet. The patterns are deliberately narrow — 24
  hex characters or a formatted UUID — because the cost of a false positive
  here is a real customer who is silently never filed.
- **It is not a suppression, and it leaves no row.** A rep can still type any of
  these into the quick-add form; the rule is only that the *inbox* may not
  decide they are worth a record. `SuppressedContact` is for a person a rep
  deleted, and writing one for a calendar id would be recording a decision
  nobody made.
- **The attendee list is filtered too.** `syncAttendees` drops the same
  addresses beside `attendee.resource`, so a shared calendar is not listed as
  somebody who came to the meeting.

Shared inboxes and the machines that send invitations are a separate list,
`isAutomatedAddress` — `sales@`, `noreply@`, `bookings@`. That one is about the
*local part*, and it is the reason `support@acme.com` never becomes a lead at a
company we do genuinely sell to.

## Deleting a record is a decision the sync has to respect

Each of the three records can be deleted from the three-dot menu in its sheet —
`contacts.delete`, `companies.delete`, `deals.delete`, one confirm dialog each.
There is no soft delete and no archive: a row a rep meant to be gone that is
still in every list, facet and count is worse than either.

**A deleted contact is remembered by address.** Deleting the row is not enough,
because the Gmail and Calendar sync creates contacts from whoever is on a thread
— so the next message from that person put them straight back, with a fresh
`identify` task behind them, and the rep's only recourse was to delete them
again every few days. `ContactsService.delete` writes a `SuppressedContact` row
keyed on the email, and `externalParticipants`
(`apps/api/src/google/participants.ts`) drops that address exactly as it drops a
domain in `SuppressedDomain` — one filter, one place, so the address is
invisible to contact creation, company auto-creation and thread attribution at
once.

- **It suppresses the address, not the person.** A contact with no email cannot
  be recreated by the sync in the first place — the sync only knows people by
  address — so there is nothing to write down.
- **The key is the address as the sync will see it: lower case.**
  `parseAddress` lower-cases everything Google hands us, so a rep who typed
  `Paula.Marchetti@Fernhill.com` into the quick-add form and then deleted the
  contact left a suppression nothing would ever match, and the next thread put
  them straight back — the exact loop the row exists to break. `normalizeEmail`
  (`apps/api/src/crm/values.ts`) is the one canonicaliser, applied where a rep's
  typing enters the system: `contacts.create`, `contacts.update` and the
  suppression written by `contacts.delete`. The conflict check on create and
  `allowAgain` both match case-insensitively so a row written before this rule
  still answers.
- **The address is taken from the delete itself, not from a read before it.**
  `contacts.delete` runs `tx.contact.delete({ select: { email: true } })` inside
  the transaction and suppresses what comes back, so the row it writes down is
  the address the contact had at the moment it ceased to exist. A pre-check read
  is a different question asked earlier: a rep correcting the address in one tab
  while another deletes the record left the old address suppressed and the new
  one open, which is the same recreated-contact loop wearing a different hat.
  It is also what supplies the name in the `reason`, and the 404 — a missing
  contact is now the delete's own `P2025` through `translate`, rather than a
  pre-check that a concurrent delete could pass.
- **The colleagues are untouched.** Only the deleted address is filtered, so a
  thread with three other people at that company still files against them. A
  thread where the deleted person was the *only* outsider files against nobody,
  which is the correct reading of "we do not track this person".
- **A rep can always add them back, and doing so lifts the suppression.**
  `allowAgain` runs on `contacts.create` and on an `update` that sets the email,
  **inside the same transaction as the write**. Outside it, a database blip
  between the two left a contact the sync still ignores, and the retry hit the
  "already uses that email" conflict — a record a rep can see and cannot fix.
  The rule is *not added back automatically* — somebody typing the address in is
  not the inbox making the decision for them.
- **Deleting a company does not suppress its domain.** Its people survive the
  delete with no company, and a domain-wide suppression would silently stop
  filing their email too. Turning off a whole domain stays the explicit control
  on Settings → Connections, where it says what it does.

**What the database does not cascade, the service does.** `AgentTask` and
`AgentEvent` carry a `contactId` and a `companyId` as plain columns with no
foreign key — they outlive the records they name on purpose, so the queue
survives a redeploy — which means a delete has to clear them itself. Leaving
them behind queues research about a person who no longer exists, and the
dispatcher spends a session finding that out.

**The stamps are then recomputed on the records the delete actually reached,
and no others.** Deleting a record deletes its activities, and `lastActivityAt`
on whatever else those activities touched is a cached maximum that nothing else
recomputes — a company whose only recent activity was on a deleted deal would
sort as though the work were still fresh, forever.

- **The affected set is read before the rows go, inside the delete's own
  transaction.** `ActivityStampService.targetsOf(where)` groups the activities a
  delete is about to destroy by each of their three foreign keys and hands back
  the ids; `recomputeMany` restamps exactly those rows, one `UPDATE … SET
  lastActivityAt = (SELECT MAX(…))` per table, which covers "has newer
  activities" and "has none left, so null" in the same statement. Reading it
  after the delete is not an option — the evidence is what was deleted.
- **A company's `where` follows the deals it takes with it**, `{ OR: [{
  companyId }, { deal: { companyId } }] }`. Deleting a company cascades to its
  deals and those cascade to their activities, so a surviving contact whose only
  activity hung off one of those deals would keep a stamp for work that no
  longer exists. `test/record-delete.spec.ts` pins that branch specifically.
- **`recomputeAll()` is still there and is still right for a purge.** It rebuilds
  every stamp in the CRM with six full-table statements, which is what
  disconnecting Google and dropping everything it synced needs. It is the wrong
  tool for deleting one record: it made the cost of removing a contact a
  function of the size of the entire CRM, and it repaired rows the rep's action
  never touched.

**Recomputing runs after the delete has committed, so it logs rather than
throws.** The
row is already gone by the time the stamps are rebuilt; letting that failure out
reports a completed destructive action as a failure, the browser never
invalidates its caches, and the rep's retry answers `No contact with id …`. A
stale sort order is a smaller wrong than that, and the next delete or
reconnection recomputes it. The delete itself is still translated: a record
removed between the pre-check and the delete is the documented 404, not a P2025
escaping as a 500.

## Freshness: invalidate the query, don't disable the cache

There is no HTTP response cache in front of tRPC. Freshness is TanStack Query's
job: a mutation invalidates the query keys it affected, and the list refetches.

- **Invalidate on the client, in the mutation's `onSuccess`** — but **through
  `useCrmCache()`** (`apps/app/lib/trpc/cache.ts`), not by listing keys at the
  call site. Say *what changed* (`cache.deal(id)`, `cache.company(id)`,
  `cache.contact(id)`, `cache.activity()`) and the module owns the fan-out. Twelve
  hand-written key lists is how they drifted: a stage change did not refresh the
  timeline entry it writes, creating a deal did not refresh the board, and nothing
  refreshed the overview, so a rep could close a deal and watch their own numbers
  not move. **A new mutation adds a call there, not a new list of keys.**
- **A deletion is `cache.removed(ref)`, and it is the one call that skips a
  key.** Everything a deletion can reach is refreshed together — the lists, the
  timeline, the dashboard, and the other records that named this one, since a
  colleague list and a deal's attendees both go stale the moment a contact goes.
  The deleted record's *own* `byId` entry is invalidated with
  `refetchType: "none"`, which is the one place that option is right: its query
  is still mounted for the moment it takes the sheet to animate shut, so a
  refetch asks the API for a row that no longer exists and the sheet reads the
  404 as "this record could not be loaded" on its way out. Marking it stale
  without refetching keeps the closing sheet quiet *and* stops the entry being
  served from cache — `staleTime` is 30 seconds, so leaving it untouched meant a
  rep who reopened the record from a stale link or the back button read half a
  minute of a record that no longer exists. One wide fan-out is right here
  because deleting is rare and touches more than any edit does.
- **Pass `{ settle: "record" }`** when the caller is an inline editor. The
  default waits for every affected view to refetch, which is right when the point
  of the action *is* the view changing (a card moving between board columns);
  `"record"` waits only for the edited record so the field's spinner clears as
  soon as the value under it is right, and lets the table behind the sheet catch
  up on its own.
- **An infinite query needs `pathKey()`, not `queryKey()`.** tRPC stamps the
  query type into the key, so `queryKey()` yields `{ type: "query" }` and
  `infiniteQueryOptions` caches under `{ type: "infinite" }` — the two cannot
  partially match, and invalidating with the wrong one is silent: it reports
  success, refetches the sibling non-infinite queries, and leaves the infinite
  one stale until a reload. `pathKey()` carries no type and matches both, which
  is what you want whenever a procedure is read both ways (`activities.timeline`
  is, as a paged history and as a pinned top-ten).
- **`cache-manager` is still there** (`apps/api/src/cache`, Redis when
  `REDIS_URL` is set) but it is used deliberately, per value, by services that
  want it — `AuthService.getProfile` is the model: read through, write on miss,
  and an explicit `invalidateProfile` on change. It is not a global interceptor,
  so nothing is cached unless a service asks for it.
- **Background writes the browser cannot see** — enrichment finishing, most
  obviously — are not invalidations at all, because no client action caused
  them. Poll for those: `refetchInterval` while the record's status is
  `PENDING`/`RUNNING`, and stop once it settles. Use `isEnriching()` and
  `ENRICHMENT_POLL_MS` from `components/crm/enrichment-status` so the rule is one
  definition. **A list polls too, not just the record sheet** — the company sheet
  polled and the companies table did not, so a newly added company's logo and
  industry appeared in the sheet and stayed blank in the table behind it until a
  reload.
