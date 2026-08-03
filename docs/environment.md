# Environment

## One `.env`, at the root of the repo

Copy [`.env.example`](../.env.example) to `.env` and fill in the five required
values. That file is the documentation — every variable the repo reads is in it,
with a note on what it does, and nothing that is not read is in it.

```sh
cp .env.example .env
```

It is loaded by [`packages/env`](../packages/env), which walks up from the
process's working directory to the workspace root and reads `.env`, then
`.env.local` on top. Every process gets there:

| Process | How it picks the file up |
| --- | --- |
| The NestJS API | `@crm/db` and `@crm/auth` both `import "@crm/env/load"` before reading anything |
| The Next.js app | `next.config.ts` calls `loadRootEnv()`, then republishes `API_URL` as `NEXT_PUBLIC_API_URL` |
| The agent | `agent/agent.ts` and `@crm/db` |
| The Prisma CLI | `packages/db/prisma.config.ts` |

**Real environment variables always win.** The loader never overwrites a value
already present in `process.env`, so a platform's own configuration — Vercel,
Docker, systemd, CI — takes precedence and the file is purely a local
convenience. With no `.env` at all the loader is a no-op and each consumer
reports by name what it is missing.

There used to be four files (`apps/api/.env`, `apps/app/.env`,
`packages/db/.env`, `apps/agent/.env`), three of which had to hold identical
copies of `DATABASE_URL` and `BETTER_AUTH_SECRET`. Files that must agree are
files that can disagree, and the failure was not an error: the API would mint a
session cookie the app could not verify, so the browser bounced between
`/sign-in` and `/` forever. If you still have those files from an older
checkout, delete them.

### Finding the root

The marker is a `package.json` that declares `workspaces` — the one thing only
the root has. Neither obvious alternative works: every package has a
`package.json`, and `apps/api` and `apps/agent` have their own `turbo.json`. A
walk that stops at the first `turbo.json` resolves the API's root to
`apps/api`, reads a file that is not there, and the symptom surfaces three
frames away as a missing variable. `packages/env/test/root.spec.ts` pins this.

## What is required

Five values, and the API refuses to start without them.

| Variable | Why it has no default |
| --- | --- |
| `DATABASE_URL` | `docker compose up -d` starts a Postgres that matches `.env.example` exactly |
| `BETTER_AUTH_SECRET` | Signs session cookies. `openssl rand -base64 32` |
| `ALLOWED_SIGN_IN` | The entire authorisation model — see below |
| `GOOGLE_CLIENT_ID` | Google is the only sign-in method |
| `GOOGLE_CLIENT_SECRET` | |

Everything else has a working localhost default or is genuinely optional. That
is the difference between a clone that runs and a clone that makes you read a
table of variables first.

### `ALLOWED_SIGN_IN`

Who may sign in, comma-separated, each entry either a whole email domain or a
single address:

```sh
ALLOWED_SIGN_IN="acme.com"                       # everyone at a workspace
ALLOWED_SIGN_IN="acme.com,contractor@gmail.com"  # …plus one outsider
ALLOWED_SIGN_IN="you@gmail.com"                  # a one-person install
```

Bare addresses exist for the third case: a solo self-hoster on a consumer
mailbox has no domain to name, and `gmail.com` would be an open door.

One list, read by two things that must never disagree — the sign-in guard and
the sync's decision about which side of a conversation is external. If they
drifted, a colleague's address would either be refused at the door or filed as
a sales lead.

**An empty list fails closed**: nobody signs in until it is set. The other
choice would be a CRM full of real customer data that any Google account can
read, and it would look like it was working. It is parsed on demand rather than
at import, so the Better Auth CLI — which loads `auth.ts` in a process with no
`.env` — and the tests can both set it themselves.

Live in `packages/auth/src/workspace.ts`.

## Where things are

`API_URL` and `APP_URL` default to `http://localhost:3001` and
`http://localhost:3000`. Set them for any real deployment.

- **`API_URL`** is the origin that mints session cookies and serves
  `/api/auth/*`. `next.config.ts` republishes it as `NEXT_PUBLIC_API_URL`, which
  is what the browser's auth client and tRPC proxy use — so one variable
  configures both sides. `BETTER_AUTH_URL` is still read as a fallback because
  Better Auth's own tooling looks for it, but `API_URL` is the name to use.
- **`APP_URL`** is where the browser is, and it is also the trusted-origin
  allow-list: the set of origins allowed to call the API with credentials, and
  the list Better Auth validates post-sign-in `callbackURL`s against.
  Comma-separate if the app is genuinely served from more than one origin; the
  first is canonical. This replaced a separate `AUTH_TRUSTED_ORIGINS`, which
  could only ever disagree with it.
- **`AUTH_COOKIE_DOMAIN`** only when the API and the app are on different
  subdomains of one parent — then `.example.com`, so one cookie covers both. On
  localhost the shared cookie already works, because cookies ignore ports.
- **`AGENT_URL`** is the research agent, which is its own deployment. Only the
  app reads it, and only server-side: the browser never learns the agent has an
  origin of its own. See [the agent bridge](./agent.md#the-bridge).

## Typed, validated env

`apps/api/src/config/env.validation.ts` is a `class-validator` schema run by
`ConfigModule.forRoot({ validate })`, so the API fails at boot with a named
error rather than at three in the morning with `undefined`. It lists every
variable the API reads and nothing else — a variable that exists but is never
read is a question a self-hoster has to answer for no reason.

Two sharp edges:

- **Validation runs while `AppModule` is being evaluated.** A test that needs to
  set a variable has to do it before importing that module — see the dynamic
  `import()` in `apps/api/test/auth.e2e.spec.ts`.
- **The schema is the API's, not the repo's.** `@crm/auth` and the agent read
  their own values directly, because they run in processes Nest does not own.

## Optional: what the agent can do

Every outside source the agent can reach is optional, and it is designed to run
with none of them. A missing key removes a place to look; it is never an error.

| Variable | What it adds |
| --- | --- |
| `PERPLEXITY_API_KEY` | Open-web research with citations, and the search that finds a LinkedIn slug |
| `RAPIDAPI_KEY` | LinkedIn profiles via LinkDAPI — name, title, employer, tenure |
| `CONTEXT_DEV_API_KEY` | Company logo, industry, location and socials from a domain |
| `GITHUB_TOKEN` | Raises the GitHub rate limit from 60/hour when matching profiles |
| `BLOB_READ_WRITE_TOKEN` | Mirrors every logo and profile picture into Vercel Blob rather than linking them. Read by the API and the seed too — see below |
| `AI_GATEWAY_API_KEY` | The model. Not needed on Vercel, where OIDC handles it |
| `AGENT_BRIDGE_SECRET` | Lets a rep talk to the agent from the contact sheet — [the bridge](./agent.md#the-bridge) |

`apps/agent/agent/lib/capabilities.ts` is the single place that knows which are
set. It prints the list at startup, states it in the session instructions so the
agent plans around what it actually has, and gives the tools a shared
"not configured, and retrying will not help" result — checked *before* the
research budget is charged, so an install without a key does not pay for the
discovery on every contact.

`BLOB_READ_WRITE_TOKEN` is the one entry in that table the agent does not own
alone, which is why it is also declared in `apps/api/src/config/env.validation.ts`
and in `apps/api/turbo.json`. The API writes two pictures of its own — the
favicon a domain serves, and the Google avatar of anyone who signs in — and
`packages/db/prisma/seed.ts` writes fifteen. The Next.js app is deliberately
*not* on that list: it only has to recognise one of our URLs to route it through
the image optimizer, and recognising one needs no token. See
[the agent's picture rules](./agent.md#pictures-are-copied-never-linked).

## Gmail and Calendar sync

Always on. Same OAuth client, same callback — the two read-only scopes are added
to the existing Google provider rather than to a second one, so there is no
extra redirect URI to register.

The scopes are requested **at sign-in** and are a condition of using the CRM:
`requireGoogleAccess()` gates the app shell on what Google actually granted,
because granular consent lets a user untick a scope and still complete sign-in.
Anyone missing either scope is sent to `/grant-access` to re-consent.

**Sync is forward-only.** Nothing from before a mailbox was first seen is
imported: Gmail records the current `historyId` on its first pass and imports
nothing, and Calendar reads from `now` onwards.

| Variable | Required | Notes |
| --- | --- | --- |
| `CRON_SECRET` | in deployed environments | Bearer guard on `POST /internal/sync/google`. Vercel sends it automatically as `Authorization: Bearer $CRON_SECRET`. Minimum 16 characters; the route **fails closed** if unset, so locally the cron simply never runs. |

The absences are deliberate:

- **No `GOOGLE_SYNC_ENABLED`.** A feature flag earns its keep when it gates
  something that can genuinely be absent — `PERPLEXITY_API_KEY` does, because
  without a key there is no call to make. Sync has everything it needs the
  moment the app boots. A switch that can turn off a mandatory feature,
  defaulting to off, is a switch that is only ever wrong.
- **No `GOOGLE_WORKSPACE_DOMAIN`.** `ALLOWED_SIGN_IN` already says who is
  internal, and it is seeded into the sync's "us" set alongside the `User`
  table. Two sources for one fact is how a colleague becomes a lead.
- **No `GMAIL_BACKFILL_DAYS`.** There is no backfill.

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

## What is not an env var

## Product prospecting

`HUNTER_API_KEY` enables B2B company discovery and professional contact
sources; `BRAVE_SEARCH_API_KEY` adds current public-web qualification evidence.
Both are optional capabilities of the agent.

The three optional `PROSPECT_INGEST_BEAMDEPLOY_SECRET`,
`PROSPECT_INGEST_PROPMARGIN_SECRET` and
`PROSPECT_INGEST_ARQUIVO_FATURAS_SECRET` authenticate product forms
independently. Generate each with `openssl rand -base64 32` and give a product
only its own secret plus the complete
`https://<crm>/integrations/v1/leads` URL. See
[product prospecting](./prospecting.md).

## What is not an env var

- **Cache TTL default** — `DEFAULT_TTL_MS` (60s) is a constant in
  `apps/api/src/cache/cache.module.ts`. `CACHE_TTL_MS` only overrides it.
- **Redis** — optional. Without `REDIS_URL` the cache falls back to a
  per-instance in-memory store, which is fine for local work and wrong for any
  multi-instance deploy (see `docs/api.md`).
- **Sign-in method** — Google-only, in code, not configurable.

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
