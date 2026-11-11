# HANDOFF.md — agent handoff log

This file is the single source of truth for "where is this project and what
happens next". Every agent MUST read it before starting work and MUST update
it before stopping. The rules for maintaining it live in `AGENTS.md`
("Handoff protocol").

## How to update this file

- **Append, never rewrite history.** Add a new dated entry at the top of the
  "Work log" section. Keep old entries untouched.
- Each entry must answer four questions:
  1. **What was completed** — concrete outcomes, with file paths.
  2. **How and why** — the approach taken and the reason for it.
  3. **Deviations** — anything that differs from the plan or from upstream,
     and why. If nothing deviated, say "None".
  4. **What's next** — the exact next step a new agent should take, with a
     pointer to the relevant plan section.
- Also keep the "Current state" section below up to date (edit in place —
  this section IS a rewrite-in-place summary, unlike the log).

---

## Current state (keep this section up to date)

- **Sage cursor time zone fix (DONE prod `5b37dce` + `dff0909`,
  2026-10-01)**: Sage datetimes are `America/Chicago` wall time.
  The nightly cursor was written in UTC, so every Sage save
  between the 1:00 AM CDT run and ~5:00 AM was skipped forever.
  Now `toSageClock` / `fromSageClock` (`sage-clock.ts`) format
  the cursor and parse `updateddate` in Central. Catch-up ran in
  prod: all 271 Sage opportunities saved since 2 Aug match the
  CRM (0 stale). Only opp **807** is absent (no company in Sage).
  Re-pull tool: `scripts/sage-backfill.ts --opportunities-since=`.
  Companies in that window were already current (11 rows).
- **2:35am CDT cron crashes (checked prod 2026-09-30)**:
  `cron-sequences`, `cron-microsoft`, and `cron-webform`
  showed CRASHED between 07:35 and 07:54 UTC. The web
  app, api, and agent processes stayed up. Cause: those
  crons curl the public API and exit on any non-200.
  At 07:35 UTC Cloudflare returned 404 and Railway never
  saw the requests. At 07:43 UTC the API returned 500
  because `prisma.account.findMany()` failed with
  `getaddrinfo ETIMEOUT`. Postgres was checkpointing
  normally. At 07:54 UTC `/internal/sequences/tick` hung
  until Cloudflare returned 524 and the client closed
  (edge 499). By 07:55 UTC the same routes were 200
  again. Separate ongoing issue: webform ingest still
  logs `Access is denied` for `info@` and returns 200.
- **Sage cron health (re-checked prod 2026-09-15)**: Nightly
  pull is healthy. Sep 15 06:02 UTC finished **clean on
  the first try** (no 503): 226 companies / 585 contacts /
  **0 deals** / 811 snapshots. That is yesterday’s Sage
  company edits landing as expected. Deals stay at 0
  because Sage still is not changing opportunities (last
  opp **848** on Sep 9). Sep 10/11/14 still had a 503 +
  curl retry; Sep 12/13/15 were first-try OK. Outbox
  failures (opp **821**, one contact create) are push-only.
- **Won vs new-pipeline chart colors (DONE local 2026-09-11)**:
  Closed won stays green (`--success`). New pipeline is
  blue (`--chart-2`). `--chart-1` is also green, so both
  series used to look the same. File: `sales-dashboard.tsx`.
  Shipping with this push.
- **Everyone recent activity is CRM-only (DONE local 2026-09-11)**:
  Overview Everyone no longer shows mailbox rows: email
  threads, calendar events, or “added from your inbox”
  company/contact creates. Team notes, calls, tasks,
  stage changes, and other enrichment stay. Me still
  shows the signed-in user's mail. Files:
  `dashboard.service.ts` `recentActivityWhere`,
  `dashboard-summary.tsx`, `dashboard-range.spec.ts`.
  Shipping with this push.
- **Stage changes are owner-only (DONE local 2026-09-11)**:
  Only the assigned deal owner can move stage. Admins
  (`CRM_ADMIN_EMAILS`, e.g. jjohnson) can still edit
  fields and reassign owner, but not Harry Kim's stage.
  API `deals.setStage` returns 403 for anyone else.
  UI locks the sheet rail, header menu, and table cell.
  Files: `packages/auth/src/admins.ts` `canChangeDealStage`,
  `deals.service.ts`, `use-deal-edit-access.ts`,
  `deal-sheet.tsx`, `owned-deal-stage-menu.tsx`.
  **Needs api + app deploy.**
- **Overview Everyone hides overdue tasks (DONE prod `d896ec5`)**:
  Everyone tab no longer shows the Overdue tasks card.
  Deals in progress is full width. Me still shows both
  cards side by side. File: `dashboard-summary.tsx`.
- **DealQuote `isPrimary` as disambiguator (DONE prod `d896ec5`)**:
  Backfill had marked every clone primary. Prod repaired
  via TCP proxy + `repair-deal-quote-primaries.ts`: **11**
  colliding numbers now have **exactly one** primary
  (`Q260413-003` 8→1). Unique numbers stay false.
  Attached **Q260622-002** to `#Q260622-001 & 002: …`
  (sage opp **679**). 202 rows. Do not parse
  `opportunity_name` in Analytics. Do not store
  `SavedQuote.id`. Orphans not in `fct_quotes` left
  alone: `Q260116-003`, `Q260716-006`, `Q260724-006`.
  Nightly warehouse extract `0 9 * * *` UTC re-pulls
  `dealQuote`; no new extract needed. Script:
  `apps/api/scripts/repair-deal-quote-primaries.ts`.
- **Overview overdue KPI + locked/live board (DONE local 2026-09-11)**:
  Lost tile removed (win rate still names wins and losses).
  New **Overdue** tile: open deals whose `expectedCloseDate` is
  before now (same rule as Deals → Closing → Overdue). Not the
  pulse **Stuck** list (14d no stage move). Locked cluster
  (inverted, ignores date range): Due this month, Open pipeline,
  Overdue, Stuck. Live cluster (follows range): Closed won, Win
  rate, Won, Deal Maturity moves. Files: `stat-card.tsx`
  `tone="locked"`, `dashboard.tsx` `StatBoard` + `StatGroup`
  `columns="pair"`, `dashboard.service.ts` `overdueOpenWhere`,
  `sales-dashboard.tsx`. **Needs api + app deploy.**
- **Overview recent-feed filters (DONE local 2026-09-11)**: Recent
  deal moves on `/` filter by rep (`pulseRep`) and change reason
  (`pulseChange`). Filters live in the URL. Unfiltered rows still
  come from `dashboard.summary.pulse`. A filter on queries
  `dashboard.pulseRecent` so a year-long range can still fill 24
  matching rows. Rep select is Everyone only. Files:
  `packages/db/src/pipeline-pulse.ts`, `dashboard.contracts.ts`,
  `dashboard.service.ts`, `dashboard.router.ts`,
  `overview-search-params.ts`, `pipeline-pulse.tsx`,
  `apps/app/app/(app)/page.tsx`. Plan:
  `docs/plans/pipeline-pulse.md`. **Needs api + app deploy.**
- **Deal quote numbers (DONE prod 2026-09-11 / deploy `bd6e7b5`)**:
  `DealQuote` is live. Canonical `QYYMMDD-###` only; Sage
  shorthand expands on save; never stores quote-tool `quote_id`.
  Prod: **202** quotes (was 201; +`Q260622-002`). Human add /
  remove / set-primary on the deal sheet. Analytics extract
  is live (`raw.mm_crm_deal_quotes`). Exact-id tiers:
  unique → `deal_quote_exact`; one primary →
  `deal_quote_primary`; else `deal_quote_ambiguous`.
  Join `upper(trim(quoteNumber))` = `fct_quotes.quote_number`.
  `GRANT SELECT ON "dealQuote"` already applied.
- **closedAt forward fix (DONE prod `bd6e7b5`)**: Pull no longer
  copies `targetclose` / `opened` into `closedAt`. Rule:
  Sage `closed` if Chicago date ≤ today; else freeze an existing
  past `closedAt`; else stamp now once (first observe). Future
  dates rejected even when Sage filled `closed`. Historical past
  fallback dates stay frozen (173 empty-`closed` Won not rewritten).
  Next nightly Sage pull will fix query-C futures (TALLEY 837
  $256k → sync day; 525/589 future Sage `closed` → now).
- **Sage incremental pagination restart (DONE prod `bd6e7b5`)**:
  Nightly `cron-sage` was 503 on the first curl then 200 on `--retry`
  because Sage SOAP `next` returned `List index out of bounds (75)`
  (Sep 10) / `Query failed to run successfully.` (Sep 11). In-process
  restart only covered session-lost + transport; those two faults now
  restart the changed-set walk (`isSagePaginationFault`, same cap
  `SAGE_SESSION_RESTART_LIMIT`). Files: `sage.constants.ts`,
  `sage-pull.service.ts` comments, `test/sage-session-lost.spec.ts`,
  `docs/plans/sage-crm-sync.md` §6.8.
- **Sage Deal.currency id leak (DONE prod 2026-09-09)**: Mapper writes
  Sage lookup id `1` → `"USD"`. Incremental sync rematerializes leaked
  ids. **api** `b2761aa` is live. Manual Sage sync ran (SSH into `api`,
  same `/internal/sync/sage` route as `cron-sage`; a from-source
  redeploy of `cron-sage` finished without hitting the API). Confirm:
  `SELECT currency, count(*) FROM deal GROUP BY 1` → **USD 565**, no
  `'1'`. MM-Analytics unchanged.
- **Overview Everyone activity hides others' mail (SUPERSEDED 2026-09-11)**:
  The 21 Aug rule still showed the signed-in user's inbox on
  Everyone. Replaced by **Everyone recent activity is CRM-only**.
- **Git**: `origin` = `jj-mobilemark/crm` (fork); `upstream` = `trycompai/crm`
  (read-only). Work on `main`. Last upstream sync is `288d41a` (2 Aug).
  **Passed on trycompai/crm v1.14.0** (18 Aug) — 150 upstream commits /
  66 fork commits / 124 overlapping files; org model + colliding Prisma
  timestamps. Revisit later via cherry-pick (Context.dev people +
  enrichment queue), not a full merge onto `main`.
- **Agent auto-enrich OFF by default (DONE local 2026-08-07)**: Sync /
  calendar / daily followups no longer enqueue `AgentTask` unless
  `AGENT_AUTO_ENRICH=true` on **both** `api` and `agent`. Company sheet
  Re-enrich / Research (`companyRequested`, priority ≥ 100) still
  queues. Agent dispatcher retires auto backlog when the flag is off.
  Files: `agent-trigger.service.ts`, `tasks.ts`, `dispatch.ts`,
  `.env.example`, `env.validation.ts`, `docs/plans/agent-railway.md`.
  **Needs deploy of `api` + `agent` to stop prod spend** (unset flag =
  off; no Railway var required).
- **External company APIs for PO intake (DONE 2026-08-07)**: Sister
  PO app. Auth `X-API-Key` → `CRM_API_KEY`.
  - `GET /company/:mas/order-defaults` (+ `?name=&zip=` exact; soft
    `?name=` / `?email_domain=` / `?phone=` → candidates)
  - **`POST /company/resolve`** — ranked resolve from letterhead/buyer/
    email/MAS hint; ship-to never auto-accepted by default; vendor
    names rejected; auto-accept ≥0.85 + MAS id. Files:
    `company-resolve.service.ts`, `order-defaults.controller.ts`,
    `crm-api-key.ts`, tests in `test/company-resolve.spec.ts`.
  - order-defaults fields: attention/phone/email/terms_code/rep_*/
    is_distributor. Still no tracking/ship_via/freight. Plan §7.
- **Overview Closed won through month-end + opp 799 (DONE 2026-08-18)**:
  "This month" now counts the full calendar month, not month-to-date
  (`resolveRange` in `dashboard.service.ts`). Echo-guard TTL 2h —
  Sage often does not bump `updateddate` after our push, which froze
  rows. Prod repair from snapshots: **71 deals** remapped (incl.
  opp 799 Proposal → Closed won). Open pipeline was inflated by
  Sage Won/Lost rows left on open stages after the Aug 4 sageStage
  migration. Needs **api** deploy for the month-end card. TCP proxy
  used then deleted.
- **Sage SOAP walk retries (DONE prod via `b2761aa` 2026-09-09)**:
  Incremental pull restarts on session-lost **or** transport blips
  (timeout / unable to connect). SOAP deadline 90s. `logon` retries
  3× with backoff on transport failure only — never on `auth-failed`.
  Pagination faults (`List index out of bounds` / company-opportunity
  `Query failed…`) are the 2026-09-11 local follow-up above.
- **Sage cron health (2026-09-03 check; superseded 2026-09-14)**:
  See the 2026-09-14 Sage cron health bullet at the top of
  this section.
- **Webform lead Screening (DONE prod wiring 2026-08-05)**: Customer
  Question emails from shared mailbox → `PendingWebLead`,
  territory-routed into the same Screening list as mail (Web/Mail badge
  + Claim for unassigned). Territory: `data/sales-territory.json` +
  `@crm/db` `assignRep`. **Prod ready:** Entra application `Mail.Read`
  + Exchange policy group `CRM-Webform-Mailbox-Access` → `info@` only;
  api `WEBFORM_MAILBOX=info@mobilemark.com`; Railway `cron-webform`
  (`*/5 * * * *`) → `GET /internal/sync/webform`. Policy may take up to
  ~1h to fully grant; smoke with a manual curl after
  `Test-ApplicationAccessPolicy` shows Granted. Plan:
  `docs/plans/webform-lead-screening.md`. Migration
  `20260805140000_add_pending_web_lead` applied on api deploy.
- **Daily Task Push (DONE prod cron fix 2026-08-06)**: Settings switch on
  the Microsoft card; opt-in emails open tasks at 9:00 America/Chicago
  via Graph `Mail.Send`. Route
  `GET/POST /internal/notifications/daily-tasks` (`?force=1` smoke OK).
  Railway `cron-daily-tasks` `0 14,15 * * *` UTC — start command fixed
  (literal API host; was `URL rejected: No host part`). Plan:
  `docs/plans/daily-task-push.md`.
- **Owner ↔ Sage acctmgr push + Trip owner-aware (DONE local 2026-08-05)**:
  Company Owner edits enqueue Sage push and write `acctmgr` (mapped reps
  only). Local owner coverage verified: 5,985 owned / 0 matchable gaps
  (former-rep blanks by design). Trip Planner ranks mine → unassigned →
  other; agent asks before scheduling other-owned. Files:
  `sage.mappings.ts`, `sage-push.service.ts`, `companies.service.ts`,
  `trip-plan.ts`, `search_trip_candidates.ts`, `preamble.ts`,
  `instructions.md`. Docs: `sage-crm-sync.md` §3.1, `trip-planner.md`.
- **Map re-geocode after state/country (DONE local + prod 2026-08-04)**:
  Stale city-only place keys (`englewood||`) pinned wrong cities
  (Englewood CO→NJ, etc.). Cleared with `--refresh-stale`; re-ran with
  **Open-Meteo** (`concurrency=4`, `--no-fallback`). Local ~5.5 min
  (4888 places → 7375 companies); prod ~20 min (5436 places → 10931
  companies). Spot-check: Englewood/Aurora CO in Denver bbox. ~1k
  unique places still uncached-as-fail (junk/odd city strings). Code
  not fully committed: `open-meteo.geocoder.ts` + geocode script edits.
  Docs: `docs/plans/companies-map.md`. TCP proxy deleted after.
- **Trip Planner must-visit chip labels (DONE local 2026-08-04)**:
  Reloading a trip no longer shows truncated company ids on must-visit
  chips — `companies.byIds` resolves names. Files:
  `company-multi-picker.tsx`, `companies.service.ts` / router /
  contracts, generated `server.ts`.
- **Trip Planner open-deal priority (DONE local 2026-08-04)**: Candidate
  ranking keeps must-visits first, then **open-deal accounts by deal
  size**; ACTIVE mode also includes still-open deals outside the
  look-back window. Agent preamble/tools tell the model to fill leftover
  day slots that way. Files: `packages/db/src/trip-plan.ts`,
  `search_trip_candidates.ts`, `preamble.ts`, `instructions.md`,
  `docs/plans/trip-planner.md`.
- **Trip Planner UI polish (DONE local 2026-08-04)**: `/trip-planner`
  rebuilt to match CRM density — Empty state, trip list with
  StatusIndicator, focused create form (FieldSet / ToggleGroup),
  edit workspace with brief + itinerary + agent. Files:
  `trip-planner-client.tsx`, `trip-planner/page.tsx`. Plan:
  `docs/plans/trip-planner.md`.
- **Trip Planner (DONE local 2026-08-04; owner-aware 2026-08-05)**:
  `/trip-planner` nav (Carbon Plane). Persisted `TripPlan` + agent kind
  `trip` (`x-crm-trip` → `tripPlanId`). Deal-only ACTIVE/SALVAGE ranking
  via shared `@crm/db` helpers; candidates prefer the planner's accounts
  (mine → unassigned → other; agent asks before other-owned). Agent tools
  `read_trip_plan` / `search_trip_candidates` / `write_trip_itinerary`.
  Client PDF via `jspdf`. Plan: `docs/plans/trip-planner.md`.
  Migration `20260804150000_add_trip_plan` applied locally.
- **TEMPORARY agent model (2026-08-04)**: research agent on
  `deepseek/deepseek-v4-pro` for cheaper testing; **revert to
  `anthropic/claude-sonnet-5` when done**. Files:
  `apps/agent/agent/agent.ts`, `.cursor/rules/project-overview.mdc`.
- **Fact accept → Sage push (DONE local 2026-08-04)**: Accepting a
  contact fact for `title` or `name` enqueues `SageOutbox` the same way
  as editing those fields in Details (`contacts.decideFact` →
  `sagePush.enqueueAndKick`). LinkedIn/etc. facts still local-only.
  File: `apps/api/src/contacts/contacts.service.ts`.
- **Deals Owner default + Stage multiselect + contact company
  picker (DONE local 2026-08-04)**: `/deals` Owner facet defaults to
  `"me"` (signed-in user) so the list opens on your pipeline. Stage
  facet is multiselect (comma-joined URL); all stage labels always
  shown (Leads → Unqualified). Contact sheet Company uses searchable
  `CompanyPicker` (Sage 100 # + contact count). Files:
  `deals-search-params.ts`, `deals-table.tsx`, `deals/page.tsx`,
  `deals.service.ts`, `data-table.tsx`, `inline-field.tsx`,
  `contact-sheet.tsx`, `company-picker.tsx`.
- **Certainty by rep + stage-locked certainty (DONE local 2026-08-04)**:
  Everyone overview **Deal Maturity by rep** grid below forecast —
  reps × stage bands with historical close windows (This month /
  Last month / This quarter / Last quarter / YTD / Custom). API
  `dashboard.certaintyByRep`. Certainty locked to stage; UI label is
  "Deal Maturity". Migration `20260804140000` applied locally. Docs:
  sage-crm-sync §3.3.
- **Recent deal moves Amount column (DONE local 2026-08-04)**: Pulse
  feed includes current deal `amountCents`; Overview Recent deal moves
  shows an Amount column after Deal. Shared loader:
  `packages/db/src/pipeline-pulse.ts`; UI: `pipeline-pulse.tsx`.
- **Company picker disambiguation (DONE local 2026-08-04)**:
  `CompanyPicker` and screening/create-company match dialogs show
  Sage 100 customer # + contact count on the secondary line (no domain
  in the picker; no "Sage 100" label — just `{id} · N contacts`).
  `companies.options` returns those fields. Helper:
  `apps/app/components/crm/company-disambiguation.ts`.
- **Company state/country + junk email repair (DONE local + prod
  2026-08-04)**: Full pull never wrote `stateCode`/`country` (only
  `city`); `/map` started persisting them later. Snapshot backfill
  fills street/postal/state/country — **13,670** local / **13,484**
  prod. Sage `emailaddress` notes rejected by `normaliseEmail`; cleared
  **428** junk company emails local + prod
  (`fix-sage-company-email-notes.ts`). TCP proxy deleted after. Docs:
  `docs/plans/sage-crm-sync.md` §3.1.
- **Company street address (DONE local + prod 2026-08-04)**: `Company.streetAddress`
  + `postalCode`; Sage pull maps nested `address1` / `postcode` (zip
  aliases). City-level geocode unchanged. Migration
  `20260804130000_company_street_address` applied locally + on Railway
  api deploy (`f794eae`). Snapshot backfill filled **12,191** local and
  **12,192** prod companies
  (`backfill-company-street-from-snapshots.ts`; TCP proxy deleted after).
  Sheet + map selection show full address. Docs:
  `docs/plans/sage-crm-sync.md` §3.1, `docs/plans/companies-map.md`.
- **Nav count bubbles (DONE local 2026-08-04)**: Screening + Follow-ups
  rail icons show a primary `CountBadge` when the signed-in user has
  uncleared items. APIs: `screening.count` (PENDING), `followups.count`
  (PROPOSED + due SNOOZED). Rail polls every 60s; decide/accept paths
  invalidate via `cache.screening` / `cache.followup`. UI:
  `packages/ui/.../count-badge.tsx`, `app-icon-rail.tsx`.
- **Map deal-years filter (DONE local 2026-08-04)**: `/map` dropdown
  `dealYears` 0 (= any time) or 1–10. Keeps companies with a deal
  `createdAt` or `closedAt` within that window. URL +
  `companies.mapList`. Docs: `docs/plans/companies-map.md`.
- **Forecast by close month window (DONE local 2026-08-04)**: Overview
  month table keeps last month + this month + next 12 months (and
  "No date"); older overdue and far-future months drop out. Totals /
  Forecast by rep still use all open deals. `buildForecast` in
  `dashboard.service.ts`; copy in `sales-dashboard.tsx`.
- **Sales-rep sheet + deal stages (DONE local 2026-08-04)**: Five open
  stages — Leads / Investigation / Quote / Negotiation / In Purchasing
  (`IN_PURCHASING` enum) with certainty defaults 10/25/50/75/90. Sage map
  splits Proposal vs Purchasing; blank → Leads. Migrations
  `20260804120000` + `20260804120100` applied locally + on Railway with
  `f794eae` api deploy. Overview Everyone: clickable `OwnerCell` +
  Forecast by rep opens `SalesRepSheet` (`?record=user:<id>`);
  `dashboard.repSummary` KPIs + certainty×month grid. Plan:
  `.cursor/plans/sales_rep_sheet_b7f28c67.plan.md`. Docs:
  `docs/plans/sage-crm-sync.md` §3.3.
- **Sage website notes (DONE local + prod 2026-08-03)**: Sage `website`
  is often a credit/account note, not a URL. Pull keeps only URL-shaped
  values; push never writes `website`. Prod repair ran via temporary
  TCP proxy + `fix-sage-website-notes.ts` (cleared notes, backfilled
  from contact emails; Hitachi → `website=https://cleverdevices.com`).
  Research works without a domain (Perplexity); Re-enrich accepts a URL
  website. Plan: `docs/plans/sage-crm-sync.md` §3.1.
- **Screening company match (DONE 2026-08-03)**: Approve calls
  `companies.similar` (domain→name guess + related-host scoring) and offers
  Use this / Create from domain (`preferDomainCompany` skips soft-attach).
  Matches mark a **Suggested** pick (Sage 100 > contacts on the typed
  domain > contact volume). `companyForEmail` soft-attaches on a strong
  unique match or a suggested pick with Sage 100 / matching-domain
  contacts. **Screening → Sage**: Approve enqueues person create when
  parent has `sageCrmCompanyId` and no same-name Sage-linked twin;
  failures never fail local create. Shared ranking: `company-similar.ts`.
  Hitachi Teresa cleanup on **prod** done; Sage probe clean. Script:
  `apps/api/scripts/fix-hitachi-screening-dup.ts`. Plan note:
  `docs/plans/sage-crm-sync.md` §4 item 6c.
- **Companies Hide empty filter (DONE 2026-08-03)**: companies list
  checkbox (on by default) keeps rows with ≥1 contact **and** a Sage 100
  customer #. URL `hideEmpty=yes|all`. Files:
  `companies.contracts.ts`, `companies.service.ts`,
  `companies-search-params.ts`, `companies-table.tsx`.
- **Overview 8-KPI strip (DONE 2026-08-03)**: one `StatGroup` with sales +
  pulse cells (Closed won / Due / Open / Win rate / Won / Lost /
  Certainty / Stuck). **Won/Lost** = deal `closedAt` counts in the selected
  range (same as Closed won / win rate). **Certainty** (+ movers/feed)
  follow the range via `loadPipelinePulse({ since, until })` change log.
  Stuck stays 14d+. Static KPIs use `tone="static"`; range-bound values
  animate. Files: `sales-dashboard.tsx`, `pipeline-pulse.tsx`,
  `stat-card.tsx`, `pipeline-pulse.ts`, `dashboard.service.ts`.
- **Sage extra-module probe (DONE 2026-08-03)**: live SOAP check of UI tabs
  beyond company/person/opportunity. **Actively used + not synced:**
  `communication` (tasks/calls/email, 2026), `notes` (2026), `lead`
  (2026, same-day updates). Already covered via company nest: `address` /
  `phone` / `email`. `users` (~27) works as entity name `users`. Cases
  empty; documents (`library`) / forecast / campaign not WS-enabled;
  relationships / consent / selfservice have no SOAP entity. Quotes /
  orders / Mas* still "Query failed" even with `1=1`. Scripts:
  `apps/api/scripts/sage-probe-entities.ts`, `sage-probe-recency.ts`.
  Plan table updated: `docs/plans/sage-crm-sync.md` §1 Entity availability.
- **Company create duplicate guard (DONE 2026-08-03)**: before
  `companies.create`, UI calls `companies.similar` (local name/domain
  soft-match). Domain hit → must use existing; name hit → confirm Use this
  or Create anyway. No live Sage search. See
  `docs/plans/sage-crm-sync.md` §4 item 6b.
- **Companies/contacts list UX (DONE 2026-08-03)**: companies table has a
  **Primary contact** column (designated primary, else most recently
  created); name + email with copy. Contacts table email column has the
  same copy control (`EmailValue`). No migration.
- **Screening per-rep (CODE DONE 2026-08-03, migrate pending)**:
  `PendingContact.userId` + `@@unique([userId, email])`; harvest stamps
  mailbox owner; `screening.list` / `decide` scoped to session user.
  Migration `20260803200000_pending_contact_per_user` (clears old shared
  rows). **Not applied yet** — Docker was down locally; apply with
  `bun run db:deploy` locally + on Railway `api` before relying on
  Screening in prod. Follow-ups were already per-rep; `proposeFollowUp`
  now also requires cited messages `syncedByUserId = userId`.
- **Prod crons (DONE 2026-08-03)**: Railway curl services hit
  `api` with `CRON_SECRET` (UTC schedules). No Google cron.
  - `cron-microsoft` `*/5 * * * *` → `/internal/sync/microsoft`
    (smoke OK: synced=4)
  - `cron-sequences` `*/5 * * * *` → `/internal/sequences/tick`
    (Railway min interval is 5m; was 2m on Vercel)
  - `cron-followups` `0 13 * * *` → `/internal/agent/followups`
    (8:00 AM CDT). Agent claims these rows (see prod agent below).
  - `cron-sage` `0 6 * * *` → `/internal/sync/sage` (1:00 AM CDT)
  - `cron-daily-tasks` `0 14,15 * * *` → `/internal/notifications/daily-tasks`
    (Chicago 9:00 gate; needs api deploy with the route)
  Image `curlimages/curl:8.12.1`; start via `sh -c 'curl …'`;
  vars `API_PUBLIC_URL` + `CRON_SECRET` on each cron service.
- **Prod agent (DONE 2026-08-03)**: Railway service `agent` always-on;
  `Dockerfile.agent` + `scripts/railway-agent-start.sh` (Node 24 hosts
  eve / just-bash; Bun for install). App has
  `AGENT_URL=http://agent.railway.internal:2000` + matching
  `AGENT_BRIDGE_SECRET`. Optional: `RAPIDAPI_KEY` (LinkedIn) on
  **agent** only. Plan: `docs/plans/agent-railway.md`.
- **Auth registration (OPEN for @mobilemark.com via Microsoft,
  2026-08-04)**: email/password removed. Microsoft first sign-in creates
  the user when `ALLOWED_SIGN_IN` matches (domain allow-list hook).
  Google still has `disableImplicitSignUp: true` if configured.
- **Prod tRPC proxy (FIXED 2026-08-03)**: Settings "Check now" was failing
  with `Unexpected token '<', "<!doctype "...` because the Next proxy
  hairpinned through Cloudflare (`API_URL`) and got Error 1000 HTML.
  Fix: `INTERNAL_API_URL=http://api.railway.internal:3001` on the app
  service; proxy + RSC use it (`apps/app/lib/env.ts`). Deployed `9f0b65c`.
- **Branding**: **Mobile Mark CRM** (no Comp AI in UI). Signal mark +
  wordmark in `apps/app/public/`; `Logo` component uses the mark; auth
  shell shows the wordmark on the dark panel.
- **Companies map (DONE 2026-08-03)**: `/map` split list + Leaflet
  (shadcn-map); `companies.mapList`; Company lat/lng + `GeocodeCache`;
  Nominatim `apps/api/scripts/geocode-companies.ts`; Sage pull writes
  state/country and clears coords on location change. Migration
  `20260803150000_add_company_geocode` applied locally + prod.
  **UX**: list follows viewport (`MapBoundsListener`) / cluster click;
  list/pin select flies + highlights; **Open company** → `useOpenRecord`
  sheet on `/map`. Helper: `packages/db/scripts/pull-geocode-from-prod.ts`.
  **Filter empty flash (FIXED 2026-08-03)**: keep previous
  `mapList` data while refetching; reset stale Leaflet bounds on
  filter change; ignore degenerate bounds; surface query errors.
  **Sage filter = Sage 100** (`sage100CustomerNo`), not CRM id —
  ~4.8k linked / ~9.5k unlinked locally.
- **Prod geocode (DONE)**: full pass via railway ssh —
  `fetchedOk=3651`, `companiesUpdated=12147`. Local imported same coords
  (3811 cache / 12319 company rows; **12147** with coords). TCP proxy gone.
- **Prod DB**: Railway Postgres restored 1:1 from local Docker `crm` dump
  (2026-08-03) — ~14.2k companies / ~24.8k contacts / 525 deals / ~39.5k
  Sage snapshots.
- **Prod auth URLs**: `API_URL` / `BETTER_AUTH_URL` =
  `https://api.mobilemarksalestool.com`; `APP_URL` =
  `https://crm.mobilemarksalestool.com`.
- **Pipeline pulse + agent (DONE, 2026-08-03)**: `DealFieldChange` log;
  overview strip/movers/feed/stuck; `AgentRecordKind` `pipeline`;
  `AgentConversation.pipelineScope`; bridge `x-crm-pipeline` → JWT;
  `pipelinePreamble` + `read_pipeline_pulse` + `read_pipeline_report`
  (open by stage / forecast month / closing / closed); `PipelineAgentPanel`.
  Shared loaders: `packages/db/src/pipeline-pulse.ts`,
  `packages/db/src/pipeline-report.ts`. Migrations `20260803130000` +
  `20260803140000`. Docs: `docs/agent.md`, `docs/plans/pipeline-pulse.md`,
  `docs/plans/pipeline-agent-reports.md`.
- **Local API**: `bun run src/main.ts` in `apps/api` (:3001). App `bun run
  dev` on :3000. Restart API after new tRPC procedures (no HMR for routers).
- **Deal/task priority + Tasks page**: nullable `Priority`; `/tasks`.
  Migration `20260803110000_add_priority`.
- **Email sequences**: `/sequences` + Nest tick; needs Entra **Mail.Send**.
- **Auth / env**: `ALLOWED_SIGN_IN=mobilemark.com`; Microsoft SSO works.
  Secrets only in root `.env`.
- **Local CRM data**: Sage backfill — do not re-run `bun run db:seed`
  casually.
- **Key files (companies map)**:
  - `docs/plans/companies-map.md`
  - `apps/app/app/(app)/map/`
  - `apps/api/src/companies/companies.contracts.ts` (`mapList`)
  - `apps/api/scripts/geocode-companies.ts`
  - `packages/db/scripts/pull-geocode-from-prod.ts`
  - `packages/ui/src/components/map.tsx` (`MapBoundsListener`, `MapFlyTo`)

---

## Work log

### 2026-11-11 — Territory map updated to Ken's 2026-11-10 version

**What was completed**
- `data/sales-territory.json`: Nino Barker (NB) removed from the map; his
  Central US states (AR, IA, KS, LA, MN, MO, NE, ND, OK, SD, TX) and the
  MCE Connectronics distributor now route to Bryant Cloud (`BC`,
  `bcloud@mobilemark.com`). Ken's name and email (`ken@mobilemark.com`)
  filled in from the 2026 Sales Team sheet; "Syynex" alias added. Every
  other state, province, international region and exception is unchanged
  (checked line by line against the PDF).
- `packages/db/src/sales-territory.test.ts`: Central US → BC, MCE → BC,
  no NB left (18 pass).

**How and why**
- Same edit applied to the Doc Scanner, Blue Folder and MM-Analytics
  copies the same day so all four agree.

**Deviations**
- Bryant has no MM-CRM `User` yet, so `assignRep` returns his email and
  webform leads for Central US land unassigned (shared pool, logged
  "Territory rep has no local User") until his account exists. Before
  this change they would have gone to Nino's still-existing user.
- Nino still owns 1,203 companies in MM-CRM (account owner, not territory);
  not changed here.

**What's next**
- Create Bryant's MM-CRM user when Jordan prepares his accounts; then add
  his Sage / Django user IDs to the map.

### 2026-10-01 — Sage cursor time zone fix shipped + catch-up

Plan: `docs/plans/sage-crm-sync.md` §6 (incremental), corrected note
added there.

**What was completed**
- `apps/api/src/sage/sage-clock.ts` (new): `toSageClock` formats
  an instant as `America/Chicago` wall time; `fromSageClock`
  parses a Sage string to the real instant (DST-safe; repeated
  fall-back hour resolves to the earlier instant).
- `sage.constants.ts`: `SAGE_SERVER_TIME_ZONE`.
- `sage-pull.service.ts`: incremental company + opportunity
  predicates use `toSageClock`. New public
  `repullOpportunitiesSince(since, { dryRun })` (session lock,
  does not move the high-water).
- `sage.mappings.ts`: company / contact / opportunity
  `sageUpdatedAt` use `fromSageClock` (echo guard now compares
  real instants; it used to see Sage edits as 5h earlier).
  `targetclose` / `closed` / `opened` parsing is unchanged.
- `sage-backfill.util.ts`: old UTC `sageDate` removed.
- `scripts/sage-backfill.ts`: `--opportunities-since=<Sage time>`;
  imports `CrmModule` (script could not start on `main` —
  `DealChangeRecorder` missing).
- Tests: `test/sage-clock.spec.ts` (11), backfill spec updated.
  Sage specs 59/59. Full api suite: same 6 pre-existing fails
  as `main` (Auth e2e, CompanyResolveService).
- Deployed api `5b37dce`, then `dff0909`. Commits rebuilt with
  `git commit-tree` to drop the Cursor co-author trailer.
- Prod catch-up inside the api container:
  `bun run scripts/sage-backfill.ts --opportunities-since=2026-08-02T00:00:00`
  → 271 fetched, 270 upserted, 1 skipped (807, no company).
- Real changes recorded (source `sage`): 12 close dates (361,
  467, 502, 509, 584, 587, 605, 663, 694, 703, 713, 788); 502
  Closed Won $56,466 (closed 7 Sep); 206 Won; 568, 643 Lost;
  314 Sage stage Lost. New deals 803 (Lost) and 849.
- Deleted 35 `dealFieldChange` rows from that run that moved
  `expectedCloseDate` back exactly one day. Cause: the 3 Aug
  backfill ran on a Mac (Central) and parsed `targetclose` as
  Central; the api container parses it as UTC. Same Sage
  value; Central display unchanged.
- Verify: live SOAP vs prod snapshot for all 271 opportunities
  saved since 2 Aug → 0 stale.

**How and why**
- User asked that Sage changes never be skipped again. Proof of
  zone: the misses were exactly 01:00–05:00 Sage time, and
  `targetclose` shows 22:00 in summer, 21:00 in winter (DST).

**Deviations**
- `targetclose` parse left as host-local (UTC in prod). Changing
  it would shift every stored close date and log a change row
  per deal. `sageDateForPush` also left as is.
- `railway ssh … psql` hangs when stdin is open on long output;
  append `< /dev/null`.

**What's next**
- Watch the 2 Oct 06:00 UTC `cron-sage`. The cursor is
  `2026-10-01 14:52 UTC`; the predicate should read `08:52`
  Central. Opp 807 needs a company set in Sage.
- Optional: a one-time normalise of Aug-backfill
  `expectedCloseDate` values to the UTC parse, so the next
  Sage edit on those deals does not log a one-day move.

### 2026-10-01 — Sage 1am–5am cursor gap count

**What was completed**
- Read-only compare of live Sage opportunities with
  `updateddate > 2026-08-04` (254 rows, 3 SOAP pages)
  against prod `sageRecordSnapshot` (579 rows).
- 52 opportunities are still older in the CRM than in
  Sage. Every one of those Sage save times is between
  01:00 and 05:00. Zero stale rows sit outside that
  window. Nights: 31 Aug (7), 1 Sep (1), 28 Sep (44).
- 9 of the 52 have a different `targetclose`. The other
  43 have the same Close By.
- Never imported: 803 (28 Sep 01:47), 849 (15 Sep 05:01,
  edge of the same window), 807 (5 Aug 09:02, outside
  this window).
- Cause: `sageDate()` in `sage-backfill.util.ts` formats
  the cursor in UTC. The API container is UTC. Sage
  `updateddate` is Central wall time. The 1:00 AM CDT
  pull then asks next time for saves after ~5:00 AM.

**How and why**
- User asked how often the close-date miss can happen
  and how many rows are still wrong.

**Deviations**
- Temporary `apps/api/scripts/sage-stale-audit.ts` was
  used for the SOAP read and then deleted.

**What's next**
- Format `sageDate()` in `America/Chicago`.
- One opportunity catch-up for
  `oppo_updateddate > '2026-08-31T00:00:00'` so the 52
  (and 803 / 849) land. Do not rely on tonight's cron;
  the cursor is already past those saves.

### 2026-10-01 — Manual Sage sync for missed close dates

**What was completed**
- Rewound prod `sageSyncState.highWaterUpdatedAt` for
  company and opportunity to `2026-09-30 00:00:00+00`,
  then ran `GET /internal/sync/sage` on the api container.
- Pull outcome ok in ~70s: 217 companies, 619 contacts,
  11 deals. Push processed 0 (no pending outbox).
- Close dates now match live Sage `targetclose`:
  opp **664** and **832** are `2026-11-29 21:00:00`.
  Also updated **642**, **787**, **813** (same 1:00 AM
  CDT window on 30 Sep). Cursor is `2026-10-01 14:52 UTC`.

**How and why**
- A plain incremental run would skip these. Their Sage
  `updateddate` values sit after the 1:00 AM CDT query
  and before the next cursor (`updateddate` string
  compared to a UTC `sageDate()`). User asked to sync
  production now so the deals table gets the dates.

**Deviations**
- Cursor was moved back on purpose so this run could
  see the missed rows. It is advanced again to the
  run start.

**What's next**
- The 1:00–5:00 AM CDT gap can miss saves every night
  because `sageDate()` formats the cursor in UTC and
  Sage `updateddate` is Central wall time. Fix
  `sageDate()` / the incremental predicate so the next
  nightly pull does not skip that window.

### 2026-10-01 — Opp 664 Close By is November in Sage

**What was completed**
- Deal `cmscp7f151p14ob8ogiaujn33` / Sage opportunity **664**
  / quote `Q260608-001` (Harry Kim, Westermo).
- CRM `expectedCloseDate` is `2026-07-31 03:00:00`. Snapshot
  from `2026-08-03` has `targetclose` `2026-07-30T22:00:00`
  and `updateddate` `2026-06-30`.
- Live SOAP read: `targetclose` `2026-11-29T21:00:00`,
  `updateddate` `2026-10-01T03:49:10`. Same field we map.
  Amount `32385` is unchanged.
- Last `cron-sage` (1:07 AM CDT) did not include 664.

**How and why**
- Ken sees Close By in November. The CRM shows 31 Jul.
  Close By is Sage `targetclose`. The CRM copy is from the
  3 Aug import. Sage saved the row at 03:49, after the
  1:07 AM CDT pull. API container timezone is UTC.

**Deviations**
- None.

**What's next**
- Wait for the 2 Oct 06:00 UTC pull, then confirm deal
  664 `expectedCloseDate` is 29 Nov 2026. If it is still
  31 Jul, the incremental `oppo_updateddate` predicate
  missed this row and needs a one-id re-pull.

### 2026-10-01 — Harry Kim opportunities, last 7 days

**What was completed**
- Read-only prod count for owner `sage-user-1` (Harry Kim,
  `hkim@mobilemark.com`).
- 5 of 72 Sage-linked deals have `sageUpdatedAt` in the
  last 7 days: 685, 860, 641, 854, 704.
- Opportunity 832 is his. Its `sageUpdatedAt` is
  `2026-08-27`, outside the window.

**How and why**
- Follow-up to the opp 832 close-date check.

**Deviations**
- None.

**What's next**
- Same as the opp 832 entry: wait for the 2 Oct pull, or
  check live Sage `updateddate` on opportunity 832.

### 2026-10-01 — Sage opp 832 close date

**What was completed**
- Read-only prod query via `railway ssh -s Postgres`.
- Deal `cmtcjy84707pp01rrmw6r180i` (Sage opportunity 832,
  quote `Q260827-002`): `expectedCloseDate` is
  `2026-09-29 22:00:00`. Snapshot `targetclose` matches.
  Snapshot `updateddate` is `2026-08-27T19:54:21`.
  Snapshot row `updatedAt` is `2026-08-28 06:10 UTC`.
  No `dealFieldChange` rows on this deal.
- Last `cron-sage` at `2026-10-01T06:07:41Z` was ok after
  one 503 retry. It upserted 5 deals: Sage ids 685, 857,
  858, 859, 860. Opportunity 832 was not in that set.

**How and why**
- A user changed the Sage close date to about 30 Nov 2026
  and still sees 29 Sep 2026 in the CRM. The stored Sage
  copy has not changed since 28 Aug.

**Deviations**
- None.

**What's next**
- If the Sage edit was after 06:07 UTC on 1 Oct, wait for
  the 06:00 UTC pull on 2 Oct. If the edit was earlier,
  check live Sage `oppo_updateddate` on opportunity 832.
  The incremental pull only fetches rows newer than the
  high-water mark.

### 2026-09-30 — 2am Railway crash check

**What was completed**
- Read-only Railway check of production MM-CRM
  (`406256f8-aff6-422c-a980-9607e66a870b`).
- Crash events, cron logs, api logs, Postgres logs,
  and HTTP edge logs for 07:25–08:05 UTC.

**How and why**
- User asked why the app crashed many times around 2am.
  The CRASHED events are the five-minute curl crons,
  not the app, api, or agent containers. They failed
  because the public API returned 404, then 500
  (`getaddrinfo ETIMEOUT` on `account.findMany`), then
  a 524/499 hang on the sequence tick. Postgres stayed up.

**Deviations**
- None.

**What's next**
- No deploy. If this repeats, check API DNS to Postgres
  and the Cloudflare path in front of
  `api.mobilemarksalestool.com`. Webform mailbox
  `Access is denied` is a separate Graph permission issue.

### 2026-09-15 — Sage cron follow-up (clean night)

**What was completed**
- Read-only `cron-sage` + api logs for last night.
- Sep 15 06:02 UTC: first-try HTTP 200, no walk restart.
  Pull 226 companies / 585 contacts / 0 deals / 811
  snapshots. Push idle (`processed=0`).

**How and why**
- User asked if we were all good after the Sep 14 check.
  Last night was the first run after that review and it
  picked up the extra company/person volume from Sep 14
  daytime Sage edits.

**Deviations**
- None.

**What's next**
- No pull action. Quiet deals remain a Sage-side fact
  until opportunities change again. Failed outbox 821
  is still a separate push item.

### 2026-09-14 — Sage prod sync health check

**What was completed**
- Read-only check: Railway `cron-sage` + `api` logs,
  prod `SageSyncState` / snapshots / outbox (temporary
  TCP proxy, deleted after), and a live Sage SOAP count
  of recent opportunities.
- Last five nights (Sep 10–14) all finished
  `pull.outcome=ok`. 503 on first curl Sep 10, 11, 14;
  retry succeeded. This morning: 188 companies, 264
  contacts, 0 deals, 452 snapshots.
- Cursor is current: both entities `IDLE` /
  `incremental`, `highWaterUpdatedAt` 2026-09-14T06:04:53Z,
  `lastError=null`. Last 7 days: 1364 company / 2612
  person snapshots, **5** opportunity snapshots (opps
  845–848, 665). Last Sage deal field change 2026-09-09.
- Live SOAP: 0 opportunities with `oppo_updateddate`
  after 2026-09-10. Sage itself has not changed deals
  since opp 848 on Sep 9. Company updates from today
  afternoon wait for tonight's cron (last pull 1:05 AM
  CDT).
- `SageOutbox`: 2 failed (opp 821 UnexpectedEvent;
  contact create, parent not in Sage). One-shot scripts
  deleted; proxy list empty.

**How and why**
- User was not seeing many new/updated records and
  asked whether Railway Sage sync was broken. Cron JSON
  + DB + SOAP agree: company/person incremental is
  moving; opportunity volume is genuinely ~0 since
  Sep 9.

**Deviations**
- None. Investigation only; no code or schema change.

**What's next**
- No pull fix required. Optional: tonight's 06:00 UTC
  cron will pick up today's Sage company edits. Failed
  outbox opp 821 is a push issue, not pull. Quiet
  pipeline pulse is expected until Sage opportunities
  change again.

### 2026-09-11 — Separate won vs new-pipeline chart colors

**What was completed**
- New pipeline on the overview area chart uses
  `--chart-2` (blue). Closed won stays `--success`
  (green). File: `sales-dashboard.tsx`.

**How and why**
- Both series used green (`--success` and `--chart-1`).
  The legend and plot were hard to tell apart.

**Deviations**
- None. Used existing categorical tokens; no new hex.

**What's next**
- Hard-refresh Everyone after this push.

### 2026-09-11 — Everyone recent activity is CRM-only

**What was completed**
- Everyone overview no longer includes mailbox rows:
  `EMAIL` activities, email threads, calendar events, or
  “Company/Contact added from your inbox”.
- Me still shows the signed-in user's mail.
- Copy: “Notes, tasks and stage changes across the team.
  No mail.”
- Files: `dashboard.service.ts` `recentActivityWhere`,
  `dashboard-summary.tsx`, `dashboard-range.spec.ts`.

**How and why**
- The prior Everyone filter kept the viewer's own inbox
  (`createdById = me`). That leaked team-adjacent mail
  subjects and inbox creates onto a shared analytics tab.

**Deviations**
- None vs the ask (CRM / opportunity only; no email).

**What's next**
- Hard-refresh Everyone after this push.

### 2026-09-11 — Owner-only deal stage changes

**What was completed**
- Stage moves are owner-only. An admin may still edit
  other deal fields and reassign the owner.
- Helper `canChangeDealStage` in
  `packages/auth/src/admins.ts`. Tests in
  `packages/auth/test/admins.spec.ts`.
- API: `DealsService.setStage` uses
  `assertCanChangeStage` (403:
  "Only the deal's owner can change its stage.").
- UI: `canChangeStage` from `useDealEditAccess`.
  Sheet header menu, stage rail, deals table, company
  and contact deal lists all lock for non-owners.
  Tooltip: "Only the deal owner can change the stage".
- Verified locally as jjohnson on Harry Kim's Bosch
  India deal (`#Q260622-003…`): rail and header
  disabled; `setStage` 403. Jordan's own test deal
  still has an enabled stage control.

**How and why**
- Jordan is in `CRM_ADMIN_EMAILS`, so `canEdit` was
  true on every deal. Stage used that flag. Forecast
  follows stage, so only the assigned rep should move
  it.

**Deviations**
- None. Other field edits stay admin-or-owner.

**What's next**
- Deploy **api** + **app**. Confirm Harry Kim's Bosch
  India sheet shows a locked Investigation control
  when signed in as jjohnson.

### 2026-09-11 — Hide overdue tasks on Everyone overview

**What was completed**
- Everyone (`scope=everyone`) no longer renders the
  Overdue tasks card. Deals in progress uses the full
  row. Me still shows the two-column pair.
- File: `apps/app/app/(app)/dashboard-summary.tsx`.

**How and why**
- Team overdue tasks are not this page. The empty
  “your tasks” column on Everyone wasted half the
  deals table.

**Deviations**
- None. API still returns `overdueTasks` on Everyone;
  the card is hidden in the UI only.

**What's next**
- Hard-refresh Everyone on prod. Deals in progress
  should be full width.

### 2026-09-11 — DealQuote `isPrimary` is a disambiguator

**What was completed**
- Attach no longer marks the first quote on a deal as
  primary. New rows start false. After insert,
  `reconcileQuotePrimaries` sets exactly one true row
  per colliding `quoteNumber`. Unique numbers stay false.
- Tie-break (mechanical): full id in the deal name, then
  fewest quotes on that deal, then source rank
  (HUMAN → SAGE_NOTE → PO_TOOL → SAGE_DESCRIPTION), then
  earliest `createdAt`.
- `setPrimaryQuote` now clears that number on every deal,
  then sets this row. `removeQuote` deletes and
  re-reconciles the number.
- Deal sheet titles: “Primary deal for this quote number”
  / “Mark this deal as the primary match”.
- Files: `quote-number.ts`, `deals.service.ts`,
  `backfill-deal-quotes.ts`,
  `repair-deal-quote-primaries.ts`, `deal-sheet.tsx`,
  `schema.prisma` comment, `sage-crm-sync.md` §3.3,
  `test/quote-number.spec.ts` (18 pass).
- Prod data (TCP proxy, then deleted): 11 collisions
  repaired (`Q260413-003` 8→1). Attached `Q260622-002`
  to `#Q260622-001 & 002: …` (sage 679). 202 rows.
  Unique still-primary: none.

**How and why**
- Analytics exact-id is live. All-primary clones left
  `matched_opportunity_id` null (`deal_quote_ambiguous`).
  `deal_quote_primary` stays unused until exactly one
  primary per colliding number. Do not parse
  `opportunity_name`. Do not store `SavedQuote.id`.

**Deviations**
- Optional 002 attach is a one-shot observed title
  (`Q260622-001` + `& 002`). Parser still ignores
  `#Q260703-001 & 002`. Orphans not in `fct_quotes`
  left alone.

**What's next**
- Nightly warehouse cron `0 9 * * *` UTC re-pulls.
  `deal_quote_primary` should start filling.

### 2026-09-11 — Overview Overdue KPI + locked/live board

**What was completed**
- Dropped the Lost tile. Win rate still shows won · lost.
- Added **Overdue**: open, `expectedCloseDate` before now.
  Same rule as Deals → Closing → Overdue. Not Stuck
  (14d no stage move). API: `overdueOpenWhere` +
  `overdueOpenTotal` on `dashboard.summary`.
- KPI board is two 2×2 clusters. Left locked (inverted,
  ignores the date range): Due this month, Open pipeline,
  Overdue, Stuck. Right live (follows the range): Closed
  won, Win rate, Won, Deal Maturity moves.
- UI primitives: `StatBoard`, `StatGroup` `columns="pair"`
  / `tone="locked"`, `StatCard` `tone="locked"`.

**How and why**
- User asked for a locked tile for open deals past
  scheduled close, and to group four locked vs four live.
  Stuck was already the inactivity name, so the new tile
  is Overdue.

**Deviations**
- None vs the ask. Locked fill uses `foreground` /
  `background` tokens (design invert), not a new grey.

**What's next**
- Sign in locally and flip the date range: locked four
  stay put; live four move. Deploy api + app.


### 2026-09-11 — Filter recent deal moves by rep and change

**What was completed**
- Recent deal moves on the overview now filter by rep and by
  change reason (Won, Lost, Stage, Deal Maturity, Amount, Close
  date, Owner, Priority, Sage stage).
- URL keys: `pulseRep`, `pulseChange`. Shared parsers in
  `apps/app/app/(app)/overview-search-params.ts` (`pulseFeedParsers`)
  so the rest of the dashboard does not re-render on filter change.
- New mechanical query `dashboard.pulseRecent` →
  `loadPipelinePulseRecent` in `packages/db/src/pipeline-pulse.ts`.
  Same date range as the pulse strip. Used only when a filter is
  on, so the unfiltered 24-row slice stays on `summary.pulse`.
- UI: two `Select`s in the card header (`pipeline-pulse.tsx`).
  Rep filter hides on Me. Empty copy changes when filters hide
  every row.
- Tests: `packages/db/test/pipeline-pulse.spec.ts` for
  `pulseChangeWhere` / `pulseOwnerWhere`.
- tRPC types regenerated (`apps/api/src/generated/server.ts`).

**How and why**
- Client-only filter of the latest 24 rows would hide most Amount /
  Owner / Priority moves on a year-long range. The extra query
  fills the table with matching rows from the same window.
- Me already scopes to the signed-in owner; a leftover `pulseRep`
  is ignored (`pulseOwnerWhere`).

**Deviations**
- None vs the ask (filter by rep + change reason). Sort was not
  added — the feed stays newest-first.

**What's next**
- Sign in locally and click the two selects on Everyone. Local
  `dealFieldChange` is empty, so the table stays empty until a
  Sage pull or a deal edit writes rows. Query filters were
  checked with a rolled-back insert (amount / won / rep).
  Deploy api + app when ready.

### 2026-09-11 — Ship DealQuote `bd6e7b5` + warehouse CRM pull

**What was completed**
- Commit `bd6e7b5` on `main` (`origin/jj-mobilemark/crm`).
  api / app / agent deployed SUCCESS.
- Prod: migrate `dealQuote`, `GRANT SELECT` to
  `mm_analytics_reader`, `backfill-deal-quotes.ts` via
  `railway ssh -s api` — **201** quotes on **191 / 566** deals.
- Warehouse CRM pull (cron redeploy only ran migrations;
  cron SSH is idle). Ran extract + dbt on
  `mm-analytics-ingest` with cron `EXTRACT_MODE=mm_crm`:
  deals **566**, companies **14,335**, users **17**, field
  changes **353**, activities **963**, deal contacts **542**.
  dbt snapshot PASS=3, freshness 11/11, build
  **PASS=174 WARN=0 ERROR=0**. Marts:
  `fct_sales_pipeline` 566, `dim_company` 14,335,
  `fct_quotes` 751.

**How and why**
- User asked to commit, push, wait, then pull CRM with the
  Railway CLI. Same-project ingest can reach private CRM +
  warehouse DNS. Did not run open-orders or Blue Folder
  (cron has no `BLUE_FOLDER_MODE`; fixture would wipe live
  raw). Live Analytics image is still `a14b906` — no
  `extract.mm_crm_deal_quotes` yet (local Analytics work is
  uncommitted).

**Deviations**
- Cron redeploy `69b5a1f5` did not run `run_pipeline.sh`
  (known: pre-deploy migrations only). Pull was SSH ingest,
  not a cron tick.

**What's next**
- Commit and deploy MM-Analytics DealQuote extract
  (`raw.mm_crm_deal_quotes` + exact-id bridge), then pull
  again. Spot-check deal sheet quotes (Sage opp **663**).
  Optional: uncomment GRANT in Analytics
  `docs/mm_crm_reader_role.sql` once that extract ships.

### 2026-09-11 — DealQuote junction + Sage parse + deal UI

**What was completed**
- Prisma `DealQuote` + enum `DealQuoteSource`
  (`packages/db/prisma/schema.prisma`,
  `migrations/20260912040000_add_deal_quote`).
- Parse/expand in `apps/api/src/deals/quote-number.ts`; 13 tests
  in `test/quote-number.spec.ts`.
- Sage pull attaches quotes after every opportunity upsert
  (`sage-pull.service.ts`). Additive; no Sage push on quote edits.
- tRPC `deals.addQuotes` / `removeQuote` / `setPrimaryQuote`.
- Deal sheet Quotes section + deals-table Quotes column.
- Agent preamble + deal search include quote numbers.
- One-shot `apps/api/scripts/backfill-deal-quotes.ts`. Ran on
  local: 166 rows / 158 deals. Plan §3.3 updated.

**How and why**
- Junction (not `text[]`) so `quoteNumber` is indexed and
  `isPrimary` is a real column. Expand `#Q260622-003,4,5,6,7`
  before insert so Analytics can exact-join. Note-like Sage
  fields win over `description`; quoting-tool stamp in the name
  counts as `SAGE_NOTE`.

**Deviations**
- First attached row becomes primary when none exists (note
  order first). On opp 663 that made `Q260526-001` primary, not
  `Q260622-003`. Human can change it. Extra quoting-tool ids on
  that deal were kept (observed, not guessed).

**What's next**
- Prod: migrate `dealQuote`, run
  `bun run scripts/backfill-deal-quotes.ts` (TCP proxy if needed),
  deploy api + app. Tell Analytics the extract table is
  `dealQuote`. They add the exact-id tier. Do not parse names in
  the warehouse.

### 2026-09-11 — Deal quote-number contract locked with Analytics

**What was completed**
- Locked CRM shape from the 2026-09-11 warehouse answers
  (746 quotes, 566 deals). Not built. No schema yet.

**How and why**
- Fuzzy quote↔opp match is 120 high / 598 none. Bosch 663 is
  unmatched because $50–72M quotes ≠ $2.99M deal. Typed
  `quote_number` list is the hard link. Scalar column would drop
  siblings. `text[]` is weaker than a junction for primary +
  reverse lookup. Do not store `SavedQuote.id`.

**Deviations**
- None vs Analytics ask-back: list + optional primary. Chose
  junction over `text[]` so `quoteNumber` can be indexed and
  `isPrimary` is a real column.

**What's next**
- When asked: Prisma `DealQuote` + Sage parse/expand + deal UI
  + extract column for Analytics. Until then do not add a
  name-parse tier in either repo.

### 2026-09-11 — closedAt forward path (no forecast-as-actual)

**What was completed**
- New `resolvedClosedAt` in `apps/api/src/sage/sage-closed-at.ts`.
  Pull (`sage-pull.service.ts`) and echo-repair script use it.
  Tests: `apps/api/test/sage-closed-at.spec.ts` (9). Plan §3.3
  mapping row updated. `sage-backfill-deal-dates.ts` marked
  RETIRED (old `closed` → `targetclose` → `opened` rule).
- Rules: Sage `closed` when Chicago date is today or earlier;
  else keep a usable existing `closedAt`; else stamp `now` once.
  Open deals → null. Never copy `targetclose` / `opened`.
  Future `closed` rejected. Later sync is idempotent unless Sage
  later sends a real `closed`.

**How and why**
- Forecast was landing in MM-Analytics `closed_date` / Power BI.
  First-observed `now` is only for new closes and future-dated
  rows (query C). Past historical fallback dates stay put so
  nightly sync does not rewrite $7.35M of empty-`closed` wins.

**Deviations**
- Did not backfill history. Did not add a raw-Sage-`closed`
  column (snapshot already has it).

**What's next**
- Deploy **api**. Next Sage pull fixes future `closedAt` (837
  TALLEY, 525, 589). Confirm open deals still have `closedAt`
  null. Leftover talk: historical empty-`closed` label,
  `DealWon` stage name, Investigation+Won hygiene.

### 2026-09-11 — closedAt dry-run (local snapshots + live Sage SOAP)

**What was completed**
- Read-only script `apps/api/scripts/sage-closedat-dry-run.ts`
  (`--soap` for live Won/Lost + `getmetadata`). Nothing wrote.
- Local Postgres is still the Aug 2026 525-deal pull. Prod/Sage is
  current (292 Won / 118 Lost). `dealFieldChange` is empty locally.
- Live Sage has **no extra close date**. Metadata date-ish fields:
  `closed`, `createddate`, `decisiontimeframe` (0 rows), `notifytime`
  (11), `opened`, `timestamp` (= `updateddate` on 410/410),
  `updateddate`. `targetclose` is filled on every Won/Lost row.
- Empty Sage `closed`: 173 Won / $7.35M (Chris Talbert $5.35M of
  that). B (`closedAt` == `targetclose`) is the historical norm, not
  a small bug.
- 2026 YTD won $ by rule: current fallback **$3.11M** (matches the
  Sep 11 $3.1M card); Sage `closed` only **$1.34M**;
  `closed`??`updateddate` **$3.42M**. `updateddate` dumps **$3.0M**
  into Apr 2025 — batch edits, not closes.
- Fixtures (live): **837 TALLEY INC** $256k empty `closed` target
  30 Sep / updated 2 Sep; **665** 200-LTM502 closed=target=9 Sep;
  **795** B2543WN closed 30 Jul target 29 Sep. Sage also stores
  future `closed` on 525 (14 Oct) and 589 (23 Sep).
- Four Sage rows use stage `DealWon` (status Won — already maps).

**How and why**
- MM-Analytics copies `deal.closedAt` into `closed_date` for Power
  BI. Need the blast radius before any transform change. SOAP was
  required because local is stale and the named fixtures are not in
  the August pull as closed.

**Deviations**
- Did not mutate `resolvedClosedAt` or backfill. Did not open a
  prod Postgres proxy.

**What's next**
- Phase 1 only: stop falling back to `targetclose` / `opened`;
  freeze `closedAt` after first close; Sage `closed` still wins;
  reject future dates (including Sage `closed` in the future).
- Do not rewrite the 173 historical empty-`closed` Won rows to
  `stageChangedAt` or `updateddate`.
- Then talk through leftover items (Analytics month restatement,
  DealWon label, Investigation+Won hygiene).

### 2026-09-11 — Restart Sage incremental walk on pagination `next` faults

**What was completed**
- Nightly `cron-sage` first attempt was HTTP 503 two nights in a row
  (Sep 10 `List index out of bounds (75)`, Sep 11 `Query failed to
  run successfully.`), then curl `--retry-delay 90` succeeded on a
  fresh `query`. Those SOAP `next` faults were not in
  `isSageWalkRestartable`, so the API failed the request instead of
  restarting the walk.
- `isSagePaginationFault` now matches those two strings.
  `isSageWalkRestartable` includes it (still only used by the
  company/opportunity incremental walk). Cap unchanged:
  `SAGE_SESSION_RESTART_LIMIT = 2`.
- Files: `apps/api/src/sage/sage.constants.ts`, comments in
  `sage-pull.service.ts`, `apps/api/test/sage-session-lost.spec.ts`,
  `docs/plans/sage-crm-sync.md` §6.8.

**How and why**
- Sage `query`/`next` is session-stateful; a wedged `next` cannot
  resume. Upserts are idempotent and high-water only advances after
  a full walk, so an in-process restart is the same recovery curl
  already did — without a 90s wait or a red 503 in cron logs.
- "Query failed to run successfully" stays a non-transport, non-
  session-lost fault (`isSageTransientFailure` / `isSageSessionLost`
  unchanged). It is restartable only via the pagination helper, and
  only on this walk — it is still a sticky error on `case` /
  `quotes` / `orders` probes.

**Deviations**
- Earlier tests treated "Query failed to run successfully" as
  *not* walk-restartable, to keep it distinct from session loss.
  Prod evidence (Sep 10–11) showed it is a transient `next` flake
  on company/opportunity, so the walk-restart test now expects true.

**What's next**
- Deploy **api**. Watch tonight's `cron-sage` (06:00 UTC): first
  attempt should log a walk-restart warning and return HTTP 200,
  not 503 + curl retry. `curl --retry 3` stays as the outer net.

### 2026-09-09 — Sage Deal.currency: map lookup id 1 → USD

**What was completed**
- Sage opportunity pull no longer writes the literal currency id
  `"1"` onto `Deal.currency`. `mapSageCurrency` in
  `apps/api/src/sage/sage.mappings.ts` maps confirmed Sage lookup
  ids (`1` → `USD`), keeps a 3-letter ISO code, and defaults blank /
  unknown non-ISO values to `USD`. `mapOpportunity` uses it.
- Incremental Sage sync rematerializes existing leaked ids at the
  start of `runIncremental` (`sage-pull.service.ts`) via the same
  mapper, so the next cron corrects the ~78 bad prod rows without
  a standalone SQL UPDATE.
- Tests in `apps/api/test/sage-mappings.spec.ts`. Plan note in
  `docs/plans/sage-crm-sync.md` §3.3. MM-Analytics untouched.

**How and why**
- Production 2026-09-09: ~78 of 564 deals had `currency = '1'`
  (Sage currency id leaking through); the rest were `USD`. Power BI
  therefore showed a slicer of `"1"` and `"USD"`. Incremental pull
  only rewrites recently changed opportunities, so a mapper-only
  fix would leave stale rows until Sage touched them. Rematerialize
  on the next sync is the repair path the request asked for.
- No FX: amounts stay as Sage sent them. Only the code is
  normalised. The only confirmed Sage currency id in this tenant
  is `1` = USD.

**Deviations**
- None from the request. Unknown numeric ids (none seen in prod)
  also become `USD` so a Sage id cannot land on the column again.

**What's next**
- Done on prod. Warehouse / MM-Analytics needs no change — it copies
  `deal.currency` as-is and only warn-tests USD. Nightly `cron-sage`
  will keep using the mapper.

### 2026-09-03 — Sage cron health re-check (Railway logs + prod DB)

**What was completed**
- Read-only check on project `MM-CRM` / `production`, `cron-sage`
  service, plus a direct (read-only) query against prod Postgres.
- `cron-sage` deploy logs for the last 8 days (Aug 28 – Sep 3): six
  clean nights (no `curl` error, meaning HTTP 2xx) and **one hard
  failure on 2026-08-30 06:02 UTC** — `curl: (22) The requested URL
  returned error: 503`, after retries. Checked `api` deploy logs for
  the same window: **no `SageSyncController` log lines at all** (no
  "Sage sync finished with a hard failure", no `/internal/sync/sage`
  HTTP line) — the request never reached the Nest app, so this reads
  as a private-network blip between `cron-sage` and `api`, not a Sage
  SOAP/session failure. No `api` restart in that window either.
- Confirmed via `SageSyncState` (temporary TCP proxy, deleted after):
  `company` and `opportunity` both `status=IDLE`, `phase=incremental`,
  `lastError=null`, `highWaterUpdatedAt` = **2026-09-03T06:02:04Z**
  (this morning's run). `company.processed` = 14,254.
  `SageRecordSnapshot`: 1,192 rows touched in the last 24h, 4,650 in
  the last 7 days, most recent at 06:03:49 UTC today. `SageOutbox`:
  5 `done`, 1 `pending`, **0 `failed`**. 233 companies / 985 contacts /
  8 deals updated in the last 24h (any source, not Sage-only).
- One-off diagnostic script (`apps/api/scripts/sage-status-check.ts`)
  was written, run via `run-via-tcp-proxy.ts`, then **deleted** — not
  meant to be a permanent script. TCP proxy created then removed
  (`list_tcp_proxies` confirmed empty after).

**How and why**
- User asked to check Railway for whether the Sage sync is running
  successfully, pointing at `docs/plans/sage-crm-sync.md`. Log-only
  evidence (Aug 30 gap) wasn't conclusive on its own, so cross-checked
  against `SageSyncState` / `SageRecordSnapshot` / `SageOutbox` directly
  — the authoritative signal — via the standard temporary-TCP-proxy
  pattern in `AGENTS.md`.
- The idempotent design (§6.8 of the plan) means the Aug 30 gap is not
  data loss: the incremental cursor didn't advance that night, so the
  ~1h overlap plus every following night's `comp_updateddate > cursor`
  query re-covers anything missed.

**Deviations**
- None. Investigation only; no code or schema changes shipped.

**What's next**
- Sage sync is healthy as of 2026-09-03. No action required. If the
  Aug 30-style 503 (private-network, not app-level) recurs often,
  worth a Railway support / metrics look at `api`'s private-network
  reachability during that nightly window — not a Sage code issue.

### 2026-08-24 — Sage cron health (Railway logs)

**What was completed**
- Read-only Railway check on project `MM-CRM` / `production`.
- `cron-sage` last run 2026-08-24 06:04 UTC (1:04 AM CDT): SUCCESS.
  API `GET /internal/sync/sage` 200 in 47.2s.
- Pull JSON: 183 companies / 258 contacts / 0 deals / 441 snapshots /
  3 skipped. Push: 0 processed (empty outbox).
- Last 7 nights (Aug 18–24) all `pull.outcome=ok` / `push.outcome=ok`.
  Aug 21 spike: 1339 companies / 2177 contacts / 4 deals.

**How and why**
- User asked how to verify Sage sync beyond the GUI SUCCESS badge.
  Used `railway logs --service cron-sage --since 8d` (curl prints the
  JSON body) and `api` logs for `Sage incremental finished`. No TCP
  proxy; Postgres SSH key not set up.

**Deviations**
- None. Investigation only.

**What's next**
- No Railway action required. Optional: query `sageSyncState` /
  `sageRecordSnapshot.updatedAt` via a temporary TCP proxy if you need
  which rows actually changed vs re-upserted.

### 2026-08-21 — Hide other people's mail on Everyone overview

**What was completed**
- Overview Recent activity on `scope=everyone` no longer lists other
  reps' synced email subjects or calendar titles. Filter:
  `recentActivityWhere` in `apps/api/src/dashboard/dashboard.service.ts`.
  Copy in `apps/app/app/(app)/dashboard-summary.tsx`. Tests in
  `apps/api/test/dashboard-range.spec.ts`. Dropped `body` from this
  payload so snippets never ride the overview.

**How and why**
- Mail sync projects one `Activity` per thread (`emailThreadId`) and
  per calendar event (`calendarEventId`). Everyone was `where: {}`, so
  the latest 12 rows were almost all other people's inbox. Everyone
  means team pipeline, not shared mailboxes. Overdue tasks already
  stayed on the acting user.

**Deviations**
- None. Company / contact timelines still show matched mail for that
  record (account history, not a workspace dump).

**What's next**
- Deploy **api** + **app**. Confirm
  `/?scope=everyone&range=this_month` Recent activity shows team CRM
  rows plus your own mail only.

### 2026-08-18 — Closed won full month + repair Sage stage drift

**What was completed**
- Overview "This month" now spans the calendar month (1st → next
  1st), so Won deals dated later this month count. File:
  `apps/api/src/dashboard/dashboard.service.ts`. Test:
  `apps/api/test/dashboard-range.spec.ts`.
- Echo-guard TTL 2 hours (`SAGE_ECHO_TTL_MS`). Sage often leaves
  `updateddate` unchanged after our push; a permanent skip froze
  local rows. Files: `sage.constants.ts`, `sage.mappings.ts`,
  `test/sage-mappings.spec.ts`.
- Prod repair from snapshots: **71 deals** remapped to match Sage
  status (incl. opp **799** Proposal → Closed won). Script:
  `apps/api/scripts/sage-repair-stale-echo.ts`. Second dry-run:
  drifted=0. TCP proxy created then deleted.

**How and why**
- User asked to count the rest of the month and to fix 799.
  799: Sarah marked Closed won in the app (3 Aug 20:16 UTC),
  push succeeded, Sage `updateddate` stayed 15:16, nightly pull
  echo-skipped, Aug 4 sageStage migration rewrote stage to Quote.
  Same class: Sage status Won/Lost still sitting on open local
  stages.

**Deviations**
- Repaired all 71 drifted rows, not only 799 — they were the
  same mapping error.

**What's next**
- Deploy **api** so "This month" Closed won uses the month-end
  window (~$65.5K for August, plus 799). Data repair is already
  on prod Postgres.

### 2026-08-18 — Verify overview Closed won vs Sage

**What was completed**
- Live Sage SOAP: 269 Won opportunities. Dashboard-rule August
  (Sage `closed` → `targetclose` → `opened`): **11 deals / $65,482**.
  Sage `closed` in August: **1 deal / $5,207**. 156/265 Won deals
  have no Sage `closed` date ($6.7M). July dashboard-rule:
  **11 deals / $524,328** (matches the overview prior-period
  $524.3K).
- Prod replica (temporary TCP proxy, then deleted): **10 Closed
  won** with August `closedAt` totaling **$65,468**. Sync high
  water 2026-08-18 06:04 UTC. Opp 799 is Won in Sage, still
  Proposal locally ($14).
- Root cause of the $11.9K card: overview `this_month` is
  `[month start, now)` in `dashboard.service.ts` `resolveRange`.
  Four deals with `closedAt` already past (710, 770, 808, 771)
  sum to $11.9K. Six more Won deals have `closedAt` = Sage
  target close later this month (691 $23.6K, 789 $8.1K, 793
  $7.1K, 779 $6.2K, 708 $4.9K, 773 $3.7K).

**How and why**
- User saw $11.9K Closed won (Everyone / This month) and asked
  to check Sage. Queried Sage SOAP (Won + `oppo_closed` +
  August `updateddate`) and prod `Deal` / `SageSyncState`.

**Deviations**
- None. Investigation only; no code change.

**What's next**
- If the card should show the full August Won total (~$65K),
  either count calendar-month `closedAt` through month-end, or
  stop using `targetclose` as `closedAt` for already-Won Sage
  deals (use Sage `closed`, else `updateddate`). Do not ship
  that without a product call — July already matches Sage.

### 2026-08-18 — Skip upstream v1.14.0; commit Sage walk retries

**What was completed**
- Reviewed trycompai/crm [v1.14.0](https://github.com/trycompai/crm/releases/tag/v1.14.0).
  Last common commit is still `288d41a`. Full merge would mix 150
  upstream commits into 66 fork commits (Sage, Trip, Screening,
  Microsoft, map). Human chose to pass.
- Sage incremental pull: restart the walk on timeouts / connect
  failures as well as "You are not logged on." SOAP timeout 90s.
  Logon retries transport failures 3×; never retries `auth-failed`.
  Files: `sage.constants.ts`, `sage-soap.client.ts`,
  `sage-pull.service.ts`, `test/sage-session-lost.spec.ts`.

**How and why**
- v1.14.0 itself is small (Context.dev people, enrichment queue),
  but taking the tag also pulls organizations, their Microsoft
  module, and 3 Prisma timestamps that collide with this fork.
  Cherry-pick later if those two features are wanted.
- Nightly Sage already recovered from session loss (`5bb4ce0`);
  remaining overnight fails were connect/timeout, so the same
  restart path now covers those.

**Deviations**
- None from the human call to skip the upgrade.

**What's next**
- Deploy **api** so prod Sage cron gets the 90s timeout + logon
  retries. Optional later: cherry-pick upstream #158 / #159 / #160
  onto a branch; do not merge `v1.14.0` onto `main`.

### 2026-08-17 — Railway cron health check (Sage + others)

**What was completed**
- Read-only Railway CLI check on project `MM-CRM` / `production`.
- Confirmed all six cron services exist and are scheduled:
  `cron-sage`, `cron-microsoft`, `cron-sequences`, `cron-webform`,
  `cron-followups`, `cron-daily-tasks`.
- Sage nightly pull/push `ok` for Aug 11–17 inclusive (today:
  183 companies, 258 contacts, 0 deals). No Sage `failed` logs in
  the retained window.
- Other crons hitting 200 in the last day; api 4xx in 24h are
  scanner 404s only (`/`, `/robots.txt`, `/.git/HEAD`).

**How and why**
- User asked to verify Sage sync and Railway cron jobs. Used
  `railway service list`, `deployment list`, and bounded `railway logs`
  (deploy + HTTP). Sage uses the private API host so edge HTTP logs
  do not show it; cron-sage deploy logs carry the JSON body.

**Deviations**
- None. `cron-sage` start command is the internal URL (not the
  public host noted in the 2026-08-06 handoff). That is working.

**What's next**
- No Railway action required. Optional: confirm whether anyone has
  Daily Task Push enabled (`cron-daily-tasks` `considered:0` /
  `sent:0` at 9 AM Chicago).

### 2026-08-07 — Agent auto-enrich gated (manual only by default)

**What was completed**
- `AGENT_AUTO_ENRICH` (default off): `companyCreated` / `contactCreated` /
  `meetingSoon` / `followupsDue` no-op unless explicitly `true`.
- Manual company Re-enrich / Research (`companyRequested`) always queues
  (priority ≥ 100).
- Agent dispatcher retires auto backlog and only claims manual
  company-profile when the flag is off.
- Docs: `.env.example`, `env.validation.ts`, `docs/plans/agent-railway.md`.
- Tests: `apps/agent/test/tasks.integration.spec.ts`.

**How and why**
- Mail sync was queuing research for every new domain/nameless contact
  and burning the Vercel AI Gateway budget with nobody using the Agent
  tab. Code paths stay; flip `AGENT_AUTO_ENRICH=true` on api+agent to
  restore.

**Deviations**
- Daily followups cron is gated by the same flag (also auto AI spend),
  not only identify/company-profile.

**What's next**
- Deploy `api` + `agent` to Railway so prod stops auto-research. No
  env var needed (unset = off). Optionally commit when asked.

### 2026-08-07 — POST /company/resolve for incomplete PO extracts

**What was completed**
- New `POST /company/resolve` for the sister PO intake app when Bill-To
  is missing: weighted signals (MAS hint → email → buyer/letterhead →
  bill-to → phone → ship-to-as-candidate-only), vendor-name reject,
  auto-accept only at confidence ≥ 0.85 with a MAS id and a clear top.
- Extended `GET /company/order-defaults` soft lookups: `?name=` alone,
  `?email_domain=`, `?phone=` return ranked candidates (no longer 400
  when ZIP is absent). Exact `?name=&zip=` unchanged.
- Shared `assertCrmApiKey` helper. Tests against local MCL ENTERPRISES
  (`0007242`) pass. Docs: `docs/plans/sage-crm-sync.md` §7.

**How and why**
- PO pages often only have letterhead + ship-to + email. Resolve must
  understand signal roles and prefer Sage-backed MAS accounts for CUST #;
  intake then calls existing order-defaults for stamp defaults.

**Deviations**
- Response `company_id` / `sage_company_id` are strings (cuid / Sage
  string ids), not integers as in the intake brief — matches this
  schema. `terms_description` only for known codes in a small local map.

**What's next**
- Deploy + smoke from the sister app with the MCL / Urban Transportation
  PO case. Still deferred: tracking / ship_via / freight.

### 2026-08-06 — Order-defaults: add `terms_code` from Sage snapshot

**What was completed**
- `GET /company/.../order-defaults` now returns `terms_code` (Sage 100
  AR code string, e.g. `"03"`) read from
  `SageRecordSnapshot.payload.company.mas_termscode` via
  `Company.sageCrmCompanyId`. No new Prisma column — the nightly pull
  already stores it (~4.8k of ~14k company snapshots filled locally).
- Files: `apps/api/src/sage/order-defaults.service.ts`; plan §7 and
  Current state updated (`docs/plans/sage-crm-sync.md`, `HANDOFF.md`).

**How and why**
- Sister app asked for terms on the stamp; Sage CRM SOAP already carries
  `mas_termscode` on company records. Snapshot join is mechanical and
  avoids a schema migration until the CRM UI needs to show/sort terms.

**Deviations**
- None vs the snapshot-first approach called out in §7.2. Not promoted
  to a `Company` column yet.

**What's next**
- Deploy + smoke a known MAS customer number that has a terms code
  (e.g. local sample CoWAVE / `0006002` → `03`). Still deferred:
  `tracking` / `ship_via` / freight.

### 2026-08-06 — Order-defaults endpoint for the PO-processing sister app

**What was completed**
- New external, read-only lookup for the doc-scanner / PO-processing sister
  app, agreed after a feasibility discussion (see §7 added to
  `docs/plans/sage-crm-sync.md`):
  - `GET /company/:masCustomerNo/order-defaults` — primary lookup by
    `Company.sage100CustomerNo`.
  - `GET /company/order-defaults?name=&zip=` — fallback lookup by name +
    postal code when the caller has no MAS customer number.
  - Both guarded by `X-API-Key` against `CRM_API_KEY` (new optional env
    var, `env.validation.ts` + `.env.example`; constant-time compare,
    503 if unset, 403 on mismatch — same shape as the existing
    `CRON_SECRET` guards but a separate secret/scope).
  - Response fields: `mas_customer_no`, `mas_ar_division_no`, `attention`
    / `phone` / `email` (company's primary contact, falling back to
    most-recently-created contact — the same rule `CompaniesService`
    already uses), `rep_owner` (Company owner ← Sage `acctmgr`) and
    `rep_territory` (from `assignRep()` / `data/sales-territory.json`)
    returned **separately, not reconciled** so the caller can cross-check,
    `is_distributor` (new `isDistributor()` helper — same
    `exceptions.distributors` name list `assignRep` already uses, but
    independent of rep resolution so an ambiguous-rep distributor still
    reports `true`), and `fields_returned` (which of the above came back
    non-null). `tracking`, `ship_via`, `freight_acct`, `terms_code`
    deliberately omitted — no source for them yet.
  - New files: `apps/api/src/sage/order-defaults.service.ts`,
    `order-defaults.controller.ts`; registered in `sage.module.ts`.
  - `packages/db/src/sales-territory.ts`: added `isDistributor()`
    (exported from `index.ts`), plus tests in `sales-territory.test.ts`.
  - `packages/db/prisma/schema.prisma`: `@@index([sage100CustomerNo])` on
    `Company` (was unindexed) — migration
    `20260806190000_add_sage100_customer_no_index`.

**How and why**
- Kept this mechanical (returns stored facts, never infers) so it doesn't
  cross the "intelligence never in the API" line — lives in
  `apps/api/src/sage/` alongside the rest of the Sage-derived data, even
  though it never calls SOAP itself; it only reads what the nightly pull
  already wrote.
- `rep_owner` and `rep_territory` are intentionally two separate fields
  rather than one merged "best guess" — the sister app asked to see both
  so it can reconcile them itself.
- Response is snake_case to match the sister app's existing
  `docs/ENRICHMENT.md`-style contracts (its own repo, not this one).

**Deviations**
- The migration SQL was **hand-written**, not generated by
  `prisma migrate dev` — the sandbox this was built in had no Docker/DB
  access (`permission denied` on the Docker socket). The SQL is a single
  `CREATE INDEX`, matches the format of every other migration in the
  repo, and was verified by `tsc --noEmit` + `bun test`, but it has never
  actually run against a live database. **Run `db:migrate` (or
  `db:deploy` in prod) and confirm it applies cleanly before depending on
  it.**
- No route/API-key guard test was added (the existing `/internal/sync/*`
  controllers don't have unit tests for their guards either — the closest
  precedent, `sage-session-lost.spec.ts`, tests a pure function, not the
  controller). Worth adding an e2e/integration test once there's a DB to
  test against.

**What's next**
- Run the new migration against a real Postgres and generate the Prisma
  client (`db:generate`) — confirm `sage100CustomerNo` index applies and
  nothing else drifted.
- Commit and deploy; set `CRM_API_KEY` in Railway (generate with
  `openssl rand -hex 32`) and hand it to the sister app alongside the
  route docs already given to that team in chat.
- Smoke-test both routes against a couple of known Mobile Mark
  `sage100CustomerNo` values once deployed.
- Longer term (design-only, §7 of the plan): mapping `tracking`/AP email/
  `ship_via`/freight from Sage snapshots or Sage 100 ODBC, if that access
  ever lands.

### 2026-08-06 — Sage cron false-green + daily-tasks empty URL

**What was completed**
- Diagnosed Railway `cron-sage` logs: Aug 5 06:00 pull
  `failed` / `You are not logged on.` while Railway showed success
  (HTTP 200). Aug 6 06:04 + manual smoke `ok` (184 companies; 0 deals
  in window — Overview pulse can look stale when only companies move).
- Code (prod-deployed via Railway upload; **git commit still needed**):
  - `isSageSessionLost` + incremental restart on session drop
    (`sage.constants.ts`, `sage-pull.service.ts`, `sage-soap.client.ts`)
  - `/internal/sync/sage` → **503** on hard failure
    (`sage-sync.controller.ts`) so `curl -f` fails the cron
  - `test/sage-session-lost.spec.ts`
- Railway cron start commands: `cron-sage` + `cron-daily-tasks` now
  call `https://api.mobilemarksalestool.com/...` literally.
  `cron-daily-tasks` had been failing with curl error 3 (empty host)
  despite `API_PUBLIC_URL` showing in variables; `?force=1` smoke OK.

**How and why**
- Session-stateful Sage `next` cannot resume after kick/timeout —
  restart the changed-set walk (idempotent upserts). Make cron health
  match pull outcome. Unblock daily-tasks by not relying on empty
  runtime expansion of `$API_PUBLIC_URL`.

**Deviations**
- Prod api deployed from local tree without a git commit/push — commit
  the Sage files so GitHub and Railway stay aligned.

**What's next**
- Commit + push the Sage sync resilience changes.
- Watch tonight’s `cron-sage` (06:00 UTC): expect green only when
  `outcome:ok`; red + 503 if session drops after restart budget.
- Confirm `cron-daily-tasks` at next 14:00/15:00 UTC run.

### 2026-08-05 — Webform Screening prod wiring (Entra + cron)

**What was completed**
- Entra/Exchange (ops): security group `CRM-Webform-Mailbox-Access`
  (`info@mobilemark.com`) + Application Access Policy RestrictAccess for
  the CRM Entra app Client ID; application `Mail.Read` assumed granted.
- Railway api already had `WEBFORM_MAILBOX=info@mobilemark.com`.
- Created Railway `cron-webform` (curl image, `*/5 * * * *`) calling
  `GET $API_PUBLIC_URL/internal/sync/webform` with `CRON_SECRET`.
- Documented in `.cursor/rules/project-overview.mdc`, this HANDOFF,
  `docs/plans/webform-lead-screening.md`, `docs/plans/agent-railway.md`.

**How and why**
- Finish the ops path so Customer Question mail can land in Screening
  without manual forwards.

**Deviations**
- None. Exchange policy replication can lag up to ~1 hour.

**What's next**
- After `Test-ApplicationAccessPolicy` → Granted for `info@`, smoke
  `/internal/sync/webform` and confirm a Web row on `/screening`.
- Optional: website form webhook later (bypass email).

### 2026-08-05 — Website form leads → Screening

**What was completed**
- Territory: `data/sales-territory.json` + `packages/db/src/sales-territory.ts`
  (`assignRep`, `inferGeoFromForm`) with unit tests.
- Prisma: `PendingWebLead` + `WebformMailboxSync`; migration
  `20260805140000_add_pending_web_lead` applied locally.
- Screening list/count merge mail + web; `claim` + `decide` with
  `source: mail|web`; phone on `createFromScreening`.
- Ingest: Customer Question parsers, app-only Graph token,
  `WebformIngestService`, cron `/internal/sync/webform`; env
  `WEBFORM_MAILBOX` (optional). `Dockerfile.api` copies `data/`.
- UI: one Screening table with Mail/Web badge + Claim for unassigned.
- Docs: `docs/plans/webform-lead-screening.md`; visitor plan points at
  shared territory JSON.

**How and why**
- Replace manual forward from info@ to reps. Territory auto-assign when
  clear; shared claim pool otherwise. Same Screening approve path for
  company match + contact + optional Sage push.

**Deviations**
- None material. App-only Graph (not delegated shared-mailbox) as planned;
  ingest stays off until IT grants application Mail.Read + mailbox policy.

**What's next**
- IT: app `Mail.Read` + access policy for `info@`; set `WEBFORM_MAILBOX`
  on Railway api; add cron for `/internal/sync/webform`; deploy api
  (migrate). Smoke with a real Customer Question message.
- Optional later: website form webhook (bypass email).

### 2026-08-05 — Daily Task Push (Settings + cron)

**What was completed**
- Schema: `User.dailyTaskPush` + `dailyTaskPushLastSentOn`; migration
  `20260805120000_user_daily_task_push` applied locally.
- Microsoft settings switch + `microsoft.setDailyTaskPush` /
  status `dailyTaskPush` + `canSendMail`.
- `DailyTaskPushService` buckets open tasks (Overdue / Due today /
  Due this week / Other), HTML summary, Graph send to self; route
  `/internal/notifications/daily-tasks` (`?force=1` for smoke).
- Railway `cron-daily-tasks` (`curlimages/curl`, `0 14,15 * * *` UTC).
- Docs: `docs/plans/daily-task-push.md`, `docs/plans/agent-railway.md`.

**How and why**
- Reps want a morning task list in Outlook without leaving the CRM
  mailbox path already used by sequences.

**Deviations**
- None vs plan. Cron is live but the api route ships only after the
  next api deploy + migrate.

**What's next**
- Deploy api (migrate + route). Local smoke with `?force=1`. Flip the
  Settings switch with Mail.Send granted.

### 2026-08-05 — Owner ↔ Sage acctmgr push + Trip Planner ownership

**What was completed**
- Company Owner → Sage `acctmgr` push (`acctMgrNameForEmail`,
  `toSageCompanyFields`, `pushCompany`, enqueue on `ownerId` change).
- Local coverage: 5,985 owned / 0 matchable gaps (former reps unmatched
  by design) — no backfill re-run needed.
- Trip Planner owner-aware candidates: `plannerUserId`,
  `ownership` mine/unassigned/other, rank mine first; agent asks before
  scheduling other-owned. Files: `trip-plan.ts`,
  `search_trip_candidates.ts`, `preamble.ts`, `instructions.md`,
  `trip-plans.service.ts`, `packages/db/test/trip-plan.spec.ts`.
- Docs: `sage-crm-sync.md` §3.1, `trip-planner.md`,
  `HANDOFF-SAGE-SYNC.md`.

**How and why**
- Sarah saw another rep's client in Trip Planner because candidates
  ignored ownership. Pull already mapped `acctmgr` → Owner; push and
  trip ranking did not use it.

**Deviations**
- Other-owned accounts stay on the shortlist (ask, do not hard-hide).
- Unmapped/null owners omit `acctmgr` on push (do not wipe Sage).

**What's next**
- Soft smoke Owner edit → Sage Account Manager; Sarah re-test Trip
  Planner in her region. Commit/push when ready.

### 2026-08-04 — Trip Planner: fix must-visit chip labels on reload

**What was completed**
- Added `companies.byIds` (picker-shaped rows for known ids).
- `CompanyMultiPicker` looks up selected ids on load so chips show
  company names after save/revisit, not truncated ids.
- Regenerated nestjs-trpc `server.ts`.

**How and why**
- Labels were only cached in component state after a pick in-session;
  reload had empty cache and no open search, so the UI fell back to
  `id.slice(0, 8)`.

**Deviations**
- None.

**What's next**
- Commit/push when ready; redeploy api + app.

### 2026-08-04 — Trip Planner: prioritize nearby open deals by size

**What was completed**
- `searchTripCandidates`: ACTIVE includes still-open deals even outside
  the look-back window; sort is must-visit → open deals by
  `openPipelineAmount` → other activity → distance; expose
  `openDealCount`.
- Agent copy: preamble, tool note, and `instructions.md` tell the model
  to fill leftover day slots with nearby open-deal accounts (largest
  first).
- Docs: `docs/plans/trip-planner.md` ranking section.

**How and why**
- Reps want trip fill-ins to be other accounts in the area with open
  pipeline, ordered by deal size — not only recent create/close activity.

**Deviations**
- None vs locked decisions (still mechanical ranking in `@crm/db`).

**What's next**
- Redeploy agent + api so prod picks up the ranking/prompt change
  (no new migration).

### 2026-08-04 — Map re-geocode (Open-Meteo, faster)

**What was completed**
- Stale geocodes (place key without state, e.g. `englewood||`) cleared
  via `--refresh-stale` on local + prod.
- Default geocoder switched to Open-Meteo with concurrency 4; Photon
  and Nominatim kept as `--provider=` options. Retryable errors (429)
  are not permanently cached.
- Local: 4888 places in ~330s → 7375 companies updated (3870 ok /
  1008 fail). Prod: 5436 places in ~1218s → 10931 companies updated
  (4367 ok / 1068 fail). TCP proxy deleted after.
- Files: `apps/api/scripts/geocode-companies.ts`,
  `apps/api/src/geocode/open-meteo.geocoder.ts` (new),
  `photon.geocoder.ts`, `docs/plans/companies-map.md`.

**How and why**
- Nominatim at 1 req/s would take ~90 min for ~5k unique places.
  Open-Meteo allows parallel lookups and finished local in ~5.5 min.
- State/country snapshot backfill left old lat/lng; map showed
  Englewood CO near NYC until keys were refreshed.

**Deviations**
- Photon hit 429 / was unreachable from this IP; Open-Meteo became
  the default instead. Ran prod with `--no-fallback` to avoid
  Nominatim rate limits during the bulk pass.

**What's next**
- Commit/push Open-Meteo + script changes if desired.
- Optional: clear failed `GeocodeCache` rows and retry with Nominatim
  fallback for the ~1k miss places.
- Reload `/map` and confirm CO / ambiguous cities look right.

### 2026-08-04 — Trip Planner UI polish

**What was completed**
- Rebuilt `/trip-planner` client UX to match CRM patterns
  (`Empty`, `StatusIndicator`, `FieldSet` / `FieldGroup`,
  `ToggleGroup` for Active/Salvage, numbered itinerary stops).
- Flow: list → focused create → edit workspace (brief | itinerary
  + agent) with back navigation, PDF/Delete in the trip header.
- Files: `apps/app/app/(app)/trip-planner/trip-planner-client.tsx`,
  `page.tsx`; status note in `docs/plans/trip-planner.md`.

**How and why**
- First-pass form was functional but sparse; polish uses the same
  composition as Sequences / Follow-ups so the page reads as part
  of the product, not a wireframe.

**Deviations**
- None vs locked trip-planner decisions (still CRM density, `@crm/ui`
  only — no marketing layout).

**What's next**
- Smoke-test the polished flows locally (empty → create → agent →
  PDF).
- Apply `TripPlan` migration on Railway when deploying API.
- Optional later: map overlay of itinerary stops.

### 2026-08-04 — Trip Planner (v1)

**What was completed**
- Schema: `TripPlan` + `TripActivityMode` / `TripPlanStatus` +
  `AgentConversation.tripPlanId` (migration `20260804150000`).
- Shared loaders: `packages/db/src/trip-plan.ts` (haversine,
  ACTIVE/SALVAGE deals-only, must-visits, itinerary write).
- Nest: `apps/api/src/trip-plans/*` CRUD + hub geocode;
  `companies.nearHub` for the must-visit picker; Sage 100 # in
  company search filter.
- App: `/trip-planner` page, nav Plane icon, multi company picker,
  `TripAgentPanel`, client PDF (`jspdf`).
- Agent: kind `trip` end-to-end (record / bridge / proxy /
  conversations / preamble / tools / transcript VERBS /
  instructions.md).
- Docs: `docs/plans/trip-planner.md`.

**How and why**
- Mirrors pipeline agent specialization: persist brief, pass
  `tripPlanId` in JWT, mechanical candidate query in DB, agent
  sequences days and writes itinerary JSON for PDF.

**Deviations**
- Nav icon is Carbon `Plane` (no `Airplane` in the icon set).
- PDF via `jspdf` rather than `@react-pdf/renderer`.

**What's next**
- Smoke-test locally: create trip → agent plan → PDF download.
- Apply migration on Railway when deploying API.
- Optional later: map overlay of itinerary stops.

### 2026-08-04 — Temporary cheaper agent model (DeepSeek V4 Pro)

**What was completed**
- Switched research agent model from `anthropic/claude-sonnet-5` to
  `deepseek/deepseek-v4-pro` for cheaper testing / token burn.
- Clear TEMPORARY + revert comments in
  `apps/agent/agent/agent.ts` and
  `.cursor/rules/project-overview.mdc`.

**How and why**
- Need a cheaper model while iterating; still want agentic tool use.
- Skipped `openai/gpt-5.6-luna` (economy tier, not a Sonnet peer).
- Skipped Kimi K3 (often pricier than Sonnet on Gateway).
- DeepSeek V4 Pro is tagged for agentic tool orchestration and is far
  cheaper (~$0.44/$0.87 vs Sonnet ~$2/$10). Safer peer if quality
  drops: `openai/gpt-5.6-terra`.

**Deviations**
- Temporary only — plan is to revert to `anthropic/claude-sonnet-5`.

**What's next**
- Redeploy / restart the Railway `agent` service so the new model
  loads. Watch identity-matching quality; revert when testing ends.

### 2026-08-04 — Accepting title/name facts enqueues Sage push

**What was completed**
- `contacts.decideFact`: on accept of `title` or `name`, call
  `sagePush.enqueueAndKick("contact", …)` after the local write.
- Matches the human Details save path so reps do not need a second
  field edit to write back to Sage.
- Files: `apps/api/src/contacts/contacts.service.ts`,
  `HANDOFF-SAGE-SYNC.md`.

**How and why**
- Accepting a signature suggestion is a deliberate human decision onto
  Sage-mapped columns (`title` / `firstname`+`lastname`). Without
  enqueue, the local record updates and Sage stays stale until someone
  remembers to re-save another field.

**Deviations**
- None. LinkedIn/twitter/github accepts still do not push (not in
  `toSagePersonFields`).

**What's next**
- Deploy API; for Lindsay Luba (already accepted before this change),
  re-save Title once or nudge first name to enqueue the push.
- Soft smoke: accept a title suggestion on a Sage-linked contact →
  outbox row → Sage `title` updates.

### 2026-08-04 — Deal Maturity labels + historical grid windows

**What was completed**
- Deal Maturity × rep presets are historical: This month / Last month /
  This quarter / Last quarter / YTD / Custom (dropped Next 30/3m/6m).
- Column headers: stage label on top (larger), % underneath.
- UI copy "Certainty" → "Deal Maturity" on overview, pulse, deals
  table, deal sheet, sales-rep sheet.

**How and why**
- Grid is a lookback, not a forecast. "Certainty" implied win odds;
  maturity = progress through the sales process.

**Deviations**
- None.

**What's next**
- Smoke Everyone grid windows; commit/push when ready.

### 2026-08-04 — Deals Owner default, Stage multiselect, contact company picker

**Completed**
- `/deals` Owner facet defaults to `"me"` (signed-in user) via
  `facetDefaults` in `deals-search-params.ts`; resolved to the real user
  id in `deals/page.tsx` (SSR) and `deals-table.tsx` (client) before
  `deals.list`.
- Stage facet is multiselect: `DataTableFacet.multiple` in
  `packages/ui/.../data-table.tsx` (checkbox menu, comma-joined URL);
  API `parseStageFacet` in `deals.service.ts` accepts one or many
  stages. All `DEAL_STAGE_OPTIONS` always listed (Leads → Unqualified)
  so zero-count stages stay visible with Mobile Mark labels.
- Contact sheet Company field uses searchable `CompanyPicker`
  (`InlineCompanyField` in `inline-field.tsx`; `variant="inline"` on
  `company-picker.tsx`) with Sage 100 # + contact count.

**How / why**
Reps open Deals to work their own pipeline first. Multi-stage filter
matches how they slice open work. Contact reassignment needed the same
disambiguated company search as create/screening (14k+ companies).

**Deviations**
None. Stage labels were already correct in `deal-stage.tsx`; the
dropdown had been hiding Leads/Unqualified when facet count was 0.

**What's next**
Smoke `/deals` (Owner = you; Stage checkboxes; clear Owner → all).
Reassign a contact’s company in the sheet and confirm Sage 100 line.
Optional: same `InlineCompanyField` on the deal sheet Company row.


### 2026-08-04 — Microsoft auto-provision + drop email/password

**Completed**
- Microsoft OAuth may create users on first sign-in
  (`packages/auth/src/auth.ts` — removed `disableImplicitSignUp` for
  Microsoft). `databaseHooks.user.create` still enforces
  `ALLOWED_SIGN_IN` (e.g. `mobilemark.com`).
- Email/password auth disabled (`emailAndPassword.enabled: false`).
- Sign-in UI is Microsoft-only: removed credentials form + “or”
  separator (`apps/app/app/(auth)/sign-in/page.tsx`; deleted
  `credentials-form.tsx`). Copy explains first visit creates the account.
- Docs: `docs/local-setup.md`, `packages/auth/README.md`; env comment in
  `apps/api/src/config/env.validation.ts`.

**How / why**
Colleagues at mobilemark.com should get in with Continue with Microsoft
without an admin pre-creating rows. Entra is already single-tenant; the
allow-list is the second gate for domain emails.

**Deviations**
None. Google button still appears if `GOOGLE_*` is set (hidden here).

**What's next**
Restart the API so auth config reloads. Smoke: a new @mobilemark.com
Microsoft user lands in the app with a new `user` row; a non-domain
account still gets 403. Deploy API + app when ready for prod.


### 2026-08-04 — Certainty by rep grid + lock certainty to stage

**What was completed**
- `dashboard.certaintyByRep` — open deals by `expectedCloseDate`, Closed
  won/lost by `closedAt`; counts by owner × stage
  (`dashboard.contracts.ts` / `.service.ts` / `.router.ts`).
- Everyone UI: `CertaintyByRepGrid` + window control (This month /
  Next 30 / 3m / 6m / Custom) via `certWindow` URL params; placed under
  forecast cards (`certainty-by-rep-grid.tsx`, `sales-dashboard.tsx`).
- Certainty stage-locked: removed deal-sheet edit; dropped
  `update.probability`; Sage `mapOpportunity` uses `certaintyForStage`;
  migration `20260804140000_lock_deal_certainty_to_stage` applied
  locally. Docs: sage-crm-sync §3.3.

**How and why**
- Managers need a printed-forecast-style certainty matrix on Everyone.
- Independent certainty drifted from stage and confused weighted totals.

**Deviations**
- None vs agreed plan (Unqualified omitted from grid columns).

**What's next**
- Smoke Everyone overview: grid + window filter; deal sheet Certainty
  read-only.
- Apply `20260804140000` on Railway `api` when deploying.

### 2026-08-04 — Recent deal moves: Amount column

**What was completed**
- `loadPipelinePulse` now selects deal `amount` and serializes
  `deal.amountCents` on movers/recent rows
  (`packages/db/src/pipeline-pulse.ts`).
- Overview Recent deal moves table adds an Amount column (current
  unweighted total) between Deal and Change
  (`apps/app/app/(app)/pipeline-pulse.tsx`).

**How and why**
- Managers scanning Everyone moves need deal size at a glance; amount
  only appeared when the change itself was an amount edit.

**Deviations**
- None. Biggest movers / stuck unchanged (stuck already shows amount
  under the company line).

**What's next**
- Smoke Everyone overview: Amount column populated for deals with
  totals; empty cell when null/zero.

### 2026-08-04 — Forecast month window: last / this / next 12

**What was completed**
- Tightened `buildForecast` to last month + this month + next 12
  months (`FORECAST_MONTHS_LOOKBACK=1`, `LOOKAHEAD=12`). Far-future
  buckets (e.g. Nov 2027 from Aug 2026) drop out; "No date" kept.
- Card copy: "Last month, this month, and the next 12".

**How and why**
- Prior "last 12 months + all upcoming" still left a long overdue
  tail and sparse far-future rows. This matches how reps scan the
  live book.

**Deviations**
- None.

**What's next**
- Smoke overview: expect ~Jul 2026 … Aug 2027 (+ No date) in Aug 2026.
- Still pending: apply stage migrations on Railway `api`.

### 2026-08-04 — Drop "Sage 100" label from picker meta

**What was completed**
- `formatCompanyDisambiguation` now shows `{customerNo} · N contacts`
  (no "Sage 100" prefix). Same helper feeds picker + match dialogs.

**How and why**
- The number alone is enough; the label cluttered the secondary line.

**Deviations**
- None.

**What's next**
- None for this tweak.

### 2026-08-04 — Company picker Sage 100 + contact count

**What was completed**
- `companies.options` returns `sage100CustomerNo` + `contactCount`.
- `CompanyPicker` secondary line: `Sage 100 {id} · N contacts` (no domain).
- Screening + create-company match dialogs: same Sage 100 + always-on
  contact count; dropped Sage CRM id from the subtitle.
- Shared helper: `apps/app/components/crm/company-disambiguation.ts`.
  Files: `companies.service.ts`, `company-picker.tsx`,
  `screening-table.tsx`, `create-company-sheet.tsx`.

**How and why**
- Reps often face duplicate/dirty Sage company names when attaching
  contacts; the customer # and contact volume disambiguate faster than
  domain alone.

**Deviations**
- None.

**What's next**
- Smoke locally: open contact create / contacts filter / screening
  approve match dialog and confirm secondary lines.

### 2026-08-04 — Fill state/country from snapshots; reject junk Sage emails

**What was completed**
- `normaliseEmail` requires `local@domain.tld`; note-shaped values → null
  (company + contact pull). Exported for repair scripts. Tests added.
- Extended `backfill-company-street-from-snapshots.ts` to also fill
  `stateCode` / `country` / `countryCode` via `mapCompanyTree` from
  snapshots. Local: **13,670** companies updated.
- New `fix-sage-company-email-notes.ts`: cleared **428** junk company
  emails locally. Docs: `docs/plans/sage-crm-sync.md` §3.1.

**How and why**
- Full pull only wrote `city`; state/country persistence landed with
  `/map` (Aug 3), so almost all rows stayed null while snapshots had
  nested address.street. Sage `emailaddress` is often a billing note
  (same class as website notes) — VIBRA-TECH was the exemplar.

**Deviations**
- Did not rewrite `city` when company scalar differs from nested address
  (e.g. Snellville vs Louisville) — only fill null state/country.
- Contact junk emails not bulk-cleared (unique constraint; company-only
  repair). Pull will null them on next touch.

**What's next**
- Smoke VIBRA-TECH (and a few others) on prod sheet / map — state,
  country, empty email.

### 2026-08-04 — Prod state/country backfill + junk email clear

**What was completed**
- Pushed `28b6ba9` (email shape guard + extended snapshot backfill).
- Prod address backfill: **13,484** companies updated (state/country).
- Prod email clear: **428** junk company emails nulled.
- TCP proxy `36687ffa-…` (maglev.proxy.rlwy.net:14694) deleted; list empty.

**How and why**
- Same snapshot repair as local; scripts run via `run-via-tcp-proxy.ts`.

**Deviations**
- None.

**What's next**
- Smoke VIBRA-TECH on prod.

### 2026-08-04 — Prod street backfill via TCP proxy

**What was completed**
- Pushed `f794eae` (all pending work). Api deploy SUCCESS; migrations
  applied on start (`db:deploy`), including street address + deal stages.
- Prod snapshot backfill: **12,192** companies updated
  (`backfill-company-street-from-snapshots.ts` via
  `run-via-tcp-proxy.ts`). Sample street=29/50, postal=31/50.
- Temporary Postgres TCP proxy deleted after; list empty.

**How and why**
- Same as local snapshot repair — no Sage SOAP. Proxy only for laptop
  reachability to private Railway Postgres.

**Deviations**
- None.

**What's next**
- Smoke street display on prod company sheet / map selection.

### 2026-08-04 — Map filters: compact 2×2 dropdowns

**What was completed**
- `/map` sidebar: replaced three ToggleGroup rows + stacked selects with a
  2×2 `Select` grid (owner / Sage / location / deal years). Sort + dir sit
  on the results count row. `map-panel.tsx`.

**How and why**
- Toggle rows ate too much vertical space next to the company list.

**Deviations**
- None.

**What's next**
- Same as prior map entry (optional default `dealYears=6`).

### 2026-08-04 — Company street address (display + sync)

**What was completed**
- Schema: `Company.streetAddress` + `postalCode`; migration
  `20260804130000_company_street_address` (local deploy done).
- Sage: `mapCompanyTree` / `mapCompany` copy `address1` + `postcode`
  (also `zip` / `zipcode`); `sage-pull` upsert writes them; street/postal
  alone do not clear city geocode. Docs: `docs/plans/sage-crm-sync.md`
  §3.1, `docs/plans/companies-map.md`.
- Backfill: `apps/api/scripts/backfill-company-street-from-snapshots.ts`
  — sample 42/50 street, 38/50 postal; filled **12,191** local companies
  from `SageRecordSnapshot` (no SOAP). Quoting-tool dump not needed.
- API/UI: update contracts + `byId` / `mapList`; company sheet Street /
  State / Postal fields + header; map selected preview via
  `formatCompanyLocation` (`apps/app/components/crm/company-location.ts`).
- Tests: `sage-mappings.spec.ts`, `sage-xml.spec.ts` (address1/postcode).

**How and why**
- Street was always in Sage nested address + snapshots; we only mapped
  city/state/country for firmographics / map pins. Display needs the
  full line without changing Nominatim city-level geocode.

**Deviations**
- None vs plan. Snapshot coverage was strong — no quoting-tool path.

**What's next**
- Prod deploy + backfill (see entry above) — done.

### 2026-08-04 — Nav count bubbles + map deal-years filter

**What was completed**
- Nav: `CountBadge` in `packages/ui/src/components/count-badge.tsx`;
  Screening + Follow-ups icons in `apps/app/components/app-icon-rail.tsx`
  show uncleared counts (desktop overlay + mobile inline).
- API: `screening.count` / `followups.count`; cache helpers
  `cache.screening` + `followups.count` invalidation on decide.
- Map: `dealYears` (0–10) on `companies.mapList` + URL parsers;
  companies with a deal opened (`createdAt`) or closed (`closedAt`) in
  the last N years. UI select on `/map`. Docs:
  `docs/plans/companies-map.md`.

**How and why**
- Reps need a glance signal for Screening / Follow-ups without opening
  those pages. Lightweight count queries avoid loading full queues on
  every route.
- Map of ~12k companies is noisy; a years-back deal filter surfaces
  recent customers without replacing the full map (default = any time).

**Deviations**
- Follow-ups badge counts PROPOSED + due SNOOZED before prefs filters
  (list may be slightly smaller). Prefer a cheap count over re-running
  prefs in the rail.
- Default deal-years is "Any deal time" (0), not 6 — user picks 1–10.

**What's next**
- Apply deal-stage migrations on Railway `api` if not done.
- Optional: default map `dealYears=6` if the team wants that as the
  usual view.

### 2026-08-04 — Forecast by close month: last 12 months

**What was completed**
- `buildForecast` in `apps/api/src/dashboard/dashboard.service.ts`
  drops month buckets older than 11 months before the current month
  (last 12 months + any upcoming; "No date" kept). Totals and
  `byOwner` still sum every open deal.
- Overview card copy in `apps/app/app/(app)/sales-dashboard.tsx`
  notes "Last 12 months and upcoming".

**How and why**
- Everyone (and Me) showed open deals with close dates back to 2021,
  all Overdue. That list was long and not useful for the live forecast.

**Deviations**
- None. Agent `read_pipeline_report` forecast mode is unchanged
  (optional month filter still available there).

**What's next**
- Smoke on overview Me/Everyone: month table should start ~Sep 2025
  (or current−11) and still show future months.
- Still pending: apply stage migrations on Railway `api`.

### 2026-08-04 — Sales-rep sheet + five-stage deal alignment

**What was completed**
- Added `DealStage.IN_PURCHASING`; migrations
  `packages/db/prisma/migrations/20260804120000_deal_stage_in_purchasing`
  + `20260804120100_remap_deal_stages_by_sage` (local deploy OK).
- Remapped Sage pull/push in `apps/api/src/sage/sage.mappings.ts`;
  `STAGE_CERTAINTY` + open-stage lists in API, pulse, report, seed.
- UI labels in `apps/app/components/crm/deal-stage.tsx` (Leads →
  In Purchasing); stage stepper picks up five open steps.
- `dashboard.repSummary` + `SalesRepSheet` (`record=user:`); clickable
  `OwnerCell`; Forecast-by-rep entry. Docs: sage-crm-sync §3.3.

**How and why**
- Managers need a per-rep panel on Everyone (certainty × close month
  like the printed forecast). Proposal and Purchasing must not share
  one enum slot; Certainty defaults match Mobile Mark bands.

**Deviations**
- None vs plan (Base Business / Your Estimate still skipped).

**What's next**
- Apply the two stage migrations on Railway prod (`db:deploy` on `api`).
- Smoke: Everyone → click a rep → certainty grid + nested deal sheet.
- Optional: sales-superpowers Action Queue (separate roadmap).

### 2026-08-04 — Prod user: Robert Johnson

**What was completed**
- Created prod `User` for Robert Johnson
  (`rjohnson@mobilemark.com`, `emailVerified: true`, id
  `invite-8a6b8239aca7a3374ba17508`) via temporary Railway TCP proxy.
- Added reusable `apps/api/scripts/ensure-user.ts` (idempotent by email).

**How and why**
- Public signup is disabled (`disableSignUp` /
  `disableImplicitSignUp`). Microsoft SSO needs an existing user row;
  account linking attaches the Entra account on first sign-in. No
  separate manager role — same shape as other teammates.

**Deviations**
- None.

**What's next**
- Robert signs in at prod with Microsoft as `rjohnson@mobilemark.com`.
  If `ALLOWED_SIGN_IN` is not the whole `mobilemark.com` domain, add his
  address there on Railway.

### 2026-08-03 — Deploy + prod Sage website repair

**What was completed**
- Pushed `bee13d4` (mapping/UI/Research) and `35e060f` (faster repair
  script + TCP-proxy runner) to `origin/main`.
- Prod data repair via temporary Railway TCP proxy:
  cleared remaining junk websites/domains and backfilled from contact
  emails (2,166 updates in the final pass; earlier partial pass had
  already cleared most notes). Proxy deleted after.
- Verified prod Hitachi Rail CD US LTD:
  `website=https://cleverdevices.com`, `domain=null` (domain still owned
  by Clever Devices LTD). Dry-run now reports `toUpdate: 0`.

**How and why**
- Private Railway `DATABASE_URL` is not reachable from a laptop; same
  temporary TCP-proxy pattern as the earlier prod restore.

**Deviations**
- None.

**What's next**
- Wait for Railway deploy of `api`/`app`/`agent` from `main`. Confirm
  Research/Re-enrich on Hitachi in prod UI; ensure agent has
  `PERPLEXITY_API_KEY` / optional `CONTEXT_DEV_API_KEY`.

### 2026-08-03 — Research/Re-enrich without Sage website notes

**What was completed**
- **Why buttons were disabled:** both gated on `Company.domain`. Hitachi had
  none after clearing the Sage note; `cleverdevices.com` is already owned by
  another company row, so domain could not be claimed.
- **Research:** always enabled. API no longer requires domain.
  `research_company` falls back to Perplexity by company name when there is
  no URL (`PERPLEXITY_API_KEY` on the agent).
- **Re-enrich:** enabled when domain **or** URL-shaped website exists.
  `enrich_company` looks up via `domain ?? host(website)`. Soft-claims a
  free domain / fills website from contact emails on click.
- **Prod data repair (not a migration):**
  `apps/api/scripts/fix-sage-website-notes.ts` — clears junk websites/
  domains, then backfills from contact work emails. Local already run
  (Hitachi → `website=https://cleverdevices.com`, domain null).
  Prod: `DATABASE_URL=… bun run scripts/fix-sage-website-notes.ts`
  from `apps/api` (dry-run first).
- LinkedIn RapidAPI is for **people**, not these company buttons.
  Company brand Re-enrich still uses `CONTEXT_DEV_API_KEY`.

**How and why**
- Domain uniqueness blocked the naive "set domain from emails" fix for
  renamed accounts. Website is not unique, so Research/Re-enrich can use
  it; Perplexity covers the no-URL case.

**Deviations**
- None.

**What's next**
- Run the repair script on **prod**. Deploy API/app/agent so Research
  works without domain. Confirm `PERPLEXITY_API_KEY` (+ optional
  `CONTEXT_DEV_API_KEY`) on Railway `agent`.

### 2026-08-03 — Sage `website` was credit notes, not URLs

**What was completed**
- Root cause: Sage `comp_website` in this tenant holds free-text notes
  ("FORMERLY CLEVER DEVICES 7/1/26", "NET 30 …", "DO NOT SELL …"). Pull
  mapped them as-is into `Company.website`; the sheet subtitle used that
  string as a link. Weak `domainFrom` also produced junk domains from
  notes that contained a `.`.
- **Mapping**: `mapCompany` keeps `website` only when `normalizeDomain`
  accepts it; domain falls back to email. Push no longer writes
  `website` (would overwrite Sage notes).
- **UI**: `DomainLink` only uses URL-shaped website values as href.
- **Cleanup (local)**: `apps/api/scripts/fix-sage-website-notes.ts`
  cleared 1,272 websites + 108 domains. Hitachi Rail CD US LTD now has
  `website=null`, `domain=null`.
- Docs: `docs/plans/sage-crm-sync.md` §3.1. Tests in
  `sage-mappings.spec.ts`.

**How and why**
- Full Sage resync not needed: local columns were wrong, Sage data is
  fine as notes. One SQL-style pass + stricter pull is enough. Nightly
  incremental will keep rejecting notes.

**Deviations**
- None vs intent. Did not migrate Sage notes into a local notes column
  (quick display fix only).

**What's next**
- Run `bun run scripts/fix-sage-website-notes.ts` against **prod**
  (`DATABASE_URL` → Railway). Deploy mapping/push/UI changes so prod
  pull does not re-pollute. Optional later: derive domains from contact
  emails where `domain` is null.

### 2026-08-03 — Screening company match + Hitachi cleanup

**What was completed**
- **Prod cleanup**: Teresa Whitacre
  (`twhitacre@hitachirail-cd.com`) moved to Sage-backed **Hitachi Rail**;
  orphan company `hitachirail-cd.com` deleted. Local DB had no orphan /
  no Teresa row.
- **Sage probe**: no Whitacre person, no junk company for that domain —
  Screening create was local-only; no Sage reparent needed.
- **Product**: shared `findSimilarCompanies` / `rankSimilar` /
  `pickStrongUniqueMatch` in `company-similar.ts`; domain→name guess +
  related-host scoring; **Suggested** pick (Sage 100 > matching-domain
  contacts > contact volume); `companyForEmail` soft-attaches on strong
  unique or suggested+signals; Screening Approve dialog (Use this /
  Create from domain with `preferDomainCompany`); same Suggested cue on
  New company; docs §4 item 6c.
- **Screening → Sage push**: Approve enqueues person create when parent
  has `sageCrmCompanyId` and no same-name Sage-linked twin at that
  company; enqueue failures never fail local create. Toast:
  "queued for Sage" when enqueued. Locked decision updated in
  `HANDOFF-SAGE-SYNC.md`.
- Script: `apps/api/scripts/fix-hitachi-screening-dup.ts`.
- Tests: `apps/api/test/company-similar.spec.ts`.

**How and why**
- Exact domain-only matching invented domain-named companies when Sage
  already had the org under another domain/null. Soft-match + UI pick
  stops that; account signals break ties among several Hitachi-style hits.
- Screening was excluded from Sage push to avoid flood; Approve is a
  human decision onto a known Sage company, so push (best-effort) keeps
  CRM and Sage aligned and stamps `sageCrmContactId` from the add.

**Deviations**
- Cleanup target stayed **Hitachi Rail** per original plan. Live
  suggestion for `hitachirail-cd.com` prefers **HITACHI RAIL CD US LTD**
  (Sage 100 + 64 contacts) over Hitachi Rail (5) — better for future
  Approves.
- Person push still does not send nested email/phone (existing push cut).

**What's next**
- Soft check: Approve onto a Sage-backed Suggested company → toast
  "queued for Sage"; contact gains `sageCrmContactId` after flush.
- Apply pending screening per-rep migration if not yet
  (`20260803200000_pending_contact_per_user`) locally + Railway `api`.
- Optional later: nested email on person create so Sage shows the address.

### 2026-08-03 — Companies list Hide empty filter

**What was completed**
- Companies table: **Hide empty** checkbox (on by default) in the filter
  row. When on, list keeps companies with ≥1 contact **and** a non-empty
  Sage 100 customer #.
- API: `companyListInput.hideEmpty` (`yes` | `all`, default `yes`);
  `buildWhere` adds `contacts.some` + `sage100CustomerNo` guards.
- URL: `hideEmpty` via `companiesSearchParams` facet +
  `facetDefaults: { hideEmpty: "yes" }`. Checkbox in `leadingActions`
  (not a dropdown).
- Files: `apps/api/src/companies/companies.contracts.ts`,
  `companies.service.ts`,
  `apps/app/app/(app)/companies/companies-search-params.ts`,
  `companies-table.tsx`.

**How and why**
- Reps want the list to show real accounts (people + Sage 100 link), not
  empty shells from sync. Uncheck to audit the rest. Same Prisma pattern
  as the map's Sage 100 linked filter.

**Deviations**
- None. (Earlier note about a Sage filter referred to `/map`, not this
  table.)

**What's next**
- Soft check in the browser: default list should drop zero-contact /
  no-Sage-100 rows; uncheck restores them.
- Optional: apply pending screening migration.

### 2026-08-03 — Overview Won/Lost KPIs use deal closedAt

**What was completed**
- Won / Lost in the eight-KPI strip now use `wonThisMonth.count` and
  `performance.losses` (deal outcomes in the selected range), not
  forward-only `DealFieldChange` stage→won/lost counts.
- Docs: `docs/plans/pipeline-pulse.md` decision 5/8; Current state in
  `HANDOFF.md`.

**How and why**
- With YTD selected, Closed won showed 88 deals while Won stayed at 1 —
  the change log only started when pulse shipped. Deal-based counts match
  Closed won / win rate and react correctly to the date range.

**Deviations**
- Certainty moves / movers / feed still use the change log (forward-only).
  Agent `read_pipeline_pulse` won/lost counts remain change-log based.

**What's next**
- Soft check in the browser: YTD Won should match Closed won deal count.
  Optional: apply pending screening migration.

### 2026-08-03 — Overview: 8-KPI grid + range-aware pulse counts

**What was completed**
- Merged pulse KPIs (Won / Lost / Certainty / Stuck) into the sales
  `StatGroup` as a second row — one 8-cell strip above the charts.
- `loadPipelinePulse` accepts optional `since` / `until`; overview passes
  the selected dashboard range. Stuck stays fixed at 14d+. Exact counts
  via `groupBy` (not capped by the feed scan).
- `StatCard` gains `tone="static"` (muted cell + title hint) and
  `animate` (`StatCount` CSS `@property` integer counter;
  `StatTick` enter motion for money/percent). `StatGroup` borders fixed
  for wrapped rows.
- Pulse tables stay below charts; copy uses `windowDays` from the payload.
- Files: `packages/db/src/pipeline-pulse.ts`,
  `apps/api/src/dashboard/dashboard.service.ts`,
  `apps/app/app/(app)/sales-dashboard.tsx`,
  `apps/app/app/(app)/pipeline-pulse.tsx`,
  `packages/ui/src/components/stat-card.tsx`,
  `packages/ui/src/components/dashboard.tsx`,
  `packages/ui/src/styles/globals.css`,
  `apps/agent/agent/tools/read_pipeline_pulse.ts` (description only).

**How and why**
- Reps wanted the newer pulse KPIs next to the sales KPIs, and for
  change counts to track the date control. Static metrics (due this
  month, open pipeline, stuck) stay visually quieter so range flips
  read clearly; animated values make the reactive cells obvious.

**Deviations**
- Agent `read_pipeline_pulse` still defaults to 7 days (unchanged call
  shape). Overview is the surface that passes the selected range.

**What's next**
- Soft visual pass in the browser (range flip + static mute). Optional:
  apply pending screening migration `20260803200000` locally + Railway.
  Sage module follow-ups from the SOAP probe stay design-only until
  scoped (`docs/plans/sage-crm-sync.md`).

### 2026-08-03 — Sage SOAP probe: other modules beyond the triad

**What was completed**
- Live read-only SOAP probe of record-tab / plan §3c entities against
  production (`crm.mobilemark.com`).
- Scripts: `apps/api/scripts/sage-probe-entities.ts` (availability +
  sample fields) and `apps/api/scripts/sage-probe-recency.ts` (2024–2026
  date filters). Uses `node:https` + public DNS (local DNS cannot resolve
  the host).
- Updated entity table in `docs/plans/sage-crm-sync.md` §1.

**How and why**
- Screenshot tabs (Notes, Communications, Cases, Addresses, Phone/email,
  Documents, Relationships, Consent, Self Service) + plan extras (lead,
  quotes, orders, users, forecast, campaign, Mas*) were queried with
  common predicates, then re-checked for recent `updateddate` /
  `comm_datetime`.
- Goal: confirm we did not miss an actively used module after syncing
  only company / person / opportunity.

**Deviations**
- None from scope. Local default DNS cannot resolve
  `crm.mobilemark.com`; probes force `8.8.8.8` / `1.1.1.1`.

**What's next**
- Decide with the team whether to pull **communications** (→ local
  `Activity`) and/or **notes** / **leads** next (`docs/plans/sage-crm-sync.md`
  §3c / §4 item 5). Do not sync address/phone/email standalone — already
  nested under company. Quotes/orders/Mas* need admin/WS investigation
  if order history matters.

### 2026-08-03 — Company create: confirm possible matches

**What was completed**
- Soft-match before creating a company so two reps do not fork the same
  Sage org by typing a similar name:
  - `normalizeCompanyName` — strips legal suffixes / punctuation
    (`apps/api/src/companies/company-name.ts` + unit test).
  - `companies.similar` query — local CRM only (domain exact + name soft
    rank); returns up to 8 matches with `reason` / `blocksCreate`
    (`companies.contracts.ts`, `companies.service.ts`,
    `companies.router.ts`; tRPC regenerated).
  - Create sheet: check similar on submit → Dialog "Use this" /
    "Create new anyway" (domain hits hide Create anyway)
    (`apps/app/app/(app)/companies/create-company-sheet.tsx`).
  - Docs: `docs/plans/sage-crm-sync.md` §4 item 6b; this HANDOFF.

**How and why**
- Domain uniqueness already hard-blocks same website. Name is not unique,
  so "Acme" vs "Acme Inc" could create a second local + Sage company.
  Confirm against the local mirror (post Sage pull) — no live SOAP search.

**Deviations**
- None vs the approach agreed in chat (local-first, confirm, no auto-merge).

**What's next**
1. Still apply Screening migration locally + Railway when Docker is up
   (`20260803200000_pending_contact_per_user`).
2. Optional later: same similar-confirm on contact create (email already
   unique); live Sage search only if local miss becomes a real pain.

### 2026-08-03 — Primary contact column + email copy

**What was completed**
- `companies.list` returns `primaryContact` (designated primary, else
  most recently created contact):
  `apps/api/src/companies/companies.service.ts`.
- Companies table: **Primary contact** column (name + email + copy):
  `apps/app/app/(app)/companies/companies-table.tsx`.
- Contacts table: email column uses the same copy control:
  `apps/app/app/(app)/contacts/contacts-table.tsx`.
- Shared `EmailValue` (mirrors Sage ID copy pattern):
  `apps/app/components/crm/email-value.tsx`.

**How and why**
- Reps need a quick way to see and copy the main contact from the
  company list, and to copy emails from the contacts list, without
  opening the sheet. Same stop-propagation + toast pattern as Sage IDs.

**Deviations**
- None.

**What's next**
- Apply screening migration if not done (`bun run db:deploy` local +
  Railway `api`). Otherwise continue from Current state priorities.

### 2026-08-03 — Screening scoped to logged-in mailbox

**What was completed**
- Screening was a shared tenant queue (`pendingContact.email` unique only),
  so `/screening` showed unmatched mail from every connected Outlook
  mailbox. Fixed to per-rep (same model as Follow-ups):
  - Schema: `PendingContact.userId` + `@@unique([userId, email])` +
    index `(userId, status, lastSeenAt)`; User relation
    `pendingContacts` (`packages/db/prisma/schema.prisma`).
  - Migration: `packages/db/prisma/migrations/20260803200000_pending_contact_per_user/`
    — deletes existing shared PENDING rows, then adds `userId`.
  - Harvest: `ScreeningHarvestService.harvest({ userId, … })`; Outlook
    sync passes `row.userId`
    (`apps/api/src/screening/screening-harvest.service.ts`,
    `apps/api/src/microsoft/outlook-mail-sync.service.ts`).
  - API: `screening.list(userId)` / `decide` rejects other users' rows
    (`apps/api/src/screening/screening.service.ts`,
    `screening.router.ts`). tRPC regenerated.
  - UI copy: "People from your synced mailbox…"
    (`apps/app/app/(app)/screening/page.tsx`).
  - Follow-ups already filtered by `userId`; hardened
    `proposeFollowUp` so cited messages must have
    `syncedByUserId = input.userId`
    (`apps/agent/agent/lib/followups.ts`).
  - Plan note: `docs/plans/m365-expansion.md` Phase 4 model updated.

**How and why**
- Copy said "People you email" but the table was team-wide. Cesar was
  Jordan's; Lindsay / Raymond came from other reps' sync. Domain
  suppress stays tenant-wide (noise filter), candidates are per mailbox.

**Deviations**
- Original Phase 4 design was a shared Screening Room; product now wants
  per-rep like Follow-ups. Cleared existing PENDING rows rather than
  guessing owners (no `userId` existed to backfill).
- Local `db:deploy` not run — Docker daemon was not available. Code +
  migration file are ready.

**What's next**
1. Start Docker Desktop, then `cd packages/db && bun run db:deploy`
   locally.
2. Deploy / migrate on Railway `api` (same migration) before shipping
   the Screening fix to prod — otherwise the new column will break
   harvest.
3. Optional: after migrate, reject/suppress any leftover junk on your
   own queue once Outlook sync re-harvests your mailbox only.

---

### 2026-08-03 — Pipeline agent advanced reports

**What was completed**
- Shared loader `packages/db/src/pipeline-report.ts` (+ export from
  `packages/db/src/index.ts`): modes `open_by_stage`,
  `forecast_by_close_month`, `closing_in_month`, `closed_in_month`; Me/Everyone
  scope; local calendar month bounds; deal list capped at 40 with full
  aggregates.
- Agent tool `apps/agent/agent/tools/read_pipeline_report.ts`.
- Wiring: `pipelinePreamble` + `instructions.md` (pulse vs report); transcript
  label; overview chip “What's closing this month?”; `docs/agent.md`.
- Unit tests: `packages/db/test/pipeline-report.spec.ts` (month parse/bounds +
  scope filter). App transcript/session tests still green (new tool covered).

**How and why**
- Pulse only covers the rolling 7-day change log; managers need forward-looking
  and period questions from the same CRM deals. Same pattern as
  `loadPipelinePulse` — agent reads `@crm/db` directly, no Nest hop.

**Deviations**
- None vs plan. Local DB smoke skipped (Postgres not running in this session).

**What's next**
- Smoke on overview agent (local or after agent redeploy): “What can you tell me
  about my pipeline for August 2026?” — expect `read_pipeline_report` with
  `month=2026-08` and real deal rows.
- Redeploy Railway `agent` so prod picks up the new tool.
- Optional later (out of plan scope): Nest dashboard reuse of the shared
  loader; closed-in-month chip; alert digests.

Plan doc: `docs/plans/pipeline-agent-reports.md`.

### 2026-08-03 — Clean agent Railway docs (remove stale checklist)

**What was completed**
- Rewrote `docs/plans/agent-railway.md` as an ops runbook: prod Online,
  deployed checklist, Node 24 / just-bash / start-script notes, env matrix,
  smoke + failure table. Removed “still have to do” / next-agent order that
  contradicted the DONE status line.
- Project-overview link text → “ops runbook”.

**How and why**
- Status said DONE while the body still called the agent Missing and asked
  for a Dockerfile that already ships on `main`.

**Deviations**
- None.

**What's next**
- Optional: Perplexity / Context.dev keys on **agent**; Entra Mail.Send for
  sequences; UI smoke of Agent tab if not already confirmed.

### 2026-08-03 — Railway agent online (Dockerfile + service + bridge)

**What was completed**
- Added `Dockerfile.agent` and `scripts/railway-agent-start.sh` (Node 24
  runs `eve start`; Bun installs/builds; `just-bash` runtime dep).
- Created Railway `agent` service (repo `jj-mobilemark/crm`, Dockerfile
  builder, `PORT=2000`, `DATABASE_URL`, `AI_GATEWAY_API_KEY`,
  `AGENT_BRIDGE_SECRET`).
- Set on `app`: `AGENT_URL=http://agent.railway.internal:2000` + same
  bridge secret; redeployed.
- Smoke: follow-ups enqueue `{"enqueued":2}`; agent listens on :2000;
  boot shows LinkedIn capability when `RAPIDAPI_KEY` is set.
- Docs: `docs/plans/agent-railway.md` status DONE; Current state updated.

**How and why**
- Follow-ups cron only writes `AgentTask` rows; eve must be always-on to
  claim them and serve the Agent tab via the app bridge.

**Deviations**
- `npx eve start` crashes (npm vs `packageManager: bun`) — start script
  invokes `node …/eve/bin/eve.js` instead.
- GitHub-sourced builds need `Dockerfile.agent` on `main` (this commit).

**What's next**
- Optional: set `PERPLEXITY_API_KEY` / `CONTEXT_DEV_API_KEY` on **agent**.
- Confirm Entra **Mail.Send** for sequences.
- UI smoke: `/follow-ups` + contact Agent tab in prod.

### 2026-08-03 — Document agent Railway go-live checklist

**What was completed**
- Added `docs/plans/agent-railway.md`: why follow-ups enqueue-only today,
  what’s already on Railway, and the exact next steps (Dockerfile.agent,
  `agent` service, env matrix, `AGENT_URL` / `AGENT_BRIDGE_SECRET` on
  app, smoke tests).
- Pointed Current state + project-overview at that plan.

**How and why**
- Cron workers are live but the eve process is not; operators needed one
  place that says how to hook app ↔ agent ↔ follow-ups cron.

**Deviations**
- Docs only — did not add `Dockerfile.agent` or create the Railway
  service in this pass.

**What's next**
- Execute `docs/plans/agent-railway.md` (start with Dockerfile + service).

### 2026-08-03 — Railway cron workers (Microsoft / sequences / followups / Sage)

**What was completed**
- Created four Railway cron services in project MM-CRM / production:
  `cron-microsoft`, `cron-sequences`, `cron-followups`, `cron-sage`
  (`curlimages/curl:8.12.1`).
- Schedules (UTC): `*/5` microsoft + sequences; `0 13 * * *`
  followups (8am CDT); `0 6 * * *` sage (1am CDT).
- Start commands curl the matching `/internal/...` routes with
  `Authorization: Bearer $CRON_SECRET`.
- Vars: `API_PUBLIC_URL=https://api.mobilemarksalestool.com`,
  `CRON_SECRET` (same as api). No Google cron.
- Smoke: `deploymentRestart` on `cron-microsoft` → API reported
  `attempted=4 synced=4`.

**How and why**
- Upstream crons lived in Vercel Build Output (`build-func.mjs`).
  Prod is Railway; Vercel Cron does not run. Railway cron services
  call the existing Nest routes.

**Deviations**
- Sequences every **5** minutes (Railway minimum), not every 2.
- Follow-ups enqueue `AgentTask` rows only; eve agent is still not
  deployed on Railway, so the daily sweep will queue without a
  dispatcher until agent is hosted.
- `railway environment edit` did not apply start/cron; used
  GraphQL `serviceInstanceUpdate` instead. Curl image needs
  `sh -c '…'` so ENTRYPOINT does not swallow the command.

**What's next**
- Execute `docs/plans/agent-railway.md` (Dockerfile.agent → Railway
  `agent` service → wire `AGENT_URL` / `AGENT_BRIDGE_SECRET`).
- Confirm Entra **Mail.Send** before relying on sequences tick.
- Optional: watch first nightly `cron-sage` run in Railway logs.

### 2026-08-03 — Disable public account registration

**What was completed**
- Removed “Create account” / mode toggle from
  `apps/app/app/(auth)/sign-in/credentials-form.tsx` (sign-in only).
- Server: `emailAndPassword.disableSignUp: true`; Microsoft + Google
  `disableImplicitSignUp: true` in `packages/auth/src/auth.ts`.
- Sign-in page copy notes existing accounts only.

**How and why**
- Protect prod CRM data: no new users from the welcome form or a raw
  sign-up API call. Admins seed users out-of-band.

**Deviations**
- None.

**What's next**
- Deploy; smoke that Create account is gone and `/sign-up/email`
  rejects. When adding a teammate, create the user in DB (or temporarily
  re-enable signup).

### 2026-08-03 — Map Sage filter uses Sage 100, not CRM

**What was completed**
- Map `sage=linked|unlinked` now filters on `Company.sage100CustomerNo`
  (ERP customer #), not `sageCrmCompanyId`.
- Pins / list dots / legend / selected footer / page blurb say
  Sage 100. `CompanyMapRow` returns `sage100CustomerNo`.
- Files: `companies.service.ts`, `companies.contracts.ts`,
  `map-panel.tsx`, `companies-map-canvas.tsx`, `map/page.tsx`,
  `docs/plans/companies-map.md`.

**How and why**
- Every company has a Sage CRM id after the full pull, so “Has Sage
  ID” was a no-op. Reps care about Sage 100 (~4.8k with / ~9.5k
  without).

**Deviations**
- URL param stays `sage=linked|unlinked` (same values, new meaning).

**What's next**
- Restart local Nest; smoke `/map` → Has Sage 100 (~4.5k pins) vs
  No Sage 100 (~7.6k pins).

### 2026-08-03 — Map filter “Has Sage ID” empty results

**What was completed**
- Fixed `/map` showing `0 in view · 0 on map` after toggling Sage
  (and other) filters even when the API returned thousands of rows.
- `apps/app/app/(app)/map/map-panel.tsx`: `placeholderData` so the map
  stays mounted during refetch; clear stale `mapBounds` on filter/
  search change; `isUsableBounds` + antimeridian-aware `inBounds`;
  show load errors; clearer empty copy; “Updating…” while fetching.
- `apps/api/src/companies/companies.service.ts` `buildMapWhere`: linked
  = non-null and not `""`; unlinked = null or `""` (nested under AND
  so search `OR` is not overwritten).

**How and why**
- Local DB has 14 252 companies all with Sage ids and 12 147 with
  pins — the Sage SQL was not the empty cause. Filter change cleared
  React Query data → full-screen loading → map remount + bad/stale
  Leaflet bounds filtered the list to zero. Keeping prior data and
  resetting bounds fixes the flash/empty UI.

**Deviations**
- None. Empty-string Sage handling is defensive; this dataset has no
  empty ids.

**What's next**
- Smoke `/map` → Has Sage ID (expect ~12k pins). Restart local Nest
  if the API process predates the service change.

### 2026-08-03 — Fix Settings "Check now" Cloudflare hairpin

**What was completed**
- Diagnosed prod toast `Unexpected token '<', "<!doctype "... is not
  valid JSON`: app `/api/[...path]` proxy fetched
  `https://api.mobilemarksalestool.com` and Cloudflare returned Error
  1000 HTML ("DNS points to prohibited IP").
- Added `INTERNAL_API_URL` for server-side Nest reachability
  (`apps/app/lib/env.ts`); wired proxy
  (`apps/app/app/api/[...path]/route.ts`) and RSC tRPC
  (`apps/app/lib/trpc/server.ts`) to it; HTML upstream → JSON 502.
- Documented in `.env.example` + `docs/environment.md`.
- Set Railway app var
  `INTERNAL_API_URL=http://api.railway.internal:3001`; shipped
  `9f0b65c`. Verified unauthed proxy POST returns JSON `UNAUTHORIZED`
  (not HTML).

**How and why**
- Browser auth still needs the public `API_URL` (cookie / redirects).
  Only the Next *server* must use Railway private networking to avoid
  CDN hairpins.

**Deviations**
- None.

**What's next**
- Smoke in the browser: Settings → Microsoft/Google **Check now** while
  signed in. Optional: grey-cloud or leave Cloudflare as-is (private
  URL is the durable fix).

### 2026-08-03 — Mobile Mark CRM branding + logo/favicon

**What was completed**
- Renamed product strings from Comp AI → **Mobile Mark CRM** (auth, nav,
  metadata, placeholders, agent copy).
- Installed Mobile Mark signal mark + wordmark: favicons,
  apple-touch, web manifests, `/mobile-mark-mark.png`,
  `/mobile-mark-wordmark.png`; `packages/ui` `Logo` uses the mark;
  auth shell left panel uses the wordmark.
- Helper: `scripts/prepare-mobile-mark-assets.ts` (needs one-off sharp).

**How and why**
- Fork is Mobile Mark's CRM; Comp AI branding was upstream leftover.

**Deviations**
- Left LICENSE / upstream `trycompai/crm` git history notes alone.

**What's next**
- Smoke sign-in + header after Railway deploy. Sage push E2E /
  sequences Mail.Send.

### 2026-08-03 — Map UX polish commit (viewport, fly-to, sheet)

**What was completed**
- Viewport-driven left list + cluster filter; fly-to / highlight on
  select; **Open company** via `useOpenRecord` on `/map`.
- `MapBoundsListener` + `MapFlyTo` in `packages/ui/src/components/map.tsx`.
- `packages/db/scripts/pull-geocode-from-prod.ts` for prod→local coords.
- Docs: `docs/plans/companies-map.md`, `.cursor/rules/project-overview.mdc`,
  this handoff.

**How and why**
- Map felt disconnected from the list and forced a leave to `/companies`
  for details.

**Deviations**
- Left unrelated `sales-dashboard.tsx` "Due this month" KPI edit out of
  this commit.

**What's next**
- Wait for Railway `app` deploy of `5592e59`; smoke prod `/map`.
- Sage push E2E / sequences Mail.Send, or commit sales-dashboard KPI if
  wanted.

### 2026-08-03 — Map opens company sheet in place

**What was completed**
- Map **Open company** uses `useOpenRecord` so `CompanySheet` opens over
  `/map` (same `RecordSheetHost` as tables). No navigate to `/companies`.
- Docs: `docs/plans/companies-map.md`.

**How and why**
- User wants company details without leaving the map.

**Deviations**
- None.

**What's next**
- Smoke: select company on `/map` → Open company → sheet; close → still on map.

### 2026-08-03 — Map list follows viewport / cluster

**What was completed**
- Left company list filters to pins in the current map bounds
  (`MapBoundsListener` in `packages/ui/src/components/map.tsx`;
  `map-panel.tsx` / `companies-map-canvas.tsx`).
- Status shows `N in view · M on map`. Cluster click still narrows
  further (Clear cluster); pan/zoom returns to viewport filter.
- Fixed cluster company ids via marker `title` + coord fallback
  (`Map` import had shadowed `globalThis.Map`).

**How and why**
- Zoomed map still listed Dallas/London companies; cluster filter was
  a no-op when marker ids were missing.

**Deviations**
- None.

**What's next**
- Reload `/map`, zoom into a region, confirm the list matches the view.

### 2026-08-03 — Pull prod geocode → local DB

**What was completed**
- Fixed import path in `packages/db/scripts/pull-geocode-from-prod.ts`
  (`../src/generated/prisma/client`).
- Pulled via Railway TCP proxy `sakura.proxy.rlwy.net:28329`: 3811
  `GeocodeCache` rows + 12319 company geocode fields → local DB.
  Local companies with coords: **12147**. `missingLocally=0`.
- Deleted production TCP proxy (`0473c027-…`); `railway tcp-proxy list`
  now empty.

**How and why**
- User asked to run the full prod→local copy (SSH `bun -e` + `@crm/db`
  failed in the container; file-based script against proxy works).
- Read-only from prod; write only to local `DATABASE_URL`.

**Deviations**
- None material (transient Python f-string error when re-reading proxy
  env; existing PROXY_* env still worked).

**What's next**
- Open `/map` locally and confirm pins. Optionally commit the pull script
  + cluster-click list filter if still uncommitted.

### 2026-08-03 — Companies map page (`/map`)

**What was completed**
- Schema + migration `20260803150000_add_company_geocode`: Company lat/lng /
  place key / geocodedAt; `GeocodeCache`.
- Sage pull persists `stateCode`/`country`/`countryCode`; clears coords when
  location changes. Human company update clears coords on address edits.
- Nominatim geocoder + `apps/api/scripts/geocode-companies.ts` (sample
  `--limit=15` → 341 companies updated).
- tRPC `companies.mapList` with owner/sage/location filters.
- shadcn-map in `packages/ui`; `/map` split list + clustered pins; nav rail
  item; preview + link to company sheet. Plan: `docs/plans/companies-map.md`.

**How and why**
- City-level pins are enough with current Sage fields; unique place-key cache
  keeps Nominatim under usage limits. Split view matches filter/sort needs.

**Deviations**
- Restored core shadcn components that `ui:add @shadcn-map/map --overwrite`
  rewrote (button/input/etc.); kept only map + leaflet CSS + new deps.
- Map marker icons use inline SVG (not lucide) so the app package stays free
  of a direct leaflet/lucide dependency.

**What's next**
1. Apply migration on Railway if not auto; run full
   `bun run scripts/geocode-companies.ts` (~3811 unique places, ~1 req/s).
2. Smoke `/map`: filters, colors, Open company sheet.
3. Other tracks: Sage push E2E (`HANDOFF-SAGE-SYNC.md`), sequences Mail.Send.

### 2026-08-03 — Fix prod Microsoft login (localhost API_URL in bundle)

**What was completed**
- Diagnosed freeze: browser called `http://localhost:3001/api/auth/sign-in/social`
  (CORS) because Next inlined the localhost default at build time.
- Corrected Railway vars on **app** + **api**:
  `API_URL`/`BETTER_AUTH_URL` → `https://api.mobilemarksalestool.com`
  (was wrongly `api.crm.…` / `*.up.railway.app`); `APP_URL` →
  `https://crm.mobilemarksalestool.com`.
- Fixed `Dockerfile.app` to `ARG`/`ENV` `API_URL`/`APP_URL` so Docker builds
  receive Railway vars; added Railway/CI fail-fast in
  `apps/app/next.config.ts` if API still looks like localhost.
- Redeployed via `railway up --service app`; verified baked bundle contains
  `https://api.mobilemarksalestool.com` and CORS preflight returns
  `Access-Control-Allow-Origin: https://crm.mobilemarksalestool.com`.

**How and why**
- `NEXT_PUBLIC_API_URL` is build-time; Railway Dockerfile builds do not inject
  service vars unless declared as `ARG`. Env-only redeploy kept the bad bundle.

**Deviations**
- Deployed the Dockerfile/next.config fix with `railway up` before committing
  to git — commit still needed.

**What's next**
1. Hard-refresh prod sign-in and try Microsoft again. Entra redirect must be
   `https://api.mobilemarksalestool.com/api/auth/callback/microsoft`.
2. Commit/push `Dockerfile.app` + `apps/app/next.config.ts`.
3. Sage push E2E / sequences Mail.Send as before.

### 2026-08-03 — Local Docker Postgres → Railway prod 1:1 restore

**What was completed**
- Confirmed Railway CLI logged in as `jjohnson@mobilemark.com`; project
  `MM-CRM` linked to `production` (Postgres + api + app online).
- Dumped local `crm-postgres` (`pg_dump -Fc`, ~8.7 MB) from Docker.
- Opened a temporary Railway TCP proxy on Postgres `:5432`, restored with
  `pg_restore --clean --if-exists --no-owner --no-acl`, verified row counts
  match local (14252 companies / 24773 contacts / 525 deals / 39550
  sageRecordSnapshot), then deleted the TCP proxy (no public proxies left).

**How and why**
- Prod was schema-only (~9.8 MB, zero business rows) after deploy; local held
  the Sage backfill. One-shot dump/restore is the fastest 1:1 copy without
  re-running the SOAP backfill against production.

**Deviations**
- Used a temporary TCP proxy because prod had no `DATABASE_PUBLIC_URL` and
  local SSH key is passphrase-protected (non-interactive `railway ssh` failed).

**What's next**
1. Smoke-check prod UI (companies/deals/overview) at
   https://crm.mobilemarksalestool.com — re-sign-in if session cookies differ
   (`BETTER_AUTH_SECRET` / OAuth redirect URIs may not match local tokens).
2. Sage push E2E smoke (`HANDOFF-SAGE-SYNC.md`); sequences Entra **Mail.Send**.

### 2026-08-03 — Commit/push pipeline pulse + agent; docs refreshed

**What was completed**
- Committed and pushed pipeline pulse + overview agent to `origin/main`.
- Docs: `docs/plans/pipeline-pulse.md` (status DONE), `docs/agent.md`
  (pipeline kind), `.cursor/rules/project-overview.mdc` (pulse + push note),
  `HANDOFF-SAGE-SYNC.md` (pull change-log note).

**How and why**
- Ship the forward-only deal change feed and manager chat so overview is
  useful; keep Sage push handoff accurate about echo-safe logging.

**Deviations**
- None.

**What's next**
1. Deploy migrations on Railway (`db:deploy` / start script) if not auto.
2. Sage push E2E: delete opp 805; smoke edit deal 557 — `HANDOFF-SAGE-SYNC.md`.
3. Sequences: Entra **Mail.Send** if still missing.

### 2026-08-03 — Pipeline agent on overview

**What was completed**
- Fourth kind `pipeline` end-to-end (`apps/app/lib/agent-record.ts`): header
  `x-crm-pipeline`, filing `pipelineScope` (`me`|`everyone`).
- Schema: `AgentConversation.pipelineScope` + migration
  `packages/db/prisma/migrations/20260803140000_add_pipeline_scope/` (applied).
- Conversations API: list/save/remove accept `pipelineScope`
  (`conversations.contracts.ts` / `.service.ts`); tRPC regenerated.
- Bridge: mint + proxy accept non-cuid scope (`agent-bridge.ts`,
  `app/eve/v1/[...path]/route.ts`).
- Shared pulse: `packages/db/src/pipeline-pulse.ts` `loadPipelinePulse`;
  dashboard + agent tool both use it.
- Agent: `pipelinePreamble`, `read_pipeline_pulse` tool, `instructions.md`
  table row, `TOOL_VERBS` label, `task.ts` passes `pipelineScope` + acting user.
- UI: `PipelineAgentPanel` on overview under pulse (`dashboard-summary.tsx`);
  thread URL via nuqs `thread` (not record-sheet stack).
- Tests: agent-session / agent-transcript / deal-change green; types green.

**How and why**
- Managers ask pipeline questions on `/`; record-scoped panel could not file
  or mint focus without a CRM cuid. Scope is the record id; shared helper keeps
  Nest pulse and agent tool identical.

**Deviations**
- Optional thin tools (`list_stuck_deals` / `list_deal_moves`) skipped —
  `read_pipeline_pulse` + existing drill-down is enough for this pass.

**What's next**
1. Restart API (and agent if running). Smoke: overview Everyone → Ask about
   the pipeline → “What moved this week?”; Me scopes owned deals.
2. Commit when ready (pulse + agent + both migrations).
3. Other tracks: Sage push smoke (`HANDOFF-SAGE-SYNC.md`), sequences Mail.Send.

### 2026-08-03 — API restart; pulse ready for agent handoff

**What was completed**
- Restarted Nest API: `bun run src/main.ts` in `apps/api` (:3001 `/health`
  OK). Pulse code from prior pass is live.
- Confirmed next work is pipeline agent only — pulse UI is done.

**How and why**
- Nest has no hot reload; restart loads `DealFieldChange` writers +
  `dashboard.summary.pulse`. Smoke: edit deal certainty/stage (or wait for
  Sage pull) to grow the feed; stuck uses `stageChangedAt` without log rows.

**Deviations**
- None.

**What's next**
1. **Next agent: pipeline AI on overview** — read
   `docs/plans/pipeline-pulse.md` § Agent handoff (do not skip). Deliver:
   fourth `AgentRecordKind` (`pipeline`), preamble with Me/Everyone + pulse
   summary counts, `read_pipeline_pulse` tool (same shape as dashboard
   pulse), mount `AgentPanel` on overview. Pulse UI already done.
2. Optional smoke while coding: edit a deal → App row in `dealFieldChange`;
   overview Everyone shows movers/feed.
3. Commit when ready (pulse + agent may share one PR or split).

### 2026-08-03 — Pipeline pulse on overview (change log + UI)

**What was completed**
- Plan: `docs/plans/pipeline-pulse.md` (includes **Agent handoff** for the
  next agent — do not skip).
- Schema: `DealFieldChange` + migration
  `packages/db/prisma/migrations/20260803130000_add_deal_field_change/`
  (applied locally).
- Recorder: `apps/api/src/crm/deal-change.service.ts` in global `CrmModule`.
- Writers: `DealsService.update` / `setStage` (`source: app`);
  `SagePullService.upsertDeal` (`source: sage`, skipped on push echo).
- Dashboard: `summary.pulse` — 7-day counts, movers, recent feed, stuck
  (14d+, stage/certainty).
- UI: `apps/app/app/(app)/pipeline-pulse.tsx` mounted in
  `dashboard-summary.tsx` under the sales KPI charts.
- Test: `apps/api/test/deal-change.spec.ts`.

**How and why**
- Managers need “what moved” not only snapshot totals. `SageRecordSnapshot`
  is latest-only, so an append-only field log is required. App push to Sage
  already exists; echo-guard prevents double-logging local edits.

**Deviations**
- Pulse window is fixed 7 days (not tied to closed-won range control), as
  agreed. Agent on overview deferred by product ask.

**What's next**
1. Restart API; smoke: edit deal certainty/stage → App rows; Sage pull
   non-echo → Sage rows; overview Everyone shows pulse.
2. **Next agent: pipeline AI on overview** — follow
   `docs/plans/pipeline-pulse.md` § Agent handoff (new `pipeline`
   AgentRecordKind, preamble, `read_pipeline_pulse` tool, mount panel).
3. Commit when ready (pulse migration + UI may share tree with other work).

### 2026-08-03 — Sage push write-back (see HANDOFF-SAGE-SYNC.md)

**What was completed**
- Live SOAP `add`/`update` confirmed (opp 557 update; add created Sage opp
  **805** on company 24 — delete manually).
- Outbox + push service + reverse mappings + human UI enqueue + cron flush +
  pull echo-guard wired. Full detail / next steps:
  **`HANDOFF-SAGE-SYNC.md`**.

**What's next**
1. Delete Sage opp 805; restart API; smoke UI edit of deal 557.
2. Continue other tracks as before (sequences Entra Mail.Send, priority smoke).

### 2026-08-03 — Deal & task priority + Tasks page

**What was completed**
- Schema: `enum Priority { LOW MEDIUM HIGH HIGHEST }` + nullable `priority`
  on `Deal` and `Activity`; indexes; migration
  `packages/db/prisma/migrations/20260803110000_add_priority/`.
- Deals API: create/update accept `priority`; list facet + select/serialize
  (`apps/api/src/deals/deals.contracts.ts`, `deals.service.ts`).
- Activities API: create accepts `priority` for TASK; `setPriority` mutation;
  `myTasks` gains `status` / `priority` filters and sorts by priority then due
  (`apps/api/src/activities/*`). Dashboard overdue tasks select includes
  `priority`. Regenerated `apps/api/src/generated/server.ts`.
- Shared UI: `apps/app/components/crm/priority.tsx` (labels, tones, badge,
  facet options).
- Deal UI: priority on create sheet, deal sheet overview, deals table column
  + facet.
- Task UI: priority in timeline composer; badge on timeline entry, follow-ups
  My open tasks, overview Overdue tasks.
- New `/tasks` page: nav item, filterable table (status/window/priority),
  complete + setPriority on row, `CreateTaskSheet` (company required, optional
  deal).

**How and why**
- Tasks remain `Activity` rows with `type: TASK` (no new Task model). Priority
  is mechanical CRM data in Nest/DB — not agent intelligence. Dedicated Tasks
  nav page because creation previously only lived inside record timelines;
  global New task still requires a company/contact/deal anchor (confirmed).

**Deviations**
- None relative to the agreed plan. Nav rail already had Sequences; Tasks was
  inserted after Deals.

**What's next**
1. Restart the API (`bun run src/main.ts` in `apps/api`) and smoke-test:
   set deal priority, create a task from `/tasks` and from a deal timeline,
   filter `/tasks` by priority/overdue.
2. Commit when ready (priority migration + UI + sequences may share the
   working tree — check `git status`).
3. Sage push/reconcile remains design-only (`docs/plans/sage-crm-sync.md`
   §3.3/§6). Priority is local-only (not a Sage field).

### 2026-08-03 — Email sequencing panel (full v1)

**What was completed**
- Microsoft Graph send prerequisite: `Mail.Send` in
  `packages/auth/src/scopes.ts` (`MS_MAIL_SEND_SCOPE`, `MS_ALL_SCOPES`,
  `hasMsSendScopes`); Better Auth requests it at sign-in; grant-access
  `linkSocial` asks for sync+send together. Graph `post()` +
  `outlook-send.client.ts`; `MicrosoftTokenService.accessTokenForSend`.
- Schema + migration `20260803100000_add_email_sequences`:
  `EmailSequence`, `SequenceStep`, `SequenceEnrollment`, `SequenceStepRun`,
  `SequenceUnsubscribe` (+ enums).
- API module `apps/api/src/sequences/`: CRUD, enroll, pause/resume/stop,
  stats, tick (lease + send window + merge fields + reply auto-stop +
  timeline Activity + tracking/unsubscribe), controller routes
  `/internal/sequences/tick`, `/t/open|click/:token`, `/u/:token`.
- Cron `*/2 * * * *` in `apps/api/scripts/build-func.mjs`.
- `contacts.options` + `ContactMultiPicker`; `/sequences` UI (list, builder,
  detail, enroll, enrollment table); nav item in `app-icon-rail.tsx`.
- Docs: `docs/plans/sequences.md`; `.env.example` + `APP_PUBLIC_URL` in
  `env.validation.ts`.

**How and why**
- Sequences are mechanical (like mail sync), so they live in Nest, not the
  agent. Per-rep delegated Graph send matches deliverability and reply
  routing. Tick mirrors `AgentTask` / `EmailBackfill` lease patterns.

**Deviations**
- Tracking defaults **off** per sequence (`trackingEnabled: false`) to
  protect B2B deliverability; unsubscribe footer is still always appended.
- Grant-access wall still only requires sync scopes for app entry; missing
  `Mail.Send` only blocks enroll (banner on `/sequences`), not the whole CRM.

**What's next**
1. **Human**: Entra → add delegated `Mail.Send` + Grant admin consent; each
   rep reconnects Microsoft.
2. Smoke test: create sequence → activate → enroll →
   `POST /internal/sequences/tick` with `CRON_SECRET`.
3. Optional follow-ups from plan extras: bounce handling, daily send caps,
   deal-stage auto-enroll.

### 2026-08-02 — Post-backfill corrections + docs (agent: Opus via Cursor)

**Plan / phase**: follow-ups to 7.4b after the full backfill (see the prior
entry). Human-reported issues fixed, then all internal docs updated.

**What was completed**

- **Sage 100 id display**: drop the unused `00-` AR division — show the
  customer number alone (`0011246`). `formatSage100Id`
  (`apps/app/components/crm/sage-id.ts`) + backend `sage100Display`. Data
  untouched; division stays for the future MasHeader join.
- **Company/contact owners** (were all null — owner was never mapped for
  company/contact, only deals): map company owner from Sage `acctmgr` (a
  free-text NAME) via `matchSageUserByName` (unique last name + first initial);
  contacts inherit the company owner. Set-only (never clears a human's choice).
  One-time `scripts/sage-backfill-owners.ts`: 5,985 companies / 12,865 contacts.
  Unmatched (former reps Wallgren/Sertich/Moore, blanks) left owner-less.
- **Deal dates** (chart was flat before the import month): `createdAt` ← Sage
  `opened` (else `createddate`); `closedAt` ← `closed` → `targetclose` →
  `opened` (removed the "stamp now()" default that bunched ~206 dateless closed
  deals into August). One-time `scripts/sage-backfill-deal-dates.ts` (525).
- **Amount/weighted CORRECTED** (Amount was blank, Weighted showed the full
  value): Sage `total` is empty/0 on all 525 opps; the deal value is in
  `forecast`. So `amount ← forecast` (fallback `total`), `weightedAmount =
  amount × certainty/100`, null when no certainty. One-time
  `scripts/sage-backfill-deal-amounts.ts` (525). Verified: opp 380 → amount
  $2,029,650, weighted $1,014,825; open pipeline ~$13.6M unweighted / ~$7.65M
  weighted.
- **Docs updated**: `docs/plans/sage-crm-sync.md` (§3.1 owner + Sage 100 display,
  §3.2 inherit, §3.3 amount/weighted/dates box, §3b forecast semantics, §4/§5/§6
  status → 7.4b DONE), `.cursor/rules/project-overview.mdc` (forecast semantics +
  7.4b done), this HANDOFF (Current state + this entry).
- Tests: added matcher + weighting + opened/date tests; `bun test` Sage specs
  green; whole-monorepo `check-types` green.

**How and why**

- The root cause of the Amount/Weighted bug was the plan's original assumption
  that Sage `total` = value and `forecast` = weighted. Live data is the
  opposite (`total` empty; `forecast` = the value reps type). Corrected the
  mapping and recomputed from snapshots (no Sage refetch).

**Deviations**

- Reverses the earlier §3.3/§3b `amount ← total`, `forecast → weighted`
  decision — documented in the §3.3 "CORRECTED" box so it is not reintroduced.

**What's next**

- Nothing committed yet — commit 7.4b + these fixes + forecast UI when the human
  is ready. Reconcile (soft-deactivate, §6.7) and push (Part G) remain
  DESIGN-ONLY. One-time scripts can be deleted after commit if desired (they are
  idempotent and re-derivable).

### 2026-08-02 — Overview: money coalesce + date range

**Plan / phase**: Overview UX (not a Sage phase). Fixes empty KPIs/charts after
full Sage pull; adds closed-won date range.

**What was completed**
- Root cause: KPIs/charts summed `Deal.amount` (Sage `total`, often null) while
  forecast tables used `weightedAmount` (Sage `forecast`).
- `dashboard.service.ts`: `dealMoneyCents(amount, weightedAmount)` for stage
  pipeline, trend, closed-won, win-rate avg; `groupBy` sums both money fields;
  date-range resolver (`today` / `this_week` / `this_month` / `past_30` /
  `custom`) scopes Closed won + win rate only; open pipeline + forecast stay
  all-open; trend stays trailing 6 months.
- `dashboard.contracts.ts`: `range` / `from` / `to` on summary input.
- UI: `overview-range.tsx` + nuqs parsers; header control next to Me/Everyone;
  KPI labels use range; Deals in progress prefers weighted when amount null.
  Files: `overview-search-params.ts`, `page.tsx`, `dashboard-summary.tsx`,
  `sales-dashboard.tsx`.

**How and why**
After backfill, overview showed 147 closed / 159 open deals but $0 KPIs and
empty charts — Sage revenue lives in `forecast`. Date range was requested so
reps can flip Closed won / win rate without changing the Sage forecast view.

**Deviations**: Custom without valid `from`/`to` falls back to this month
(soft) rather than Zod-rejecting the query. Trend chart not resized by range
(per plan).

**What's next**: Restart API so the new summary shape is live; confirm charts
populate on `/` with Everyone. Then unchanged — confirm full backfill finished
and spot-check. Plan: `docs/plans/sage-crm-sync.md` §6.

### 2026-08-02 — Deal owner-only edits + stage→certainty + inline certainty

**Plan / phase**: Deal permissions + forecasting fields (local edits before
Sage push). Leaves room for Better Auth roles (`docs/crm-plan.md` §6).

**What was completed**
- `CRM_ADMIN_EMAILS` env + `isCrmAdmin` / `canEditOwnedRecord` /
  `canReassignOwner` in `packages/auth/src/admins.ts` (local `.env` has
  `jjohnson@mobilemark.com`).
- `users.me` exposes `isAdmin`. Deals `create`/`update`/`setStage` require
  owner or admin; only admin may change `ownerId`. Non-admin create forces
  actor as owner.
- `STAGE_CERTAINTY` on stage change; `probability` on `deals.update`;
  weighted = amount × certainty%.
- UI: inline Certainty on deal sheet; `readOnly` on inline fields when not
  allowed; stage menus/stepper gated; create-deal hides owner picker for
  non-admins.
- Tests: `packages/auth/test/admins.spec.ts`, `apps/api/test/deal-stage.spec.ts`.

**How and why**
Human: owner-only edits, admin override + reassign, stage drives certainty,
certainty editable inline for owners.

**Deviations**: Admin is email allow-list (not Better Auth `user.role` yet) —
intentional thin seam. Default certainty map: Lead 10 / Qual 25 / Neg 50 /
Proposal 75 / Won 100 / Lost|Unqual 0 (confirm with human if wrong).

**What's next**: Restart API so env + guards load. Confirm certainty map with
human if needed. Unchanged on Sage backfill spot-check.

### 2026-08-02 — Deal stage UI labels (Sage-ish, no enum re-key)

**Plan / phase**: UI polish; plan §3.3 still stands (keep `DealStage` enum).

**What was completed**
- Relabeled presentation only in `apps/app/components/crm/deal-stage.tsx`:
  `DEMO_BOOKED` → "Lead"; `DECISION_MAKER_BOUGHT_IN` → "Negotiating";
  `CONTRACT_SENT` → "Proposal". Qualified / Closed won / Closed lost /
  Unqualified unchanged. Stepper, menus, filters, indicators all use this map.

**How and why**
Human asked for visual Sage-aligned names without re-keying the enum. Lead ≈
blank/unknown; Negotiating ≈ Negotiation; Proposal ≈ Proposal.

**Deviations**: None (labels only; Sage→enum mapper unchanged).

**What's next**: Unchanged — confirm full backfill finished, then spot-check.

### 2026-08-02 — Clear control on company filter chip

**Plan / phase**: UI polish.

**What was completed**
- `CompanyPicker` filter mode: × button beside the trigger when a company (or
  "No company") is selected — clears back to all (`company-picker.tsx`).

**How and why**
Once a name filled the chip, clearing required reopening the menu.

**Deviations**: None.

**What's next**: Unchanged.

### 2026-08-02 — Restarted API so deals company filter applies

**Plan / phase**: UI polish follow-up.

**What was completed**
- Restarted `apps/api` (`bun run src/main.ts`) — previous process was from
  before `dealListInput.company` / `buildWhere` company filter existed. Nest
  has no hot reload, so the list kept returning unfiltered deals (Zod stripped
  the unknown `company` key).

**How and why**
Human reported company filter selection did not change the deals list.

**Deviations**: None.

**What's next**: Unchanged. Confirm filter works after refresh.

### 2026-08-02 — Company filter on deals list

**Plan / phase**: UI polish.

**What was completed**
- `dealListInput.company` + `buildWhere` filter (`deals.contracts.ts`,
  `deals.service.ts`).
- Deals URL facet + searchable `CompanyPicker` (no "No company" — deals always
  have a company) (`deals-search-params.ts`, `deals-table.tsx`).
- `CompanyPicker`: "No company" only when `includeNone` (contacts still pass it).

**How and why**
Same pattern as contacts; human asked for it on deals too.

**Deviations**: None.

**What's next**: Unchanged. Restart API if it was already running (no hot
reload) so `company` on list input is accepted.

### 2026-08-02 — Default column sets for companies + contacts lists

**Plan / phase**: UI polish.

**What was completed**
- Contacts default columns: Name, Title, Email, Company, Last activity, Sage
  100 ID (`owner` now `defaultHidden`).
- Companies default columns: Company, Industry, Contacts, Open deals, Last
  activity, Sage 100 ID (`domain` + `owner` now `defaultHidden`).

**How and why**
Matched the column sets the human settled on in the UI.

**Deviations**: None.

**What's next**: Unchanged. Clear `hide` in the URL if an old tab still shows
a different set.

### 2026-08-02 — Contacts company facet → searchable CompanyPicker

**Plan / phase**: UI polish on contacts list (post–Sage scale).

**What was completed**
- `DataTableFacet` accepts optional `render` for custom facet controls
  (`packages/ui/.../data-table.tsx`).
- `CompanyPicker` filter mode: `allowAll` + `variant="filter"` (compact
  trigger, search popover, All / No company / typeahead)
  (`apps/app/components/crm/company-picker.tsx`).
- Contacts table company filter uses that picker instead of a radio dropdown
  of the first 100 options (`contacts-table.tsx`). Companies page has no
  company facet — unchanged.

**How and why**
With ~14k Sage companies the old dropdown could not list matches; the create-
contact picker already searched via `companies.options`.

**Deviations**: None.

**What's next**: Unchanged — confirm full backfill finished, then spot-check.

### 2026-08-02 — Sage 100 ID column visible by default on companies/contacts

**Plan / phase**: Phase 7.4c polish (UI only).

**What was completed**
- Companies + contacts tables: `sage100Id` no longer `defaultHidden`
  (`companies-table.tsx`, `contacts-table.tsx`). Sage CRM ID stays opt-in.
- `SageIdValue`: click the id text to copy (stops row open); copy icon still
  works (`sage-id-value.tsx`).

**How and why**
Columns already existed from 7.4c but were hidden by default; human asked to
show Sage 100 ID in the list without opening Columns.

**Deviations**: None.

**What's next**: Unchanged — confirm full backfill finished, then spot-check.
If a tab still hides the column, clear the `hide` query param (old default was
baked into that URL).

### 2026-08-02 — 7.4b full pull implemented + first backfill run (agent: Opus via Cursor)

**Plan / phase**: `docs/plans/sage-crm-sync.md` §6 (7.4b full pull), executing
`.cursor/plans/sage_full_sync_ca35f635.plan.md` Parts A–E. Human decisions:
local one-shot backfill; push design-only.

**What was completed**

- **Part A — users**: `SAGE_USERS` (11 reps, names from the human's CSV) in
  `apps/api/src/sage/sage.mappings.ts`; `SAGE_USER_EMAILS` now DERIVED from it
  (no drift). `ensureSageUsers(db)` in `apps/api/src/sage/sage-users.ts` —
  idempotent, stable id `sage-user-<sageId>`, keyed by email, `emailVerified`.
  Ken (27) is Jordan's stand-in + the fallback owner.
- **Part B — schema**: additive migration
  `packages/db/prisma/migrations/20260802220000_add_sage_backfill_state/`
  (applied). `SageSyncState` +`phase`/`backfillId`/`highWaterUpdatedAt`/
  `processed`/`backfillDoneAt` (kept `cursor`). `Company`/`Contact`/`Deal`
  +`sageDeactivatedAt` (soft-deactivate, §6.7) +`sagePushedAt`/`sageUpdatedAt`
  (push echo-guard markers, design-only).
- **Part C — safety**: `withSageSession(db, soap, work)` in
  `apps/api/src/sage/sage-session.ts` — Postgres advisory lock
  (`pg_try_advisory_lock` key `742000777`), always `logoff` + unlock in finally.
  Replaces the in-process `running` flag (test slice uses it too). Throttle
  `SAGE_PAGE_DELAY_MS`, page ceiling `SAGE_MAX_BACKFILL_PAGES`, dry-run mode.
- **Part D — backfill**: `SagePullService.runBackfill({ dryRun, maxCompanies })`
  + `apps/api/scripts/sage-backfill.ts` one-shot (boots a slim Nest context).
  Company walk uses Sage `query`→`next` (walks the COMPLETE set — confirmed
  needed: page 1 already returned companyid 13821, so results are NOT id-ordered).
  Then a full opportunity walk (`oppo_deleted IS NULL`). Owner + company-id +
  taken-domain lookups preloaded once (not per row). Only a COMPLETE walk flips
  `phase` to incremental — a `--max`/ceiling run stays `backfill`.
- **Part E — route**: `GET /internal/sync/sage` now calls `runScheduled()` —
  test slice while `phase = backfill`, nightly `runIncremental()` once the
  backfill flips it. Backfill never runs via the web route (script only). No
  router change, so `server.ts` is untouched.
- **Tests**: `apps/api/test/sage-backfill.spec.ts` (pure helpers extracted to
  `sage-backfill.util.ts`). All Sage tests + whole-monorepo `check-types` green.
- **Canary** (`--dry-run --max=200`): ok in 44s (~22s/page). 200 companies →
  293 contacts; **546 opportunities in Sage**, 525 map, 21 skipped (legacy rows
  with no id/description/company — never fail the import).
- **First full run STARTED** (background, off-peak ~10:10pm): 11 users created,
  writing companies/contacts/deals to the LOCAL DB. Expect ~50–55 min. Every row
  is `source = SAGE` (reversible in bulk).

**How and why**

- Followed the plan's two human decisions + recommended defaults. Chose
  `query`/`next` over id-paging because Sage row order is not guaranteed (proven
  at runtime); idempotent upserts make a fresh re-run the safe crash recovery.
- Names came only from the human's CSV; `SAGE_USER_EMAILS` derives from the list.

**Deviations**

- **id-paged resume (plan Part C / §6.3) deferred**: use `query`/`next` full
  walk instead (correctness — Sage is not id-ordered). `backfillId` is a progress
  marker only; a crash recovers by re-running (idempotent).
- **Advisory-lock caveat**: session-level lock is bound to the Postgres
  connection; with the API's pool the explicit unlock may no-op and release only
  on connection close. Fine for the standalone script (process exit frees it).
  Documented in `sage-session.ts`; upgrade to a lease row when the long-lived API
  host runs Sage jobs alongside the cron/push.
- Snapshot-first is at RECORD granularity (existing `upsertCompanyTree` writes
  each snapshot before its upsert), not a separate page pass.

**What's next**

- Confirm the full run finished ok (`SageSyncState.phase = incremental`,
  `backfillDoneAt` set; `/tmp/sage-backfill.log`). Spot-check a non–Mobile Mark
  company + its contacts + deals in the UI; confirm the forecast overview still
  works with the larger open pipeline.
- Nightly incremental is already wired (cron → `/internal/sync/sage`).
  Reconcile/soft-deactivate (§6.7) and push (`SageOutbox`, Part G) remain
  DESIGN-ONLY — do not build unless asked.
- Forecast UI + this 7.4b work are uncommitted; commit when the human is ready
  (this agent committed nothing).

### 2026-08-02 — Purged local seed CRM data (kept Mobile Mark Sage slice)

**What was completed** — Deleted 18 non–Mobile Mark companies (seed + a few
MANUAL/CALENDAR rows) and related contacts/deals/activities from local
Postgres. Left the 8 Sage `Mobile Mark%` companies + 120 contacts + 4 deals.
Did **not** change `packages/db/prisma/seed.ts`.

**How and why** — One-shot Prisma transaction: clear `primaryContactId`,
delete deals/contacts/activities for non-keep company ids, unlink
email/calendar, then delete companies. Keep rule: name/domain matches Mobile
Mark **or** `sageCrmCompanyId` set. Prep for a real full Sage sync without
demo Stripe/Linear/etc. noise.

**Deviations** — None; operational cleanup only.

**What's next** — Still gated on human Q&A before 7.4b full pull
(`docs/plans/sage-crm-sync.md` §6 / §6.0). Do not re-run `bun run db:seed`.

### 2026-08-02 — Docs gate for 7.4b full pull (agent: Grok via Cursor)

**Plan / phase**: docs only — prep human Q&A before 7.4b.

**What was completed**

- Refreshed HANDOFF Current state: forecast UI done (uncommitted), accurate
  deal stages from DB, reuse inventory for scale, **gate** so next agent does
  not start 7.4b until open questions are answered.
- Listed eight open questions (worker vs chunked, soft-deactivate, lock,
  route shape, throttle, commit-first, etc.).
- Updated `docs/plans/sage-crm-sync.md` §5/§6 gate + open-questions block;
  `m365-expansion.md` Phase 7 stub; `.cursor/rules/project-overview.mdc`.

**How and why**

- Human asked to update docs for full-pull readiness and to leave room for
  questions to the next agent before implementing.

**Deviations**

- None (docs only).

**What's next**

- Human ↔ next agent: answer Open questions. Then commit forecast UI (if not
  already), then implement 7.4b per recipe above.


### 2026-08-02 — Forecast view UI (agent: Grok via Cursor)

**Plan / phase**: `docs/plans/sage-crm-sync.md` §3b — forecast surface.

**What was completed**

- `deals.list` / `deals.byId` now return `probability`, `weightedAmountCents`,
  `dealType`, `sageStage`, `sageStatus`, `sageCrmOpportunityId`; list also
  returns `openWeightedCents`.
- `dashboard.summary` adds `forecast` (totals, months by expected close,
  byOwner) and `closingThisMonthTotal.weightedCents`.
- Overview (`sales-dashboard.tsx`): Weighted forecast KPI; Forecast by close
  month table; Forecast by rep when scope is everyone.
- Deals table: Weighted, Certainty columns; Type + Sage CRM ID (hidden by
  default). Footer shows weighted total.
- Deal sheet: Amount / Weighted / Certainty / Close stats; type + Sage stage;
  Sage CRM ID copy section.
- Plan stubs (`sage-crm-sync.md` §3b/§4/§5, `m365-expansion.md` Phase 7)
  updated — next is 7.4b.

**How and why**

- Forecasting in Sage is opportunity-driven; the UI reconstructs it from Deal
  columns already imported. Folded aggregates into `dashboard.summary` (same
  scope me/everyone) rather than a parallel route or nav item.

**Deviations**

- Replaced the "Average deal" KPI with "Weighted forecast" (four-card strip).
  Average deal remains available via the existing performance block if needed
  later.
- Deal sheet header stats swapped "In stage" / Owner for Weighted / Certainty
  (owner still editable in Details).

**What's next**

- 7.4b full pull (Current state recipe).

### 2026-08-02 — Commit Deal import + handoff for forecast UI (agent: Grok via Cursor)

**Plan / phase**: docs + commit — prep next agent for forecast view (§3b).

**What was completed**

- Committed Deal schema + opportunity test-slice import (migration,
  `mapOpportunity`, pull, tests, HANDOFF).
- Refreshed Current state with a single forecast-UI recipe (API fields →
  dashboard/table → optional deal Sage-ID → smoke).
- Updated `docs/plans/sage-crm-sync.md` §4/§5 status, Phase 7 stub in
  `docs/plans/m365-expansion.md`, and `.cursor/rules/project-overview.mdc`
  (Deal columns landed; gap is the forecast view).

**How and why**

- Human asked to commit then prep docs so the next agent can continue without
  re-discovering status.

**Deviations**

- None.

**What's next**

- Unchanged recipe: Forecast view UI (Current state).

### 2026-08-02 — Deal schema + opportunity test-slice import (agent: Grok via Cursor)

**Plan / phase**: `docs/plans/sage-crm-sync.md` §§3.3, 3b — Deal fields +
opportunity pull.

**What was completed**

- Committed prior 7.4a/7.4c work as `9a0d06c`.
- Additive Prisma migration `20260802200000_add_deal_sage_fields`:
  `sageCrmOpportunityId`, `probability`, `weightedAmount`, `dealType`,
  `sageStage`, `sageStatus` on `Deal`.
- `mapOpportunity` + `mapSageDealStage` in `sage.mappings.ts`; unit tests
  (29 Sage tests green).
- `queryAllRecords` on SOAP client; `importTestSlice` pulls opportunities for
  slice company ids (`oppo_deleted IS NULL`), upserts Deal + snapshot, links
  `DealContact` when `primarypersonid` resolves; owner fallback Ken then
  earliest User.
- Live smoke: `dealsUpserted: 4`, `dealContactsLinked: 4` on company 24.

**How and why**

- Included `sageStage`/`sageStatus` now (cheap with the migration; needed for
  push/board without snapshot reads). Named the weighted column
  `weightedAmount`. Linked primary person via `DealContact` when present.

**Deviations**

- Opp `383` has blank Sage `total` → local `amount` null while
  `weightedAmount` is set. Snapshot retains the raw row.

**What's next**

- Forecast view UI (plan §3b).

### 2026-08-02 — Handoff tightened for next agent (agent: Grok via Cursor)

**Plan / phase**: docs only — `HANDOFF.md` Current state + plan open items.

**What was completed**

- Replaced ambiguous "deals OR 7.4b" next step with a single 5-step Deal +
  opportunity-import recipe (schema fields, mapOpportunity, pull filter,
  fallback owner `ken@mobilemark.com`, smoke).
- Noted **uncommitted** 7.4a/7.4c file set; listed key Sage files; recorded that
  `Deal` still lacks forecasting columns.
- Cleared stale "BLOCKING: supply owner map" in plan §4 (map is in
  `sage.mappings.ts`); set fallback owner rule.
- Updated `m365-expansion.md` Phase 7 stub status.

**How and why**

- Human asked whether the next agent could continue with no questions. Gaps
  were: forked next step, missing default-owner decision, stale blocking note,
  no mention that work is uncommitted / Deal schema untouched.

**Deviations**

- None.

**What's next**

- Unchanged: Deal schema + opportunity import (Current state recipe).

### 2026-08-02 — Phase 7.4c Sage-ID UI + person-email parse fix (agent: Grok via Cursor)

**Plan / phase**: `docs/plans/sage-crm-sync.md` — 7.4c (+ eyeball of 7.4a data).

**What was completed**

- Eyeballed Mobile Mark import: 8 companies, Sage 100 on 24 (`00-0000777`) and
  4139 (`00-MME`); dirty first names (`*`); **0/120 emails** exposed a parser
  bug (person nested email/phone were dropped / stolen by company walk).
- Fixed hierarchical parse: direct-child collection only + `enrichPerson` for
  nested email/phone (`sage-xml.ts`). Re-import → **94 emails / 26 blank**.
- `CopyButton` in `packages/ui/src/components/copy-button.tsx` (Carbon Copy +
  sonner toast, stops row-click propagation).
- API: Sage id fields on `companies.list` / `companies.byId` and
  `contacts.list` / `contacts.byId` (+ nested company Sage 100 on contacts)
  (`companies.service.ts`, `contacts.service.ts`).
- UI: default-hidden Sage CRM ID + Sage 100 ID columns on
  `companies-table.tsx` / `contacts-table.tsx`; "Sage" section on
  `company-sheet.tsx` / `contact-sheet.tsx` (read-only + copy). Helpers:
  `sage-id.ts`, `sage-id-value.tsx`.

**How and why**

- Handoff next was 7.4c once real ids existed. Eyeball first caught the email
  gap; fixed before shipping UI so sheets show useful contact data too.

**Deviations**

- None vs plan section 3d. Opportunities still deferred with Deal fields.

**What's next**

- **ONE path**: Deal schema + opportunity import (company 24 has 4 opps).
  Exact 5-step recipe in Current state above and plan §§3.3 / 3b. Do not start
  7.4b until deals land. Work is still uncommitted — commit first if asked.

### 2026-08-02 — Phase 7.4a Mobile Mark test-slice import (agent: Grok via Cursor)

**Plan / phase**: `docs/plans/sage-crm-sync.md` — 7.4a.

**What was completed**

- Hierarchical company parse + `<more>` flag in `apps/api/src/sage/sage-xml.ts`
  (`parseCompanyTrees`, `parseCompanyPage`, `parseMore`).
- SOAP client: `queryCompanies` / `nextCompanies` / `queryAllCompanies` + `next`
  op in `apps/api/src/sage/sage-soap.client.ts`.
- Mappings: `mapCompanyTree`, `companyname` fallback, `<>` email sanitize,
  nested parent company id for people (`sage.mappings.ts`).
- `SagePullService.importTestSlice` — upsert Company/Contact by `sageCrm*Id`
  (else domain/email link), write `SageRecordSnapshot`, set primary contact,
  in-process session lock + always `logoff`
  (`apps/api/src/sage/sage-pull.service.ts`).
- `POST/GET /internal/sync/sage` (`CRON_SECRET`) —
  `apps/api/src/sage/sage-sync.controller.ts`; wired in `sage.module.ts`.
- Unit tests: 24 pass (`test/sage-xml.spec.ts`, `test/sage-mappings.spec.ts`).
- Live smoke against prod Sage: 8 companies, 120 contacts, 128 snapshots, 16
  skipped (people missing firstname), ~7s.

**How and why**

- Handoff next step was 7.4a. Sibling knowledge: pull `company` hierarchically,
  paginate with `next`, never hold two sessions. Kept opportunities out — Deal
  forecasting columns are still deferred. Domain uniqueness: near-duplicate
  Mobile Mark rows get `domain: null` when the web domain is already taken.

**Deviations**

- Skipped `getmetadata` (plan mentioned it; not required for the upsert path —
  optional follow-up).
- Skipped opportunity import (depends on deferred Deal fields), as handoff
  already noted.

**What's next**

- **7.4c Sage-ID UI** (plan section 3d): `CopyButton` in `packages/ui`; expose
  ids on company/contact list + byId; default-hidden table columns; "Sage"
  section on company + contact sheets. Real Mobile Mark ids are in the DB now.
- Then Deal forecasting columns + opportunity import; then 7.4b full pull.

### 2026-08-02 — Phase 7 principle: fit Sage into the CRM, don't reshape it (agent: Opus via Cursor)

**Plan / phase**: `docs/plans/sage-crm-sync.md` — new "Guiding principle" +
section 3.3 (no code).

**What was completed**

- Added a guiding principle to the plan: Sage bends to the CRM's out-of-the-box
  shape; add the fewest columns (only for UI need or 1:1 push); the raw snapshot
  is the lossless backstop; the mapping catalog is the 1:1 push contract.
- REVERSED the earlier "adopt Sage's stages / replace `DealStage` enum + re-key
  the board" decision. Now: keep the CRM enum, map Sage->local for display,
  store the raw Sage stage for exact push (optional `Deal.sageStage` only if the
  UI needs it). Updated section 3.3, the 7.1 build bullet, and open item #3.
- Reaffirmed forecasting's 3 `Deal` columns as the one deliberate exception (a
  capability the CRM lacks), not a reshape.

**How and why**

- The human clarified they don't want a big new contacts/companies shape — fit
  Sage into what the CRM gives us, keep only the fields that push back 1:1. The
  external-id + Sage 100 columns already added are references, not a reshape, so
  they stand; the enum swap was the one over-customization to drop.

**Deviations**

- Reverses the 2026-08-02 stage decision (documented above). No other change.

**What's next**

- Unchanged: 7.4a test-slice import (nested `company` pull + `getmetadata`),
  then 7.4b per section 6.

### 2026-08-02 — Phase 7 plan corrected from sibling-project knowledge (agent: Opus via Cursor)

**Plan / phase**: `docs/plans/sage-crm-sync.md` — sections 1c + 6 (no code).

**What was completed**

- Folded a knowledge dump from the team's other Sage-sync app (proven in prod at
  ~14k companies) into the plan. Corrections/confirmations:
  - Volumes INVERTED: ~14k companies / ~26k contacts (not 27k/14k); ~4.75k
    companies have a MAS customer number.
  - Pagination is `query` -> `next` while `<more>true</more>` (~100/page), not a
    `maxrecords` cap. Session-stateful, so it can't resume in a later process.
  - ONE Web Services session at a time (2nd logon kicks 1st) -> global lock
    mandatory. Bad password can LOCK the service account -> back off, no
    retry-spam. API ~10-20s/page, ~1h full sync.
  - Backfill = query `company`, take people from NESTED children (do NOT query
    `person` separately) — resolved the flat-vs-hierarchical fork to
    hierarchical. Filter `comp_deleted IS NULL` (status filters miss rows).
    `comp_deleted`/`oppo_deleted` exist; reconcile = soft-deactivate, never
    hard-delete. `getmetadata` for field discovery.
  - Opportunity create (push, later): unprefixed field names on `add`,
    `description` max 50 chars.
- New runtime shape in section 6.3: initial backfill as a Railway worker holding
  one session (~1h, off-peak); incremental as nightly cron.

**How and why**

- The sibling app already solved this against the same server; adopting its
  hard-won constraints avoids us re-learning the session/pagination/lockout
  traps the expensive way.

**Deviations / impact on the built foundation**

- The client built earlier now has KNOWN GAPS for the full pull: no `next`
  operation, `parseRecords` drops nested children (need a hierarchical parser),
  and no `<>` email sanitize. All fine for the small test slice; must be added
  for 7.4b. Documented in the plan and current-state.

**What's next**

- 7.4a test-slice import using the nested `company` pull + `getmetadata`; then
  7.4b per the revised section 6 (worker backfill + nightly incremental).

### 2026-08-02 — Phase 7 foundation built: schema + SOAP client + mappings (agent: Opus via Cursor)

**Plan / phase**: `docs/plans/sage-crm-sync.md` — 7.1 (schema), 7.2 (config +
client), 7.3 (mappings). Deal work + import + UI deferred.

**What was completed** (all green: check-types 10/10, lint 7/7, test 127 pass)

- Schema (additive) + migration `packages/db/prisma/migrations/20260802190000_add_sage_sync`:
  `RecordSource.SAGE`; `Company.sageCrmCompanyId @unique` +
  `sage100CustomerNo` + `sage100ArDivisionNo`; `Contact.sageCrmContactId @unique`;
  models `SageSyncState` (per-entity cursor) + `SageRecordSnapshot` (raw replica).
  Prisma client regenerated.
- Config: `SAGE_SOAP_URL/USER/PASSWORD` documented in `.env.example` and declared
  `@IsOptional() @IsString()` in `apps/api/src/config/env.validation.ts`.
  `apps/api/src/sage/sage.config.ts` — `sageCredentials()` all-three-or-none
  capability helper (mirrors `googleCredentials()`).
- `apps/api/src/sage/` module:
  - `sage-soap.client.ts` — `SageSoapClient`: logon (session cache + one
    re-logon on stale-session fault), `query(entity, predicate)`, `logoff`; raw
    `fetch` + hand-built envelopes; `SageResult<T>` union (never throws).
  - `sage-xml.ts` — pure parsing via `fast-xml-parser` (added dep):
    `parseSessionId`, `parseFault`, `parseRecords` (returns a record's OWN
    scalar fields; drops nested child collections so a `company` response's
    nested people don't leak).
  - `sage.mappings.ts` — `mapCompany`/`mapContact` (+ `sage100Display`), and the
    static Sage-user->email owner map from the team with `emailForSageUser`
    (unknown ids -> null, i.e. former employees -> fallback owner).
  - `sage.constants.ts`, `sage.module.ts`; `SageModule` registered in
    `app.module.ts`.
- Tests: `apps/api/test/sage-xml.spec.ts` + `test/sage-mappings.spec.ts` (16).

**How and why**

- Picked the durable, non-breaking foundation for one session: schema + client +
  mappings, fully typed/linted/tested. Migration authored by hand + `migrate
  deploy` because `prisma migrate dev` needs a TTY (non-interactive here).
  Used `fast-xml-parser` rather than regex because the `company` response nests
  child records — regex can't reliably scope a record's own fields.

**Deviations**

- Deferred ALL Deal changes (the `DealStage` enum swap re-keys the deal board UI
  and existing deals — too big to bundle safely) and the import route/UI. The
  SOAP client therefore has no runtime caller yet; it is exercised only by tests.
- Owner map: Jordan Johnson intentionally imitates Ken (id 27); unknown/former
  users resolve to null for a fallback owner (per the human's instruction).

**What's next**

- 7.4a: the Mobile Mark test-slice import (companies + people) behind a
  `CRON_SECRET` internal route, then 7.4c (Sage-ID UI), then a dedicated deals
  session (enum swap + forecasting + opportunity import). Full pull (7.4b) must
  paginate — Sage caps queries at ~100 rows.

### 2026-08-02 — Phase 7 feature-gap pass: Sage modules + forecasting (agent: Opus via Cursor)

**Plan / phase**: `docs/plans/sage-crm-sync.md` — feature-completeness review.

**What was completed**

- Probed Sage module availability over SOAP. Enabled: `company`, `person`,
  `opportunity`, `communication` (activities), `lead`. NOT enabled: `forecast`,
  `campaign`. Ambiguous ("Query failed", likely enabled but wrong id column):
  `case`, `quotes`, `orders`, `user`. Two distinct error strings distinguish
  "not Web Service enabled" from "query error" — documented in the plan.
- Enumerated opportunity vocabulary (100-row sample): stages
  Investigation/Prospecting, Proposal, Negotiation, Purchasing, Closed Won,
  Lost; statuses In Progress/Won/Lost/Closed; types Key Opportunity/New
  Business/Baseline Business; certainty 0-100%.
- Answered the forecasting question in the plan (section 3b): Sage forecasting
  is OPPORTUNITY-driven (`forecast`/`total`/`certainty`/`targetclose`/`type`),
  not a separate syncable record. Local `Deal` is missing
  probability/weighted-amount/type + any forecast view — the headline gap for a
  Sage interface layer. Added a feature-completeness table (section 3c) and new
  open items (stage model A/B, forecasting scope, extra modules).
- Updated `HANDOFF.md` and the `project-overview` rule pointer to Phase 7.

**How and why**

- The human flagged that the team forecasts in Sage and worried about missing
  crucial functionality. Probed live to ground the answer instead of guessing.
  Forecasting turns out to be the real risk: without it the app is not yet a
  replacement surface for the team.

**Deviations**

- None. New constraint: `forecast` entity is not Web-Service enabled, so formal
  Sage forecast submissions cannot be synced (reconstruct from opportunities).

**What's next**

- Get decisions in plan section 4 (owner fallback, amount source, stage model,
  forecasting-in-first-cut, extra modules), then start Phase 7.1 schema.

### 2026-08-02 — Phase 7 scoping: Sage CRM SOAP confirmed + mappings (agent: Opus via Cursor)

**Plan / phase**: `docs/plans/sage-crm-sync.md` — Phase 7.0 (de-risk / scope).

**What was completed**

- Probed the live Sage CRM SOAP endpoint (`.../eware.dll/WebServices/SOAP`)
  with the service account in root `.env`. Confirmed logon -> `sessionid`
  (SOAP header `sessionheader`), `query { queryString, Entity }`, and `logoff`.
  Namespaces: request `http://tempuri.org/`, response `http://tempuri.org/type`.
- Confirmed the triad is queryable: `company`, `person`, `opportunity` all
  return records. `user` entity is NOT exposed (query fails) — blocks direct
  owner mapping. GET/WSDL return empty; only SOAP POST works.
- Captured full field lists for company/person/opportunity (+ nested
  email/phone/address) and wrote the field-mapping catalog into
  `docs/plans/sage-crm-sync.md` (section 3). Predicates use DB names
  (`comp_`/`pers_`/`oppo_`); responses use short names; cursor = `updateddate`.
- Test slice sized: `comp_name like 'Mobile Mark%'` = 8 companies (<=10 cap).
  Company `24` (MOBILE MARK INC) has 4 opportunities incl. real data
  ("249 PR-LTMWG944-SP716" Closed Won, "Jordan Test Push From Sales Tool").
- Company carries `mas_ardivisionno` + `mas_customerno` — the Sage 100 key that
  joins to `MasHeader`/`MasOrderDetailHistory` for a future order-history phase.
- Repointed the Phase 7 stub in `docs/plans/m365-expansion.md` at the new doc.

**How and why**

- Scope-before-build per the user's request. Probing live proved the triad is
  reachable (only `Mas*` was proven before) and gave real field names so the
  mapping catalog is grounded, not guessed. Pull each entity flat (person via
  `pers_companyid`, opportunity via `oppo_primarycompanyid`) instead of walking
  the deep nested `company` doc — simpler parser, smaller payloads.

**Deviations**

- None from the plan. New constraint discovered: no `user` entity over SOAP, so
  Deal owner (required) needs a fallback owner / static map — logged as open
  item #1 in the Sage plan.

**What's next**

- Phase 7.1: schema migration `add_sage_sync` (sage*Id columns,
  `RecordSource.SAGE`, `SageSyncState`, `SageRecordSnapshot`). Then 7.2 client,
  7.3 mappings, 7.4a Mobile Mark test-slice import. Decide open items (owner
  fallback, amount = forecast vs total) before/at build.

### 2026-08-02 — Phase 5 human smoke complete; Phase 6 deferred (agent: Grok via Cursor)

**Plan / phase**: `docs/plans/m365-expansion.md` — Phase 5 DoD close-out;
Phase 6 decision.

**What was completed**

- Human smoke on `/follow-ups`: saw the suggested follow-up, accepted it,
  TASK was created, then cleared the task (happy path). Phase 5 marked
  DONE in Current state + plan DoD.
- Phase 6 reviewed with human and deferred:
  1. Outlook contacts import — skip (Screening-from-mail covers most
     cases; needs `Contacts.Read`).
  2. Meeting prep — already present in
     `apps/api/src/microsoft/outlook-calendar-sync.service.ts`
     (`prepareForMeeting` → `AgentTriggerService.meetingSoon`); plan
     bullet was stale.
  3. Teams digest — skip for now.

**How and why**

- Close Phase 5 on observed accept→task→clear rather than leaving open
  smoke. Record Phase 6 skip so the next agent does not re-propose those
  extras.

**Deviations**

- Phase 6 meeting-prep item was already implemented in Phase 2 MS calendar
  sync; plan text left as optional extras with a note in Current state.

**What's next**

1. Optional: Microsoft settings panel + sign-in visual pass vs upstream
   design refresh.
2. Phase 7 (Sage) only with a dedicated plan — do not start without one.
3. No Phase 6 work unless the human re-asks.

### 2026-08-02 — Phase 5 agent smoke (suggestions written) (agent: Grok via Cursor)

**Plan / phase**: `docs/plans/m365-expansion.md` — Phase 5 smoke
(curl/dispatch side).

**What was completed**

- Confirmed `AI_GATEWAY_API_KEY` present in root `.env`; restarted
  `apps/agent` (`eve dev` on `:2000`).
- Enqueue: `POST /internal/agent/followups` → `{"enqueued":1}`.
- Dispatch: `POST /eve/v1/dev/schedules/dispatch` →
  `{"scheduleId":"dispatch","sessionIds":["wrun_01KZ217NWH2NB5WF9VW3T3ZK01"]}`
  (HTTP 200). Turn completed with model tokens/cost; tools included
  `read_rep_followup_context` + `propose_followups`.
- DB: 1 `FollowUpSuggestion` PROPOSED (`reply-owed`, summary about Ten18
  antenna order). Evidence `messageId=cmsbxjv9j000cf48o6ippaxmi` exists in
  `emailMessage` (subject "Coming back at you"). `mailCount=8`.
- Left accept / snooze / dismiss + Priority prefs reshape to the human on
  `/follow-ups` (per request).

**How and why**

- Finished the blocked agent path without touching UI decisions the human
  owns. Gateway key was the missing piece from the prior handoff.

**Deviations**

- Only one suggestion this run (enough for evidence spot-check). Root
  session may still show `running` briefly under eve while the turn is
  already `completed` — suggestions were committed either way.

**What's next**

1. Human: on `/follow-ups`, accept one suggestion (confirm TASK on timeline
   + My open tasks), try snooze/dismiss, change Priority selects.
2. Check remaining Phase 5 DoD boxes in `docs/plans/m365-expansion.md`.
3. Phase 6 (asked): choose first extra — Outlook contacts → Screening,
   meeting prep `meetingSoon()`, or Teams digest webhook.

### 2026-08-02 — Phase 5 prefs smoke notes + Priority 3-col UI (agent: Grok via Cursor)

**Plan / phase**: `docs/plans/m365-expansion.md` — Phase 5 priority prefs
(follow-up polish + smoke).

**What was completed**

- Human smoke started: cron enqueue returns `{"enqueued":1}` once
  `CRON_SECRET` is read from root `.env` (bare `$CRON_SECRET` in the shell is
  empty → 403).
- Restarted API so `followups.prefs` / `pipeline` / `updatePrefs` exist
  (long-lived `bun run src/main.ts` does not pick up new routers). Fixed
  Priority card so a failed prefs query shows defaults instead of an endless
  spinner (`priority-prefs.tsx`).
- `FieldGroup layout="columns"` in `packages/ui` — Priority selects render as
  a 3-column row on `md+` (`md:grid-cols-3`).
- Documented: `eve dev` does **not** fire schedules on cron; trigger with
  `POST http://127.0.0.1:2000/eve/v1/dev/schedules/dispatch`. A triggered
  followups session failed: AI Gateway had no credentials
  (`AI_GATEWAY_API_KEY` / `eve link` OIDC). Synced mail exists (~8 messages);
  suggestions table still empty until the model can run.
- Plan already has Priority prefs + future on-page agent ask; no Phase 6 work.

**How and why**

- Separated UI/API wiring bugs from agent model auth so the next agent does
  not re-debug an empty Follow-ups page as a product bug.

**Deviations**

- None from the prefs design. Smoke DoD still incomplete without gateway key.

**What's next**

1. Add `AI_GATEWAY_API_KEY` to root `.env` (see `.env.example`), restart
   `apps/agent`, then:
   - optional re-enqueue:
     `curl -X POST -H "Authorization: Bearer $(grep '^CRON_SECRET=' .env | cut -d= -f2- | tr -d \"\\'\")" http://localhost:3001/internal/agent/followups`
   - `curl -X POST http://127.0.0.1:2000/eve/v1/dev/schedules/dispatch`
2. On `/follow-ups`: confirm suggestions with cited evidence; change Priority
   selects; accept / snooze / dismiss.
3. Check Phase 5 DoD boxes in `docs/plans/m365-expansion.md` when green.
4. Phase 6 only if asked.

### 2026-08-02 — Phase 5 priority prefs (filters + sweep bias) (agent: Grok via Cursor)

**Plan / phase**: `docs/plans/m365-expansion.md` — Phase 5 add-on
("Priority prefs").

**What was completed**

- Plan: added "Priority prefs (Phase 5 add-on)" — three selects, filter-first
  v1, daily sweep reads the same prefs, future on-page agent ask noted as not
  built. Phase 6 left alone.
- Schema: `FollowUpPreference` (`floatFirst` / `lookback` / `scope`) +
  migration
  `packages/db/prisma/migrations/20260802180000_add_followup_preference/`.
  Shared constants/helpers in `packages/db/src/followup-prefs.ts`.
- API: `followups.prefs`, `followups.updatePrefs`, `followups.pipeline`;
  `followups.list` filters/reorders by prefs. Regenerated
  `apps/api/src/generated/server.ts` (12 routers / 54 procedures).
- Agent: `loadFollowupPrefs` + lookback/scope in `repFollowupContext` /
  `proposeFollowUp`; `followupsPreamble` states the three biases.
- UI: `/follow-ups` Priority card (`priority-prefs.tsx`); deals lane uses
  `followups.pipeline`. Cache invalidation covers prefs + pipeline.
- `check-types` / `lint` / `test` pass. Migration applied locally.

**How and why**

- Prefs are mechanical filters (and light sweep prompt text), not intelligence
  in the API — matches `docs/api.md`. One DB row per rep so list and sweep
  stay aligned without a free-form chat UI yet.

**Deviations**

- `shared` means deals the rep owns **or** has logged activity on (no
  deal-membership table).
- On-page agent ask deferred (documented in plan only).

**What's next**

1. **Human smoke (Phase 5 DoD + prefs)**:
   - Connected Outlook mailbox with synced mail.
   - `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/internal/agent/followups`
   - Open `/follow-ups`: change Float first / Look back / Whose work; confirm
     list and deals lane reshape; accept / snooze / dismiss still work.
2. Phase 6 only if asked. Phase 7 needs its own plan.

### 2026-08-02 — Forked to jj-mobilemark/crm; main is now the real branch (agent: Sonnet via Cursor)

**Plan / phase**: Not a phase — repo ownership change requested by the human.

**What was completed**

- `origin` no longer points at `trycompai/crm` (it never had write access
  there — confirmed `viewerPermission: "READ"` before touching anything).
  Renamed that remote to `upstream`; created a fork at
  `github.com/jj-mobilemark/crm` and added it as the new `origin`.
- Pushed `m365-expansion` (commit `8d025d2`, all of Phases 0-5) to the fork.
- Fast-forwarded local `main` to `8d025d2` (a clean fast-forward — `main` was
  already an ancestor of `m365-expansion`, so no merge commit was needed) and
  pushed it to `origin/main`. The fork's default branch is `main`.
- Updated the "Current state" git-layout note above for the new remotes and
  the simpler go-forward workflow (work on `main` directly; pull upstream
  with `git fetch upstream && git merge upstream/main`).

**How and why**

- Human asked to commit and push; `git push` to the old `origin` would have
  failed outright (read-only), and even with access, pushing personal/company
  work-in-progress to someone else's public OSS repo without being asked
  would have been wrong. A fork is the correct destination, and the human
  confirmed: fork under their own account, merge `m365-expansion` into `main`
  so `main` is the full working CRM, and keep `upstream` around for pulling
  future `trycompai/crm` releases.

**Deviations**

- None from what was asked. `m365-expansion` branch was left in place on the
  fork (not deleted) in case anything ever needs to be diffed against it —
  it points at the same commit as `main` right now, so it costs nothing to
  keep.

**What's next**

1. Continue work directly on `main` from here — no more dual-branch
   maintenance for local-vs-upstream.
2. Everything under "Next step" below still applies (Phase 5 human smoke,
   then Phase 6 only if asked).

### 2026-08-02 — Phase 5 Follow-ups / Sales Cockpit (agent: Sonnet via Cursor)

**Plan / phase**: `docs/plans/m365-expansion.md` — Phase 5 implemented.

**What was completed**

- Schema: `FollowUpSuggestion` model (userId/contactId/companyId/dealId,
  kind, summary, capped `quote`, `dueHint`, `evidence` Json, status,
  `activityId`) + migration
  `packages/db/prisma/migrations/20260802155904_add_followup_suggestion/`.
  Additive `AgentTask.userId String?` + index in the same migration, for a
  per-rep task alongside the existing per-record ones.
- Agent (`apps/agent`): `agent/lib/followups.ts` (`repFollowupContext`,
  `proposeFollowUp` — verifies every cited message id exists before writing);
  tools `read_rep_followup_context.ts` (free read) and
  `propose_followups.ts` (one suggestion per call); `agent/lib/preamble.ts`
  gained `followupsPreamble` + a `userId` branch in `sessionPreamble`;
  `agent/instructions/task.ts` passes `attributes.userId` through;
  `agent/schedules/dispatch.ts` passes `userId` in session attributes and
  added the `"followups"` case to `work()`; `agent/lib/tasks.ts` carries
  `userId` through `claimDue`/`retireExhausted`/`completeTask`/`taskSubject`.
- API: `AgentTriggerService.followupsDue(userId, reason)`
  (`apps/api/src/agent/agent-trigger.service.ts`); new
  `apps/api/src/followups/` module — `followups.service.ts` (`list`,
  `decide`, `enqueueDue`), `followups.router.ts` (alias `followups`),
  `followups.controller.ts` (`GET|POST /internal/agent/followups`,
  `CRON_SECRET`-guarded like the sync routes), `followups.module.ts`;
  registered in `app.module.ts`; cron entry added to
  `apps/api/scripts/build-func.mjs` (`0 13 * * *`, once daily). Regenerated
  `apps/api/src/generated/server.ts` (12 routers / 51 procedures).
- UI: `apps/app/app/(app)/follow-ups/` — `page.tsx`, `suggestions-panel.tsx`
  (accept / snooze with quick presets / dismiss), `my-work-panels.tsx` (my
  open tasks + my active deals, reusing `activities.myTasks` and
  `deals.list`). Added to `app-icon-rail.tsx`. `useCrmCache` gained a
  `followup()` invalidation entry.
- Fixed a dropped `###` section header in this file's own work log (the
  Phase 3 entry had lost its heading during a previous edit) while I was in
  here.
- `check-types` (10/10), `lint` (7/7), `test` (7/7 task groups, incl. a new
  `TOOL_VERBS` entry each for the two new tools in
  `apps/app/lib/agent-transcript.ts`) all pass.

**How and why**

- See the "Done, with these deviations" note under Phase 5 in the plan doc
  for the four deviations from the original design (userId on `AgentTask`
  instead of a new table; API cron instead of an agent-side schedule; two
  tools instead of one; `CardPanel`/`SimpleTable` instead of `DataTable`) —
  each one is mechanical, not a scope change.
- Evidence verification lives in `proposeFollowUp`, not just the tool
  description: the project's own rule is that nothing is guessed, and a tool
  that only *asks* the model to cite something real is not the same as a tool
  that checks.

**Deviations**

- See above (plan doc has the full reasoning). Nothing outside Phase 5's
  intended scope.
- Also fixed, unrelated to Phase 5: local dev servers were down when this
  session started (killed during my own earlier smoke-testing on this
  machine). Restarted `apps/api` and `apps/app` directly rather than through
  root `bun run dev` — see "Current state" above.

**What's next**

1. **Human smoke (Phase 5 DoD)**:
   - Ensure at least one rep has a connected Outlook mailbox with real synced
     mail (Phase 2/3 state).
   - Trigger the sweep by hand:
     `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/internal/agent/followups`
     — expect `{"enqueued": <n>}`. This queues one `AgentTask` (`kind:
     "followups"`) per mailbox-connected rep; the agent's `dispatch.ts`
     schedule (`* * * * *` in dev) picks it up within a minute.
   - Open `/follow-ups`: suggestions should appear with cited evidence once
     the agent session finishes. Spot-check that a suggestion's `evidence`
     message ids are real (they are — `propose_followups` verifies this at
     write time — but confirm the UI shows something sensible).
   - Accept one: confirm a TASK activity appears on the named
     contact/company/deal's timeline AND in "My open tasks" here. Try snooze
     and dismiss too.
   - Confirm a second sweep does not duplicate an outstanding suggestion.
2. Root-cause the turbo/`bun --watch` dev-stack crash noted in "Current
   state" if it recurs — capture the exact log leading up to the silent
   exit next time (there was none to capture this session; the process was
   simply gone).
3. Once Phase 5 DoD is fully green: Phase 6 is optional-only work (only
   start if asked). Phase 7 (Sage CRM) is a separate track needing its own
   plan doc — do not start it from this plan.

### 2026-08-02 — Phase 4 Screening Room smoke confirmed (agent: Sonnet via Cursor)

**Plan / phase**: Phase 4 Definition of Done — human smoke test.

**What was completed**

- Human confirmed the three open Phase 4 DoD items: stranger mail produces a
  metadata-only `/screening` row, Approve creates a `Contact` (source `EMAIL`)
  and runs backfill, Reject-with-suppress holds the domain out via
  `SuppressedDomain`.
- Re-verified `check-types` (10/10), `lint` (7/7), `test` (api + agent + app,
  all green) on the current tree before moving on.
- Checked the remaining Phase 4 boxes in `docs/plans/m365-expansion.md`.
- Fixed a dropped section header in this file's work log (the Phase 3 entry
  had lost its `###` heading during a previous edit).

**Deviations**

- None.

**What's next**

1. Start **Phase 5 — Follow-ups / Sales Cockpit**
   (`docs/plans/m365-expansion.md` Phase 5): `FollowUpSuggestion` model +
   migration, `apps/agent` `propose_followups` tool on a daily per-rep task,
   `followups.router.ts`, `/follow-ups` UI (three lanes: suggestions / my
   open tasks / my active deals). Read the `eve` skill before touching
   `apps/agent`.

### 2026-08-02 — Phase 4 Screening Room (agent: Grok via Cursor)

**Plan / phase**: Phase 2 calendar DoD confirmed by human; Phase 4 implemented.

**What was completed**

- Human confirmed Phase 2 calendar: Outlook meeting with Jordan as attendee
  appeared as a MEETING activity on his timeline.
- Schema: `PendingContact` model + migration
  `packages/db/prisma/migrations/20260802170000_add_pending_contact/`.
- Harvest inside unmatched Outlook drop:
  `screening-harvest.service.ts` + hook in
  `outlook-mail-sync.service.ts` (metadata only — no bodies).
- API: `apps/api/src/screening/` — `list` + `decide` (`screening` tRPC alias);
  approve → `ContactsService.createFromScreening` (source `EMAIL`, backfill,
  `contactCreated` reason `"approved in screening room"`); reject + optional
  `suppressDomain` → `SuppressedDomain`.
- UI: `/screening` page + table with Approve / Reject + suppress checkbox;
  rail item in `app-icon-rail.tsx` (UserFollow icon).
- Regenerated `apps/api/src/generated/server.ts` (11 routers / 49 procedures).
- `check-types` / `lint` / `test` pass.

**Deviations**

- Screening list uses `Table` + `Empty` rather than `DataTable`, because
  `DataTable` requires URL query/pagination state that a short review queue
  does not need.

**What's next**

1. Human smoke: mail from a stranger (work domain, not in CRM) → sync → row
   on `/screening` (no thread/body stored). Approve → contact + backfill;
   Reject with suppress → domain stays out.
2. Start **Phase 5 — Follow-ups / Sales Cockpit** in
   `docs/plans/m365-expansion.md`.

### 2026-08-02 — Phase 3 EmailBackfill (agent: Grok via Cursor)

**Plan / phase**: Phase 2 DoD (mail) confirmed by human; Phase 3 implemented.

**What was completed**

- Human confirmed Phase 2 mail path: email from Ten18 Tech → Mobile Mark
  mailbox synced onto Jordan Johnson's timeline after sync.
- Phase 3 schema: `EmailBackfill` model + migration
  `packages/db/prisma/migrations/20260802160000_add_email_backfill/`.
- Enqueue on contact create / email change:
  `apps/api/src/contacts/contacts.service.ts` (`enqueueEmailBackfill`).
- Graph search + worker:
  - `outlook-mail.client.ts` `searchByParticipant` (`$search` +
    `ConsistencyLevel: eventual`)
  - `outlook-mail-backfill.service.ts` (≤3 addresses/tick, 5×50 pages,
    180-day cutoff, all connected Outlook mailboxes)
  - `OutlookMailSyncService.ingestMessage` reuses the Phase 2 store path
  - Wired at end of `MicrosoftSyncService.runDue` / `runForUser`
- Smoke: enqueued `jordan@ten18.tech` → sync wrote **7** messages (incl.
  June history before delta baseline); re-run wrote **0** (idempotent).
- `check-types` / `lint` / `test` pass.

**Deviations**

- Jordan was created before Phase 3 shipped, so the first smoke used a
  manual `EmailBackfill` upsert rather than contact-create enqueue. Create /
  email-change paths are wired for future contacts.

**What's next**

1. Human: open Jordan Johnson Activity — should show older Ten18 threads
   (not only today's sync).
2. Optional: calendar event with Jordan as attendee (Phase 2 leftover DoD).
3. Start **Phase 4 — Screening Room** in `docs/plans/m365-expansion.md`.

### 2026-08-02 — API dying / infinite contact tab spinners (agent: Grok via Cursor)

**Plan / phase**: Phase 2 unblock (local ops).

**What was completed**

- Contact sheet infinite spinners (Overview/Deals/Email filter/Agent) were not
  a contact-data bug: Nest on `:3001` was exiting, so React Query refetches
  never resolved. Activity "All" could still look fine briefly from cache.
- Cause: `apps/api` `dev` used `concurrently` with `bun --watch src/main.ts`
  **and** `nestjs-trpc watch` rewriting `src/generated/server.ts`. That rewrite
  SIGTERM-restarts Nest; `enableShutdownHooks()` exits cleanly, so bun --watch
  often does not bring the API back — leaving orphaned `nestjs-trpc` (PPID 1)
  and nothing on 3001. Mid-session `pkill` debugging made the flap worse.
- Fix in `apps/api/package.json`: `dev` is now only
  `bun --watch --no-clear-screen src/main.ts`. Added optional `dev:trpc` for
  intentional codegen watch. Router type regen stays
  `bun run --filter=api trpc:generate` (AGENTS.md).
- Hard-restarted `bun run dev` in its own session; API pid held `:3001` through
  a 45s health poll with no `nestjs-trpc watch` process.

**Deviations**

- Local `api:dev` no longer auto-watches routers for tRPC codegen (upstream
  did). Manual generate after router edits — matches AGENTS.md.

**What's next**

1. Human: hard-refresh, open Jordan Johnson, flip tabs — should not spin.
2. Finish Phase 2 smoke (mail to/from `jordan@ten18.tech` + sync).
3. Optional visual pass on MS settings vs new comp design system (prior log).
4. Then Phase 3.

### 2026-08-02 — Sync to upstream comp design system (288d41a) (agent: Opus via Cursor)

**Plan / phase**: Not a phase — a safe upstream update requested by the human
after finishing local Phase 2 work.

**What was completed**

- Committed ALL local work (74 files, Phases 0-2 + auth fallback +
  CompanyPicker + docs + `.cursor/`) as a safety snapshot on a new branch
  `m365-expansion` (commit `421e556`). `.env` stayed ignored; no secret was
  staged.
- Fast-forwarded `main` from `856ae2f` to upstream `288d41a` (15 commits: the
  "comp design system" UI overhaul, favicon resolver, row-hover prefetch,
  list-search-in-header, and small fixes).
- Merged `main` into `m365-expansion`. Result: **zero conflicts**. Only three
  files were touched on both sides — `AGENTS.md` and the two create sheets —
  and the edits sat in different line regions, so the 3-way merge combined
  them automatically (verified: CompanyPicker + upstream `<Button>` both
  present; both AGENTS.md sections present; no conflict markers).
- Verified the merged branch: `bun install` clean, `check-types` 10/10,
  `lint` 7/7, `test` 111 pass / 0 fail.

**How and why**

- Branch-first, commit-first because ALL work was uncommitted — a dirty-tree
  `git pull` would have aborted (3 shared files) and left no recovery point.
  The snapshot commit `421e556` is the fallback; `git merge --abort` was
  never needed.

**Deviations**

- None from the intended procedure. New vs upstream: this fork now keeps its
  auth-fallback + Microsoft additions on the `m365-expansion` branch;
  `main` is pure upstream.

**What's next (for the next agent)**

1. Do a visual pass on Microsoft settings
   (`apps/app/app/(app)/settings/microsoft-connection.tsx`) and the sign-in
   page against the new comp design system (flat white, one brand green — see
   `adrs/comp-palette.md` and `docs/design.md`). Several `packages/ui`
   components and design tokens changed.
2. Continue the Phase 2 Definition of Done smoke test (see the Phase 2 entry
   below and the plan).
3. Keep future upstream updates on the same branch discipline (see "Git
   layout" in Current state).

### 2026-08-02 — Phase 2 Microsoft mail + calendar sync (agent: Grok via Cursor)

**Plan / phase**: `docs/plans/m365-expansion.md` — Phase 2 (implementation).

**What was completed**

- Full Outlook sync module at `apps/api/src/microsoft/` (16 files), mirroring
  `apps/api/src/google/`:
  - Constants/contracts/token/Graph client/mail+calendar clients/message
    parser/match/mail-sync/calendar-sync/orchestrator/connection/conversation/
    router/controller/module.
  - Sources: `"outlook-calendar"` then `"outlook"` (Meetings first in UI).
  - Cron: `GET|POST /internal/sync/microsoft` + entry in
    `apps/api/scripts/build-func.mjs`.
  - Registered `MicrosoftModule` in `app.module.ts`.
  - Regenerated and committed path: `apps/api/src/generated/server.ts`
    (10 routers / 47 procedures).
- Shared cursor store: `SyncStateService.due(now, sources?)` filters by
  provider so Google and Microsoft ticks do not steal each other's rows;
  Google revoke only clears Google sources; `SyncStateService` exported from
  `GoogleModule` for Microsoft to import.
- Front end:
  - Replaced interim Settings panel with full
    `microsoft-connection.tsx` (mirrors Google card).
  - `settings/page.tsx` prefetches `microsoft.status`.
  - Timeline expand branches on `meta.source` (`outlook` /
    `outlook-calendar` → `microsoft.thread` / `microsoft.event`); deep links
    prefer Outlook URL when `outlookMessageId` is set.
  - `useCrmCache().microsoft()` added.
- Docs: `docs/local-setup.md` Settings note; plan Phase 2 front-end note.

**How and why**

- Graph mail delta has no cheap "now" token, so the first mail pass drains
  the inbox importing nothing, tagging the in-progress cursor with a
  `baseline:` prefix until `@odata.deltaLink` arrives (forward-only, like
  Gmail). Calendar uses `calendarView/delta` with a 180-day horizon.
- Microsoft token revoke clears stored DB tokens only (no simple public
  Graph revoke endpoint) — documented in `microsoft-token.service.ts`.
- nestjs-trpc collapses identically named Zod exports across routers into
  one import; Microsoft contracts use `ms*` names
  (`msSetAutoCreateInput`, etc.) so Google and Microsoft input types stay
  distinct in `generated/server.ts`.

**Deviations**

- Microsoft Zod contract export names are `ms*` (not identical to Google)
  — required for correct tRPC codegen.
- Mail baseline walks the full inbox once with zero imports (Graph
  limitation vs Gmail `historyId`); may take several cron ticks on a large
  mailbox before steady-state delta begins.
- `CRON_SECRET` was not set in this machine's `.env` at handoff time — the
  sync route fails closed without it. Human must set it before smoke test.

**What's next (for the next agent / human)**

1. **Human — Phase 2 smoke test** (plan Definition of Done):
   - Ensure `CRON_SECRET` is set in root `.env`; restart `bun run dev`.
   - `curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
     http://localhost:3001/internal/sync/microsoft` — expect a run summary.
   - First run(s): mail imports zero messages, records a cursor (baseline
     may span ticks; watch `MailboxSync` for sources `outlook` /
     `outlook-calendar`).
   - Send NEW mail to/from a CRM contact → sync again → thread on timeline
     with body on expand; stranger mail creates no rows.
   - Calendar event with known contact → MEETING activity.
   - Settings → Check now / toggles work.
2. When DoD is green, mark Phase 2 done in this file and start **Phase 3**
   (`EmailBackfill` model + enqueue on contact create/update + worker at end
   of Microsoft sync tick). Skills: `prisma-database-setup`,
   `nestjs-best-practices`.

### 2026-08-02 — Interim Microsoft Settings + Phase 1 closed (agent: Grok via Cursor)

**Plan / phase**: Phase 1 DoD closed; Settings interim ahead of Phase 2.

**What was completed**

- Confirmed Phase 1 smoke test in DB: microsoft account linked, refresh
  token present, scopes `Calendars.Read,email,Mail.Read,openid,profile,User.Read`.
- Settings no longer shows a broken Google "Needs attention" card when only
  Microsoft is configured:
  - New `apps/app/app/(app)/settings/microsoft-connection.tsx` — Connected /
    Needs attention / Not connected from `account.scope` + refresh token;
    Meetings/Email rows marked Coming soon; link to Microsoft account privacy.
  - `apps/app/app/(app)/settings/page.tsx` — prefers Microsoft panel when
    `MICROSOFT_*` set; Google card only if Google is configured and Microsoft
    is not; empty-state copy if neither.
- `docs/plans/m365-expansion.md` Phase 2 Front end — note that interim Settings
  exists and must be replaced (not duplicated) when `microsoft.status` lands.
- `docs/local-setup.md` — Settings note under Microsoft sign-in.

**How and why**

- Full Microsoft settings (sync now, auto-create, purge, revoke) are Phase 2
  work and need `microsoft.router` / MailboxSync. The Google card was actively
  wrong for this install (no Google grant → fake "refresh token" warning).
  An interim read-only Microsoft panel unblocks reps without starting Phase 2
  sync.

**Deviations**

- Shipped a partial Settings UI before Phase 2 — intentional, documented in
  the plan so the next agent replaces it rather than adding a second card.

**What's next (for the next agent)**

1. Read `AGENTS.md`, this file, then `docs/plans/m365-expansion.md` § Phase 2.
2. Skills: `nestjs-best-practices`, `nestjs-trpc`, `prisma-database-setup` if
   schema touches are needed (Phase 2 itself is mostly API mirroring; Phase 3+
   add models).
3. Create `apps/api/src/microsoft/` mirroring `apps/api/src/google/`
   file-for-file (plan lists each mapping). Register module + cron +
   `microsoft.router`; run `bun run --filter=api trpc:generate` and commit
   `apps/api/src/generated/server.ts`.
4. Replace `MicrosoftConnection` interim with a full card driven by
   `microsoft.status` (same UX as `google-connection.tsx`: Check now,
   toggles, purge, revoke). Do not keep rendering the Google card when
   Microsoft is the active provider.
5. Wire timeline expand for Outlook ids (`outlookMessageId` /
   `outlookEventId` already on schema from Phase 0b).
6. Stop when Phase 2 Definition of Done checklist is green; update this file.

### 2026-08-02 — Phase 1 fix: account_not_linked (agent: Grok via Cursor)

**Plan / phase**: `docs/plans/m365-expansion.md` — Phase 1 smoke-test fix.

**What was completed**

- Diagnosed `?error=account_not_linked` after Microsoft OAuth: user
  `jjohnson@mobilemark.com` existed as `credential` with
  `emailVerified = false`. Better Auth defaults
  `accountLinking.requireLocalEmailVerified` to `true`, so it refuses to
  link Microsoft onto that row.
- `packages/auth/src/auth.ts`:
  - `accountLinking.requireLocalEmailVerified: false` (allow-list is the
    real door; no verification email flow).
  - `databaseHooks.user.create.before` now returns `emailVerified: true`
    for allow-listed signups so new credential users do not hit this again.
- DB one-shot: set `emailVerified = true` for `jjohnson@mobilemark.com`.

**Deviations**

- None vs plan intent. Extra config flag beyond Phase 1 file list, required
  for email/password + Microsoft coexistence.

**What's next**

- Human: restart API/app (`bun run dev`), retry Microsoft sign-in. Confirm
  `account` row with `providerId = microsoft`. Then Phase 2.

### 2026-08-02 — Phase 0a collected + Phase 1 Microsoft SSO (agent: Grok via Cursor)

**Plan / phase**: `docs/plans/m365-expansion.md` — Phase 0a (human) + Phase 1.

**What was completed**

- Phase 0a: human registered Entra app `MM-CRM` (single-tenant) and set
  `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` in
  root `.env`. Confirmed present (values not logged).
- Phase 1 auth core:
  - `packages/auth/src/scopes.ts` — `MS_MAIL_SCOPE`, `MS_CALENDAR_SCOPE`,
    `MS_SYNC_SCOPES`, `hasMsSyncScopes()` (normalises Graph URI prefix).
  - `packages/auth/src/env.ts` — `microsoftCredentials()` (all three or none).
  - `packages/auth/src/auth.ts` — `socialProviders.microsoft` with
    `tenantId`, `scope: MS_SYNC_SCOPES`, `prompt: "select_account"`;
    `trustedProviders` includes `"microsoft"`.
  - `packages/auth/src/index.ts` — re-exports MS symbols.
- Phase 1 API / docs env:
  - `apps/api/src/config/env.validation.ts` — optional `MICROSOFT_*`.
  - `.env.example` — documents the three vars + redirect URI.
  - `docs/local-setup.md` — Microsoft sign-in notes.
- Phase 1 UI:
  - `packages/ui/src/components/brand-logos/microsoft.tsx`
  - `apps/app/app/(auth)/sign-in/microsoft-sign-in.tsx`
  - `apps/app/app/(auth)/sign-in/page.tsx` — Microsoft above Google when
    configured.
  - `apps/app/app/(auth)/grant-access/*` — prefers Microsoft when configured.
- Tests: `apps/api/test/google-scopes.spec.ts` — `hasMsSyncScopes` cases.
- Verification: `bun run check-types` pass; app lint pass; api tests pass
  (including new MS scope tests).

**How and why**

- Mirrored the existing optional-Google pattern so missing `MICROSOFT_*`
  hides the button and never throws. Better Auth already requests
  `openid`/`profile`/`email`/`User.Read`/`offline_access`; we only add
  `Mail.Read` + `Calendars.Read` for sync.
- `hasMsSyncScopes` accepts short names and
  `https://graph.microsoft.com/...` forms so the first real grant does not
  false-fail the gate.

**Deviations**

- None material. Grant-access still unused by the app shell (layout uses
  `requireSession()`, not a Microsoft gate) — same as the Google fork
  behaviour after email/password was enabled. Phase 2 sync will need a
  connection check of its own.

**What's next**

1. **Human smoke test (Phase 1 DoD)**: restart `bun run dev` if already
   running (so auth picks up `MICROSOFT_*`), open
   http://localhost:3000/sign-in, click **Continue with Microsoft**, consent
   to Mail + Calendar. Confirm:
   - Landing in the app succeeds.
   - Postgres `account` row: `providerId = 'microsoft'`, `refreshToken` set,
     `scope` contains mail + calendar.
   - Email/password sign-in still works.
2. **CHECKPOINT for next agent**: if stored scopes are unexpected, adjust
   `hasMsSyncScopes` / `parseScopes` (plan Phase 1 notes this).
3. **Phase 2** (`docs/plans/m365-expansion.md` § Phase 2): create
   `apps/api/src/microsoft/` mirroring `apps/api/src/google/` file-for-file.
   Read each Google file first. Skills: `nestjs-best-practices`,
   `nestjs-trpc`. Do not start until the human smoke test above succeeds.

### 2026-08-02 — Phase 0b schema prep (agent: Grok via Cursor)

**Plan / phase**: `docs/plans/m365-expansion.md` — Phase 0 (partial: 0b only).

**What was completed**

- Additive Prisma fields (no renames, no enum changes):
  - `EmailMessage.outlookMessageId String?` in
    `packages/db/prisma/schema.prisma` (mirrors `gmailMessageId`).
  - `CalendarEvent.outlookEventId String?` in the same file (mirrors
    `googleEventId`).
- Migration created and applied against local Postgres:
  `packages/db/prisma/migrations/20260802135359_add_outlook_ids/migration.sql`
  (`ALTER TABLE` only — two nullable TEXT columns).
- `bun run check-types` passed after migrate + generate.

**How and why**

- Followed Phase 0b exactly: keep `GoogleSyncStatus` and Google id columns;
  only add Outlook deep-link ids so Phase 2 sync can store them without a
  later migration. `MailboxSync.source` stays a plain string; Microsoft will
  use `"outlook"` / `"outlook-calendar"` at write time (no schema change).

**Deviations**

- None for 0b.
- Phase 0a (Entra registration) was **not** done — it is a manual Azure
  portal step. Asked the user whether the app is already registered or they
  will supply `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and
  `MICROSOFT_TENANT_ID`. Until those exist, Phase 0 Definition of Done is
  incomplete (migration + types are done; Entra + `.env` are not).

**What's next**

1. **Human — Phase 0a** (plan §0a): Azure portal → Entra ID → App
   registrations → New registration named `MM-CRM`, single-tenant.
   - Redirect URI (Web):
     `http://localhost:3001/api/auth/callback/microsoft`
   - Secret: create one, copy the **value** into root `.env` only (never into
     HANDOFF or git).
   - Delegated Graph permissions + admin consent: `User.Read`, `Mail.Read`,
     `Calendars.Read`, `offline_access`, `openid`, `profile`, `email`.
   - Put into root `.env` (and later `.env.example` docs in Phase 1):
     `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`.
   - Update this file's Current state: mark 0a as collected (do **not** paste
     the secret here).
2. **Next agent — Phase 1** (`docs/plans/m365-expansion.md` § Phase 1):
   Microsoft SSO via Better Auth. Read
   `.agents/skills/better-auth-best-practices/SKILL.md` first. Touch in
   order: `packages/auth/src/scopes.ts`, `env.ts`, `auth.ts`; then
   `apps/api/src/config/env.validation.ts`; `.env.example`; sign-in +
   grant-access UI. Mirror the existing optional Google pattern so missing
   `MICROSOFT_*` hides the button and never throws.
3. Do **not** start Phase 2 until Phase 1 DoD is satisfied.

### 2026-08-02 — Initial setup, auth fallback, UX fixes, M365 plan (agent: Fable via Cursor)

**What was completed**

- Cloned and set up `trycompai/crm` in this repo: installed Bun 1.3.12,
  started the docker-compose Postgres, created the root `.env` from
  `.env.example` (`BETTER_AUTH_SECRET` generated, `ALLOWED_SIGN_IN` set,
  `DATABASE_URL` matching compose), ran migrations and the demo seed.
- Cursor project scaffolding: rules in `.cursor/rules/` (`project-overview`,
  `local-dev`, `skills-and-docs`), setup tracking doc `docs/local-setup.md`,
  and `.cursor/skills/` symlinks into the canonical `.agents/skills/` so the
  bundled skills work in Cursor as well as Claude Code.
- Enabled email/password auth so the app is usable without a Google OAuth
  client:
  - `packages/auth/src/auth.ts` — `emailAndPassword.enabled: true`.
  - `packages/auth/src/client.ts` — export `signUp`.
  - `apps/api/src/config/env.validation.ts` — `GOOGLE_CLIENT_ID`/`SECRET`
    made optional (were required).
  - `apps/app/app/(app)/layout.tsx` — gate relaxed from
    `requireGoogleAccess()` to `requireSession()`.
  - `apps/app/app/(auth)/sign-in/credentials-form.tsx` — new sign-in /
    register form; `page.tsx` renders it and shows the Google button only
    when Google creds are configured.
- Replaced the plain company `<Select>` with a searchable, debounced
  typeahead: new `apps/app/components/crm/company-picker.tsx`, used in
  `apps/app/app/(app)/deals/create-deal-sheet.tsx` and
  `apps/app/app/(app)/contacts/create-contact-sheet.tsx`.
- Wrote the Microsoft 365 expansion plan: `docs/plans/m365-expansion.md`.

**How and why**

- Email/password was the fastest safe way in (org uses Microsoft 365, so a
  Google OAuth client was pointless); the `ALLOWED_SIGN_IN` allow-list still
  guards registration, so the authorisation model is unchanged.
- CompanyPicker exists because the org will import thousands of companies
  from their existing CRM — a static dropdown doesn't scale. It queries
  `companies.options` via tRPC with a debounced search term.

**Deviations from upstream**

- Upstream assumes Google-only sign-in and gates the whole app on granted
  Gmail/Calendar scopes. This fork treats Google (and later Microsoft) sync
  as optional capabilities and gates only on a valid session. Documented in
  `docs/local-setup.md` › "Auth changes from upstream".

**What's next**

- Execute `docs/plans/m365-expansion.md` starting at **Phase 0** (Entra app
  registration is a manual human step in the Azure portal — ask the user to
  do it or to provide the three `MICROSOFT_*` values; the schema prep half of
  Phase 0 is agent work). Then Phase 1 (Microsoft SSO), and so on, one phase
  at a time. Each phase ends with its Definition of Done checklist and an
  update to this file.
