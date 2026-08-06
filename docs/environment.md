# Environment

Setup, DB commands, Google Cloud and the `vercel env pull` hazard: `docs/setup.md`.

## One `.env`, at the repo root

`.env.example` **is the documentation** — every variable the repo reads, with a note,
and nothing that is not read. `packages/env` walks up to the workspace root and reads
`.env`, then `.env.local` on top.

- **Real environment variables always win** — the loader never overwrites
  `process.env`, so Vercel/Docker/CI takes precedence.
- **Never add a per-package `.env`.** Four once existed with duplicate
  `DATABASE_URL`/`BETTER_AUTH_SECRET`; when they drifted the API minted a cookie the
  app could not verify and the browser bounced between `/sign-in` and `/` forever.
- **The root marker is a `package.json` declaring `workspaces`** — stopping at the
  first `turbo.json` resolves the API's root to `apps/api`.

## Required

`DATABASE_URL`, `BETTER_AUTH_SECRET`, `ALLOWED_SIGN_IN`. Everything else has a
localhost default or is genuinely optional.

**`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`** are the sign-in button *and* the
Gmail/Calendar sync — optional, so an SSO-only install needn't create a Google project,
but **set together or not at all** (`packages/auth/src/env.ts` throws on one).

**`ALLOWED_SIGN_IN`** — comma-separated whole domains or single addresses (bare
addresses exist for a solo self-hoster, where `gmail.com` would be an open door). **One
list, read by the sign-in guard *and* the sync's "which side is external" decision** —
if they drifted a colleague would be refused at the door or filed as a lead. **An empty
list fails closed.** Parsed on demand. `packages/auth/src/workspace.ts`.

## Where things are

- **`API_URL`** (`:3001`) mints session cookies and serves `/api/auth/*`;
  `next.config.ts` republishes it as `NEXT_PUBLIC_API_URL`, so one variable does both
  sides. `BETTER_AUTH_URL` is a legacy fallback.
- **`APP_URL`** (`:3000`) is also the trusted-origin and `callbackURL` allow-list.
- **`AUTH_COOKIE_DOMAIN`** only for API and app on different subdomains of one parent.
- **`AGENT_URL`** is the agent's deployment, server-side only, and **must include the
  scheme** — validated at boot, or it throws when a task is queued instead.
- **`AUTH_COOKIE_PREFIX` is `crm`** (`@crm/auth/cookies`), set on **both**
  `advanced.cookiePrefix` in `auth.ts` and `getSessionCookie(request, { cookiePrefix })`
  in `proxy.ts` — one alone redirects every signed-in request. Better Auth's default
  collides with any neighbour on a shared parent domain, silently: sign-in completes,
  the row is written, every reader resolves `null`. **Changing it signs everybody out.**

## `IS_MARKETING` — landing page flag, off by default

`"true"` serves `app/(landing)` at `/`; anything else sends a signed-out visitor to
`/sign-in`, because the page markets *this* product.

`AUTH_COOKIE_PREFIX` in [`@crm/auth/cookies`](../packages/auth/src/cookies.ts)
is the literal string `crm`, so the session cookie is
`__Secure-crm.session_token` rather than Better Auth's default
`__Secure-better-auth.session_token`.

The default is a hazard for any install whose app shares a parent domain with
something else — `crm.example.com` beside an existing `app.example.com`. A
cookie set with `Domain=.example.com` by the neighbour is sent to *us* too,
under a name identical to ours, and `parseCookies` keeps one value per name. The
failure is silent and reads as a deployment problem rather than a naming one:
sign-in completes, the `session` row is written with a week's expiry, the
browser holds a cookie, and then every reader — the API that minted it and the
app alike — resolves it to `null` and bounces to `/sign-in`. Nothing logs an
error, because nothing has errored.

Two things follow. It is set on the **server config and the proxy's read**
together: `advanced.cookiePrefix` in `auth.ts` names the cookie and
`getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX })` in
`apps/app/proxy.ts` looks for it, and a prefix changed in one place only is a
gate that redirects every signed-in request. And **changing it signs everybody
out** — the old cookies stop matching. That is a one-time cost paid on deploy,
not a loop: a stale `better-auth`-prefixed cookie no longer matches, so the
proxy sends the reader to `/sign-in`, which is where they need to be.
- **`AGENT_URL`** is the research agent, which is its own deployment. The app
  reads it to proxy the bridge and the API reads it to poke the dispatcher, both
  server-side only: the browser never learns the agent has an origin of its own.
  It must be a whole URL including the scheme, and the API validates that at
  boot — `new URL("/internal/crm/dispatch", base)` throws on `127.0.0.1:2000`,
  and it would throw at the moment a task is queued rather than at startup. See
  [the agent bridge](./agent.md#the-bridge).
- **`AGENT_PORT`** defaults the self-hosted Eve process to `2000`, matching
  `AGENT_URL`. A host-provided `PORT` still wins when `AGENT_PORT` is unset.

- **Only the literal `true`** (same shape as `PRISMA_LOG_QUERIES`).
- **It decides one thing**: what a stranger at `/` sees.
- **`isMarketing()` (`apps/app/lib/env.ts`) reads per request**, so a config change
  needs no rebuild. Declared in `apps/app/turbo.json` `passThroughEnv`.

## Typed, validated env

`apps/api/src/config/env.validation.ts` runs via `ConfigModule.forRoot({ validate })`,
and lists every variable the API reads and nothing else.

- **Validation runs while `AppModule` is evaluated** — a test must set variables before
  importing it (see the dynamic `import()` in `test/auth.e2e.spec.ts`).
- **The schema is the API's, not the repo's** — `@crm/auth` and the agent read their own.

## Optional: what the agent can do

Every outside source is optional and the agent runs with none. A missing key removes a
place to look; **never an error, never throws**. `agent/lib/capabilities.ts` is the
single place that knows what is set.

| Variable | What it adds |
| --- | --- |
| `PERPLEXITY_API_KEY` | Open-web research with citations; finds a LinkedIn slug |
| `RAPIDAPI_KEY` | LinkedIn profiles via LinkDAPI |
| `GITHUB_TOKEN` | Raises the GitHub rate limit from 60/hour |
| `BLOB_READ_WRITE_TOKEN` | Mirrors logos and photos into Blob |
| `AI_GATEWAY_API_KEY` | The model. Not needed on Vercel (OIDC) |
| `AGENT_BRIDGE_SECRET` | The rep-facing Agent panel — see `agent.md` |

`BLOB_READ_WRITE_TOKEN` is also in `env.validation.ts` and `apps/api/turbo.json`
because the API and the seed write pictures too. The Next.js app is deliberately
excluded — recognising our URL for the image optimizer needs no token.

### The Context key is asked for, not configured

**`CONTEXT_DEV_API_KEY` is not a variable here and must not become one.** The key lives
in `AppSetting`, is asked for at `/onboarding/research`, and changes on Settings →
General — an admin who cannot redeploy cannot set a variable.

Same reason as [SSO](./api.md#sso-is-a-row-not-a-deployment): an admin who
cannot redeploy cannot set an environment variable. It goes further than SSO
does, because this is not a key an install can sensibly do without — it decides
whether a company arrives as itself or as a grey square with its initials in
it — so [the proxy asks for it](./api.md#the-gate-is-proxyts-and-it-is-answered-once-per-browser)
rather than leaving it to be discovered on a settings page nobody visits.

- **An install that had the variable set is asked for the key again, and that
  is the intended upgrade.** Nothing adopts the old value — no boot-time
  migration, no fallback — so the first navigation after deploying lands
  everyone on `/onboarding/research`, where they paste the key they already
  have. It is one interruption, once, in exchange for the answer living in one
  place rather than two — and it cannot be dismissed, because a dismissed gate
  is an install quietly filling up with companies that have no logo.
- **Nothing is lost in the meantime, and the wait is not a queue.** A `brand`
  task with nowhere to look is consumed and marked done — but it settles
  `SKIPPED` *before* anything marks the row `RUNNING`, and `settle` only writes
  over a `RUNNING` row, so the company stays `PENDING`. `PENDING` is exactly
  what the sign-in sweep re-queues, so the work is recovered from the record
  rather than held in the queue. `test/keyless-brand.integration.spec.ts` pins
  it, because a `settle` that wrote unconditionally would strand every company
  added before the key with nothing to say so.
- **Saving the key picks that work up immediately.**
  `settings.setResearchKey` runs the company sweep itself rather than leaving it
  to the next sign-in, because the person who just fixed it is standing there.
  It is fire-and-forget: a sweep that fails logs and the sign-in one still
  catches up. Contacts are not swept here — only one of the three portrait
  sources is Context — and they are picked up on the next sign-in as before.
- **`readContextDevKey` in [`@crm/db/settings`](../packages/db/src/settings.ts)
  is the only reader**, and it reads one column. Everything downstream —
  `contextDevKey()` in the agent's `capabilities.ts`, the client in
  `lib/context-dev.ts`, the API's `settings.researchKey` — goes through it, so
  there is exactly one place that knows where the key is kept.
- **It is read live, not at boot.** There is no cache in front of it, so a key
  pasted into the settings page applies to the very next vendor call rather than
  to the next deployment. Each read is one indexed row in front of a lookup that
  is about to make an HTTP request anyway.
- **A database that cannot be read is a capability that is off**, not an
  exception. `contextDevKey()` logs and returns null, because a missing source
  must never throw — the rule at the top of this section, and the reason the
  agent keeps running against everything else it has.
- **The key is never read back.** The API returns whether one is set and its
  last four characters, and nothing returns the key itself. Same rule as an SSO
  client secret.
- **A wrong key is refused at the point it is typed, and the agent is what
  checks it.** Checking means calling Context, and [a vendor client in the API
  is a bug](./api.md#intelligence-never-lives-in-the-api) — so
  `settings.setResearchKey` asks the agent over the bridge
  (`POST /internal/crm/verify-key`) and only writes the row if the answer is not
  *invalid*. The agent already owns the client, the error classification and the
  key, so nothing about Context.dev is learned twice.
  - **The probe costs nothing.** A brand lookup only bills when it resolves a
    brand, and a free-provider address is refused with a documented `422`
    before any resolution — so `key-check@gmail.com` reaches Context, proves
    the key authenticates, and is never billed. Measured at about half a second.
  - **An authentication status does not necessarily mean the key is wrong.**
    Context returns `401` for an exhausted free-tier allowance as well as for
    an invalid key, and `401` or `403` can also represent insufficient credits
    or permissions. `classifyKey` inspects the stable error code and response
    message before rejecting a key; quota, plan, rate-limit and permission
    responses prove the key was recognised and allow it to be saved.
    `test/verify-key.spec.ts` pins those branches.
  - **A check that cannot be made is not a failed check.** No
    `AGENT_BRIDGE_SECRET`, an agent that is down, a timeout — all return
    `unknown`, and an unknown answer *saves the key* and logs that it went in
    unverified. The alternative is an install whose agent is not up yet being
    unable to finish onboarding, which is a worse failure than an unchecked
    key: the key is still checked by the first task that uses it.

`BLOB_READ_WRITE_TOKEN` is the one entry in that table the agent does not own
alone, which is why it is also declared in `apps/api/src/config/env.validation.ts`
and in `apps/api/turbo.json`. The API writes two pictures of its own — the
favicon a domain serves, and the Google avatar of anyone who signs in — and
`packages/db/prisma/seed.ts` writes fifteen. The Next.js app is deliberately
*not* on that list: it only has to recognise one of our URLs to route it through
the image optimizer, and recognising one needs no token. See
[the agent's picture rules](./agent.md#pictures-are-copied-never-linked).

- **An install that had the variable is asked again**: no migration, no fallback, and
  **the gate cannot be dismissed**.
- **Nothing is lost while waiting.** A keyless `brand` task settles `SKIPPED` *before*
  anything marks the row `RUNNING`, and `settle` only overwrites `RUNNING` — so the
  company stays `PENDING`, which the sweep re-queues
  (`test/keyless-brand.integration.spec.ts`).
- **Saving the key runs the company sweep immediately** (fire-and-forget).
- **`readContextDevKey` (`@crm/db/settings`) is the only reader**, read live with no
  cache. An unreadable database is a capability that is off, not an exception.
- **The key is never read back** — only whether one is set, and its last four.
- **The agent checks it, not the API** (a vendor client in the API is a bug):
  `settings.setResearchKey` calls `POST /internal/crm/verify-key` and writes unless the
  answer is *invalid*. **`401` is the only answer meaning the key is wrong**, and **a
  check that cannot be made is not a failed check** — `unknown` saves anyway and logs it
  unverified.

## Gmail and Calendar sync

Always on, on the existing Google provider, so there is no extra redirect URI. Scopes
are requested at sign-in and gated by `requireGoogleAccess()`, because granular consent
lets a user untick one and still sign in.

**An SSO rep is not gated** — `needsGoogleGrant` (`@crm/auth`) walls only an account
whose *sole* sign-in row is Google. It cannot be "has the scopes": an SSO rep has no
Google account to grant on, and `revoke()` keeps the `account` row, so trying the
optional feature and revoking would lock them out. They connect from Settings →
Connections, posting the same `linkSocial` call.

**Sync is forward-only** — Gmail records the current `historyId` on its first pass and
imports nothing; Calendar reads from `now`.

**`CRON_SECRET`** (min 16 chars) guards `POST /internal/sync/google` and
`/internal/sync/rates`; both **fail closed when unset**. **Crons live in
`apps/api/vercel.json`** — Google `*/5 * * * *`, rates daily. Minute-level schedules
need a Pro plan; on Hobby it silently becomes daily.

Deliberate absences: **no `GOOGLE_SYNC_ENABLED`** (a switch that can disable a mandatory
feature is only ever wrong), **no `GOOGLE_WORKSPACE_DOMAIN`** (`ALLOWED_SIGN_IN` already
says who is internal — two sources is how a colleague becomes a lead), **no
`GMAIL_BACKFILL_DAYS`**, **no rate provider variable**.

## Telemetry is on, and turning it off is one variable

`CRM_TELEMETRY_DISABLED="1"` — or `DO_NOT_TRACK=1`, honoured identically — and nothing
is sent. No client is constructed, so there is no queue waiting to flush later.

- **Server side only**, `posthog-node` in the API and the agent. **`posthog-js`
  appears once, on the `trycrm.ai` landing page**, and nowhere a record can be
  reached: autocapture on a CRM would lift contact names and deal amounts out of
  somebody else's database. That one import is gated on
  `window.location.hostname`, not on `IS_MARKETING` — turning the landing page on
  for your own domain never loads it. `docs/telemetry.md`.
- **There is no variable for the destination.** The project key and host are
  constants in `packages/telemetry/src/project.ts`. A `phc_` key is write-only —
  it can send events and read nothing back — so making it configurable would
  only imply it were a secret. Edit the constants to point somewhere else.
- **The install ID is a row, not a file** — `install`, one row, UUID written by
  the migration. Vercel's filesystem is ephemeral, so `~/.crm/telemetry-id`
  would count containers.
- Declared in `env.validation.ts` as optional, like everything else here. Every
  event and the never-sent list are in **`docs/telemetry.md`**.

## Not env vars

Two things to do in Google Cloud before this works:

- **Enable the Gmail API and the Google Calendar API** on the project.
- **Set the consent screen to User type: Internal** if you are on Google
  Workspace. `gmail.readonly` is a *restricted* scope; an External app using it
  needs OAuth verification plus an annual CASA security assessment, while an
  Internal app needs no further review. Going External later means the full
  review, so this is a decision, not a checkbox.

The cron is declared in `apps/api/vercel.json` at `*/5 * * * *`. Minute-level
schedules need a Pro plan; on Hobby it silently becomes daily.

## Database

Prisma is driven through turbo from the repo root: `db:generate`, `db:migrate`,
`db:push`, `db:reset`, `db:seed`, `db:studio`, `db:deploy`. Config lives in
`packages/db/prisma.config.ts`, which loads the root `.env` itself, so the CLI
works without any app running.

`bun run dev` prepares the local database before starting any service. It
applies pending migrations, refuses schema drift, generates Prisma Client, and
then starts dependency-aware watchers. A schema or migration change reruns that
preparation and restarts the Prisma consumers only after generation completes.
The preparation step uses the same local-database guard as destructive dev
commands; `ALLOW_REMOTE_DB=1` is required to opt into a remote development
database deliberately.

## What is not an env var

- **Cache TTL default** — `DEFAULT_TTL_MS` (60s) is a constant in
  `apps/api/src/cache/cache.module.ts`. `CACHE_TTL_MS` only overrides it.
- **Redis** — optional. Without `REDIS_URL` the cache falls back to a
  per-instance in-memory store, which is fine for local work and wrong for any
  multi-instance deploy (see `docs/api.md`).
- **Sign-in method** — Google is the built-in one and it is in code. An
  install that wants its own identity provider adds one on the SSO settings
  page, and that is a row rather than a variable — see
  [SSO](./api.md#sso-is-a-row-not-a-deployment).

## `vercel env pull` writes to `.env.local`, which wins

The two conventions collide, and the collision is quiet:

- `.env.local` is the *local override* file, so the loader reads it **after**
  `.env` and it wins.
- `vercel env pull` writes **production** credentials into that same file by
  default — database, auth secret, OAuth client, Blob, Redis, the lot.

Pull once and every process in the repo silently points at production. The
symptom is not an error; it is `bun run dev` working perfectly against the live
database, and `prisma migrate dev` in `packages/db` applying migrations to it.
That happened here on 2026-08-01: eleven migrations landed on Neon from a
laptop, and only the backfill in `20260801140000_contact_intelligence` kept it
from dropping three columns of real data.

Two defences, and you want both:

1. **Pull somewhere inert.** `vercel env pull .env.vercel` — the loader does not
   read it, so it is reference material rather than configuration.
2. **The destructive `db:*` scripts refuse a non-local host.**
   `packages/db/scripts/require-local-db.ts` guards `db:migrate`, `db:push`,
   `db:reset` and `db:seed`, prints which file the URL came from, and takes
   `ALLOW_REMOTE_DB=1` when you mean it. `db:deploy` is deliberately unguarded —
   pointing that at a remote database is what it is for.

The guard resolves the URL by reading the root files directly, in the loader's
order, rather than trusting `process.env`. That is not fussiness: Bun
auto-loads the `.env` in the *working directory* before running a script, while
Prisma's CLI is a Node process that only sees `@crm/env/load`. The first version
of the guard read `process.env`, saw the `packages/db/.env` copy, and waved the
Neon case through. A guard that is wrong in that direction is worse than none.

## Secrets hygiene

The root `.gitignore` ignores `.env` and `.env.*` with a single negation for
`.env.example`, so a backup like `.env.bak` or `.env.old` is ignored too rather
than committed by a stray `git add -A`. `.env.example` is the only env file in
the repository, and it ships no value that is a secret — the placeholders are
empty strings, and `packages/env/test/root.spec.ts` asserts that they stay that
way.

Generate your own secret. Never reuse one from an example file, a tutorial, or
another environment: `openssl rand -base64 32`.

- **Cache TTL** — `DEFAULT_TTL_MS` (60s) in `cache.module.ts`; `CACHE_TTL_MS` overrides.
- **Redis** — optional; without `REDIS_URL` the cache is per-instance in-memory, which
  is wrong for multi-instance.
- **Sign-in method** — Google is in code; an IdP is a row (SSO, in `api.md`).
