# Website tracking

A first-party script on the customer's own marketing site, a collector in the API,
and one rule about what it is for: **a form submission becomes a contact.** Page
views exist to give that contact a story, not to be a web-analytics product.

Everything here is one install's own website. There is no second tenant, no shared
pixel, and no vendor: the script is served from the same origin as the app, the
cookie is first-party, and the only thing that ever leaves the browser is a POST to
`/api/t/e` on the install's own API.

## Two scripts, and why

| | |
| --- | --- |
| `apps/app/lib/tracking/loader.ts` → `/t/crm.js` | The tag a rep pastes. Reads the site id from `data-site` or from `?site=`, checks the shape, injects the second script. Immutable and cached for a year at the edge |
| `apps/app/lib/tracking/tracker.ts` → `/t/<siteId>.js` | The tracker itself, with the config **baked into the source** rather than fetched. Cached for five minutes |

The split is the whole cache design. The tag never changes, so it is `immutable`
and free forever; the config does change, so the file that carries it is the one
with the short life. Baking the config in also means a page view costs one request,
not a request and then a config fetch before anything can be recorded.

- **The site id has two carriers, and a tag manager is the reason.** Google Tag
  Manager's Custom HTML injector rebuilds the script element and keeps only the
  URL — `data-site`, `async` and `defer` are all dropped on the way in. An
  attribute-only tag therefore loads `/t/crm.js`, finds no site, and returns:
  the loader is in the network tab, the tracker never is, and the install looks
  installed while recording nothing. `?site=` rides in the `src`, which no
  injector can strip. **`data-site` still wins when both are present**, so a
  pasted tag beats a stale URL. Either way **the loader stays config-free** —
  baking the install's own id into it would put a year-immutable edge cache in
  front of the rotate kill switch.
- **Five minutes is a promise.** Pause tracking and every browser stops within
  `CONFIG_MAX_AGE_SECONDS`. That is why `/t/[site]` carries **no
  `stale-while-revalidate`** — a revalidation window is exactly a licence to keep
  executing the old config after the pause, and 24 hours of it once cost this
  guarantee entirely.
- **Both routes are anonymous**, listed in `proxy.ts` as `ANONYMOUS = ["/t"]`. A
  stranger's browser on the customer's marketing site has no session and must not
  be redirected to `/sign-in`.
- **The tracker has a size budget**, asserted in `apps/app/test/tracking-bundle.spec.ts`:
  1 KB brotli for the loader, 4 KB for the tracker, because the settings page
  promises a number. A change that busts it fails the test rather than the promise.

### Writing tracker source

It is a string of ES5 in a template literal, minified by hand, and it runs on
somebody else's page. That imposes rules nothing else in this repo has:

- **Never throw.** An uncaught error on line 40 means no listeners are installed and
  the page records nothing at all. Every `decodeURIComponent`, `JSON.parse`, `new
  URL` and `history` call is already wrapped; a malformed UTM parameter must read as
  *absent*, never as *fatal*.
- **Constants come from `@crm/db/tracking`**, interpolated in — `MAX_BODY_BYTES`,
  `MAX_EVENTS_PER_BATCH`, `LINKER_MAX_AGE_SECONDS`, `COOKIE_NAME`. A literal at the
  call site is a client and a server that disagree, and the disagreement is silent.
- **The client stays inside the body limit the collector enforces.** `flush()`
  measures the packed batch and splits it, then trims a single oversized form's
  fields, rather than posting a body the collector will destroy — a rejected POST is
  not retried, so the whole batch would simply be lost.

## The collector

`POST /api/t/e`, anonymous, 204, in `TrackingController`. It answers nothing: a
tracker that could read a response is a tracker whose failures a stranger can probe.

The gauntlet, in order, in `TrackingIngestService.accept`:

1. **User agent** — the `BOT` pattern.
2. **Site id** — must be a live `cmp_` id, and `forSite` refuses a rotated one.
3. **Origin** — `originAllowed`. A missing `Origin` header is refused **even with
   the allow list off**, because the header is the only thing tying the POST to a
   browser on a page.
4. **Visitor id** — 8–64 of `[a-zA-Z0-9_-]`, or the batch is dropped.
5. **`scripted()`** — three or more events sharing one timestamp is a replay. It
   only fires when **every** event carries a numeric `at`; missing timestamps are
   no signal, and treating them as proof discarded honest traffic.
6. **Host** — each event's own host against the allow list. The batch is filtered,
   not refused, because one bad host in twenty is a bug in somebody's SPA.
7. **Rate** — `EVENTS_PER_MINUTE` charged **per accepted event, atomically**,
   through `TrackingCounter`.

> **The rate limit counts events, not requests, and it counts them in the
> database.** A per-request counter with a full batch behind it admits twenty times
> the number on the constant, and a read-then-write in `cache-manager` admits
> however many requests are in flight. `TrackingCounterService.take(key, limit,
> amount)` is one statement — an `INSERT … ON CONFLICT DO UPDATE` whose `WHERE`
> carries the limit — so the check and the charge cannot be separated, and **a
> refused batch spends nothing**. Increment-then-compare looks equivalent and is
> not: the refused batch still burns its own size out of the window, so one
> oversized batch locks out the honest small ones behind it for the rest of the
> minute. It fails **closed**: a counter it cannot reach refuses the write.

`MAX_BODY_BYTES` is enforced by destroying the request as it streams, before any
parse. Keep it in step with what the tracker can produce — a form is forty fields
of five hundred characters, and a limit under that silently drops the submission
this whole feature exists to catch.

### What is never stored

- **No query strings.** `normalizePath` strips `?` and `#` from every path, and
  `stripQuery` does the same to every referrer, on the event row *and* inside the
  `firstTouch` / `lastTouch` blobs. A password-reset link in a referrer is a
  password-reset link in the database. UTM parameters are captured as their own
  fields, so nothing is lost by it.
- **No sensitive fields.** `clean()` drops any field whose *name* matches
  `SENSITIVE`, anything shaped like a card number, and every `password`, `hidden`
  and `file` input — the last three never leave the browser at all.
- **No IP address**, anywhere, ever.

## Attribution

`packages/db/src/attribution.ts`, and it is pure: no database, no config, one
function. `classifyTouch` turns UTM parameters and a referrer into a `Touch`.

- **An explicit `utm_source` beats the referrer**, because the marketer said so.
- **The referrer host is matched on DNS labels, never on a substring**, and the
  provider's labels must sit at the registrable name — one tail label, or two when
  the first is a second-level suffix **and the last is a two-letter country code**
  (`co.uk`, `com.au`, `co.jp`). So `images.google.de` and `scholar.google.co.jp` are
  Google, while `notgoogle.com`, `google.evil.com`, `google.com.phish.example` and
  `google.com.example` are all plain referrals. A substring match hands a phisher a
  trusted source name in the rep's report, and so does `com.<anything>`: the country
  code is what stops `SECOND_LEVEL` from waving through every `com.` lookalike.
  **It is still a heuristic, not the public suffix list** — a provider under an
  unusual two-label suffix reads as a referral, which is the safe way to be wrong.
- **Webmail is checked before search.** `mail.google.com` contains `google.`, so
  order alone decides whether a campaign's own click-throughs read as *email* or as
  *organic search* — and reading your newsletter as Google organic is how a
  marketing report lies.
- **`Direct` is a source, not a null.** Everything lands in one of the seven
  `MEDIUMS`; an unrecognised medium is `other`.

## Filing: from a submission to a contact

`TrackingFilingService.file` is the only path from a form to a `Contact`, and it
reuses the mailbox pipeline's judgement rather than inventing a second one —
`isMachineAddress`, `isAutomatedAddress`, `isMachineDomain`, `workspaceDomains`,
`SuppressedContact`, `SuppressedDomain`, `companyForEmail`, `splitName`. **A rule
that holds for the inbox holds here.** A second copy is how *deleted contacts stay
deleted* comes to be true of email and not of forms.

- **Every submission is stored; filing is separate and may decline.** `skipReason`
  says why, and the row stays for a rep to look at.
- **A refusal is a `skipReason`, never a lost row**, and `CONTACT_CAP_REASON` is a
  shared constant because `rollup.service.ts` matches on it. Telemetry that
  substring-matches prose breaks the first time somebody improves the wording.
- **`CONTACTS_PER_HOUR` bounds the blast radius** of a scripted form. It is charged
  only when a *new* contact would be created — an existing contact costs nothing,
  because attaching to somebody already in the CRM cannot flood it — and **a create
  that loses the race hands its slot back**, so duplicate delivery of one form
  cannot eat the hour's quota for a contact that was only ever made once.
- **The email race is handled, not hoped away.** Two submissions for one address
  land at once, one `create` loses on the unique index, and the loser attaches to
  the contact that won. Left as a raw `P2002` it becomes a stored submission that is
  never filed and never retried.
- **`attach` claims the row before it writes anything.** It is an
  `updateMany` on `filedAt: null`, and a caller that loses the claim returns without
  writing — otherwise two concurrent deliveries of one submission each leave the
  contact a `Submitted a form on …` note.
- **Duplicate delivery retries an unfiled row.** `dedupeKey` collapses a resend
  inside one minute, but if the first attempt died before it filed — no `filedAt`,
  no `skipReason` — the resend is the retry.
- **The agent is told, never asked.** `agent.contactCreated` writes an `AgentTask`.
  No enrichment, no scoring and no identity matching happens here; see `docs/api.md`.

## Retention

`POST /internal/tracking/retention`, nightly at 04:00 via `apps/api/vercel.json`,
`CRON_SECRET` or nothing.

- **The cutoff is a whole UTC day**, `EVENT_RETENTION_DAYS` back and then truncated.
  A mid-day cutoff splits one calendar day across two nightly runs, and
  `trackedPageDaily` keeps the larger half of a day it saw twice — so the boundary
  day is quietly under-reported forever. Roll whole days or do not roll.
- **Roll before you delete.** `TrackingRollupService` aggregates `page_view` rows
  only; a click is not a page view, and counting visitors over both produces a row
  reading `views = 0, visitors = 3`.
- **Deleting is batched and bounded** — `SWEEP_BATCH` × `MAX_SWEEP_PASSES`. A sweep
  that hits the ceiling **says so**, in the log and in the response, because
  silently leaving events behind reads exactly like having deleted them.
- **A visitor outlives their events only if a contact points at them.** An
  anonymous visitor with nothing left is removed.

## Settings, and who may change them

Settings → Tracking & Analytics. `canManageTracking` (`@crm/auth`) gates every
mutation **in the service**, and the same flag disables the control — the button and
the 403 cannot disagree, as everywhere else.

`tracking.sources` is manager-only too, so the page must not prefetch it for
everybody: a member's render would fire a request that can only be refused.

- **Verify reports on the page it actually fetched.** `safeFetch` follows
  redirects, so the host in the result comes from `fetched.url`, not from what the
  rep typed — otherwise `acme.com` reports the allow-list status of a page that
  lives on `www.acme.com`.
- **Verify reads Tag Manager containers, not only the HTML.** A tag a container
  injects is not in the response, so an HTML-only check calls a working install
  broken — and it did. When the HTML carries no tag, `verify` takes the `GTM-…`
  ids out of it and reads `gtmContainerUrl(id)`, at most `MAX_CONTAINERS` of
  them. **The URL is built from the id we matched, never from anything a rep
  typed**, so the one host this can ever reach is Google's. A container holding
  the attribute form is reported as *found and broken*, with the fix, because
  that is precisely what it is — and `missing` names the containers it read, so
  a rep can tell *not installed* from *not looked at*.
- **`MAX_VERIFY_BYTES` is measured against real marketing pages.** The old
  512 KB cut was smaller than one homepage this repo's own company ships, and a
  tag past the cut reads exactly like a tag that is not there.
- **Rotating the site id is the kill switch for a stolen snippet.** The old id stops
  resolving at `forSite` within the cache TTL.
- **The compiled config is cached for five minutes and invalidated on every write.**
  Two things guard the cache, because one is not enough. `invalidate()` bumps a
  **per-process generation** before it deletes, which stops this replica's own
  in-flight read putting the pre-pause config back. That counter means nothing to a
  second replica, so nothing is written to the cache unless its hash still equals
  `AppSetting.trackingConfigHash` — **the shared version, in the database, that
  every replica can see**. A read that raced a change computes the old hash, finds
  it no longer current, and declines to cache it. Pausing sets the column to
  `null`, so while tracking is paused **no config can validate and none is cached
  at all**.

## Where it lives

| | |
| --- | --- |
| `packages/db/src/tracking.ts` | Every constant and every pure helper both sides share. **The single source of truth** — a literal copied out of here is a future divergence |
| `packages/db/src/attribution.ts` | `classifyTouch` and the source tables. No imports, no database |
| `apps/app/lib/tracking/` | The loader and the tracker source |
| `apps/app/app/t/` | The two public routes |
| `apps/api/src/tracking/` | Collector, config cache, ingest, filing, counters, rollup, retention, tRPC router |
| `apps/app/app/(app)/[slug]/settings/tracking/` | The settings page |
| `apps/app/components/crm/website-activity.tsx` | The record-sheet section, which renders its own heading so it can render nothing at all |
