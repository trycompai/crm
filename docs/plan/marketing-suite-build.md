# Build — Marketing suite

The order of work for [`marketing-suite.md`](./marketing-suite.md), which holds
the decisions. This file holds the files, the procedures and the phases, and
points back there rather than restating anything — the model is §6 over there,
not here.

Twelve phases, each one a PR that merges to `main` on its own and leaves the
product in a state somebody could use. A Median task id goes in every commit and
PR title (`AGENTS.md`).

**Phases 0–5 are a working blast product.** Phases 6–9 are the drip, and they are
the half the Growth call was about. Shipping 5 and stopping would leave something
usable; shipping 6 without 7 would leave a flow engine nobody can see.

---

## The shape of it

| Package | Gains |
| --- | --- |
| `packages/db` | The twelve models, `src/marketing/` — recipients, segments compiler, send queue, the graph engine, `assertSendable`, `queueDirect` |
| `packages/email` | **New.** Document schema, block components, renderer, merge, lint |
| `packages/ui` | Editor primitives — block list, block toolbar, inspector, preview frame — and `flow-canvas` with its five node components |
| `apps/api` | `src/marketing/` — one module, seven routers, the Resend client, the drain, the webhook |
| `apps/app` | `app/(app)/[slug]/marketing/` — the section, the canvas and its chat rail; `app/u/[token]/` — unsubscribe |
| `apps/agent` | Fourteen tools. No transport, no renderer, no HTTP client |

**One more direction that does not bend:** `@xyflow/react` is a dependency of
`packages/ui` and of nothing else. `apps/app` renders `flow-canvas`; it never
imports React Flow, and the engine in `packages/db` has never heard of it.

**Dependency direction, and it does not bend:** `packages/email` imports nothing
from an app. `apps/agent` never imports `resend` — it writes
rows through `@crm/db/marketing` and nothing else. Only `apps/api` sends.

---

## Phase 0 — Foundations

*Nothing is visible. Everything after this is additive.*

1. `packages/db/prisma/schema.prisma` — the twelve models and thirteen enums
   from §6, plus the thirteen `marketing*` columns on `AppSetting`. One
   migration. **`MarketingCampaignNode` and `MarketingCampaignEdge` land here,
   in phase 0, even though nothing draws a graph until phase 6** — because a
   blast is a one-node campaign (§6) and phase 4 writes that node. Adding the
   graph later would mean migrating every blast into one.
2. `packages/db/src/marketing/`, exported as `@crm/db/marketing`:
   - `recipients.ts` — `recipientFor(db, address, { contactId })`,
     `suppress(db, address, reason)`, `sendable(db, addresses)`. Keyed through
     `normalizeEmail`.
   - `settings.ts` — `readMarketingSettings`, `writeMarketingSettings`,
     `assertSendable(db)` returning `{ ok } | { ok: false; missing: Step[] }`.
   - `segments.ts` — the `Filter` zod schema and `compile(filter)` → Prisma
     `where`, plus `matches(db, filter, contactIds)`, which is **one line over
     `compile`** and has no logic of its own (§11). Exactly two exports. Write
     `matches` now, in phase 0, before phase 6 needs it — the whole point is
     that nobody arrives at the branch evaluator with no per-contact entry point
     and writes a TypeScript tree-walker.
   - `queue.ts` — `materialise(db, campaignId)`, `queueDirect(db, input)`,
     `claimDueSends(db, limit)` with `FOR UPDATE SKIP LOCKED`,
     `settle(db, sendId, outcome)`.
3. `packages/email` — the package, `document.ts` (zod), and `render.ts` behind a
   single block so the pipeline is provable end to end before there are eight of
   them.
4. `.env.example` — no new variable. `APP_URL` gains a note that marketing links
   are built from it and a send refuses without it.

**Tests.** `packages/db/test/marketing-segments.spec.ts` — every facet compiles
and the compiled `where` returns what the fixture expects, against a real
Postgres. **Parity: for every facet, `matches()` over the full contact set
returns exactly `compile()`'s result set.** That spec is the thing standing
between us and two compilers. `packages/email/test/render.spec.ts` — a document
renders, and renders the same twice.

## Phase 1 — Resend and settings

*The first thing a person can do: connect Resend and send themselves a test.*

1. `apps/api/src/marketing/resend.service.ts` — the one wrapper around the SDK.
   **Check `error`, never try/catch.** `sendOne` / `sendBatch` with an
   idempotency key `send/<sendId>`; batch of 100 where the send has no
   attachment, single where it has. Returns null when no key is configured —
   **an absent capability, never a thrown error**, on the
   `lib/capabilities.ts` principle applied on this side of the wall.
2. `resend-domain.service.ts` — `domains.create` for the subdomain,
   `domains.get` for records and per-record status, `domains.verify`,
   `domains.update` for `openTracking` / `clickTracking`. **We store
   `marketingResendDomainId` and read the rest live**; nothing about DNS or
   tracking is cached in a column (§6).
3. `marketing.module.ts`, `marketing-settings.service.ts`,
   `marketing-settings.router.ts` with `settings` / `saveKey` / `saveIdentity` /
   `domain` / `verifyDomain` / `sendTest`. Keys masked on read with `maskKey`;
   secrets never returned. **No `saveTracking`** — that is a link to Resend.
4. `apps/app/app/(app)/[slug]/marketing/layout.tsx` — `marketing-sidebar.tsx`
   and nothing else. **No redirect here, and none in the pages** (§2). The five
   routes as stubs, `settings/page.tsx` real.
5. The wizard, in a **sibling route group** so it inherits no layout —
   `(marketing-setup)/marketing/setup/[step]/`. Nesting it under step 4's folder
   gives it the sidebar it exists to avoid. **Read
   `apps/app/node_modules/next/dist/docs` on route groups and layouts first.**
   Four steps, a breadcrumb rail, a progress border, and a footer whose
   **Continue is disabled until the step is satisfied**. Steps post the same
   mutations as the settings controls.
6. `marketing.status` → `{ onboarded }` — its own cheap procedure, not
   `marketing.settings`, because the app shell reads it on every page.
7. `apps/app/app/(app)/[slug]/layout.tsx` — an async server component inside the
   existing `AppIconRailFallback` boundary, on the `WorkspaceHeader` pattern
   already in that file: resolve `onboarded` and pass it to `AppIconRail` as a
   prop. **Catch the read like `workspacePromise` is caught, and default to
   `true`** — the rail is above every screen in the CRM and must not fail with
   this feature.
8. `app-icon-rail.tsx` — the `Bullhorn` entry, with `href` resolving to
   `/marketing/setup/connect` when `onboarded` is false. `section-prefetch.ts` —
   the `/marketing` case, following the same flag.

**Tests.** `apps/api/test/marketing-settings.spec.ts` — a secret never comes
back out; `assertSendable` names every missing step; an invalid key is refused
and an unknown one is saved with a warning; no key configured returns null
rather than throwing.

## Phase 2 — Templates

1. `packages/email/src/blocks/` — the eight components, Tailwind with
   `pixelBasedPreset`, `Row`/`Column` for `columns`, `box-border` on `Button`.
2. `compose.tsx` — header + document + footer + the appended unsubscribe and
   postal block; `merge.ts`; `lint.ts` (§10 of the design record); `links.ts`.
3. `packages/ui` — `email-canvas`, `email-block-toolbar`, `email-inspector`,
   `email-preview-frame`. Shared components, shared variants, no `className`
   overrides at the call site.
4. `apps/api/src/marketing/templates.service.ts` + `templates.router.ts` —
   `list`, `byId`, `create`, `update`, `duplicate`, `archive`, `preview`,
   `partials.*`. `preview` is a query returning `{ html, text, lint }`.
5. `apps/app/.../marketing/templates/` — the list, and `[templateId]/` with the
   editor beside the live preview.
6. `packages/db/prisma/seed.ts` — a default header, a default footer, and two
   starter templates (announcement, plain letter) so the first preview is not an
   empty box.

**Tests.** Golden-file render for both starters. Every lint rule, one spec each.
A merge tag with no fallback warns; an unknown tag is refused.

## Phase 3 — Segments

1. `segments.service.ts` / `segments.router.ts` — `list`, `byId`, `create`,
   `update`, `archive`, `preview` (count + 20 rows), `freeze` (dynamic → static),
   `members.*` for static lists.
2. `apps/app/.../marketing/segments/` — list, and the builder sheet: a filter
   tree UI over the facet whitelist, with the live count in the header. Facets
   are read from the API, including custom fields, so a new `FieldDefinition`
   appears with no client change.
3. Contacts list gains **Save as segment** from the existing filter bar, which
   is the cheapest good entry point in the product.

**Tests.** `preview` and `materialise` return the same set for the same
definition — one compiler, proven, not asserted.

## Phase 4 — Campaigns: the blast

*The phase where email leaves the building.*

1. `campaigns.service.ts` / `campaigns.router.ts` — `list`, `byId`, `create`,
   `update`, `schedule`, `approve`, `pause`, `resume`, `cancel`, `stats`,
   `recipients` (paginated, with skip reasons). **`create` writes the campaign
   and its single `EMAIL` node in one transaction** (§6); a campaign with no
   node is not a state the rest of the code should have to handle.
2. `schedule` — `assertSendable`, then lint errors, then `materialise` in one
   transaction. It returns; it does not send.
3. `sends.service.ts` / `sends.router.ts` — `create` (the one-off, `DIRECT`),
   `byContact`. Both call `queueDirect`.
4. `marketing-drain.service.ts` — the in-process 30-second timer, the day-lock
   equivalent (a row lock on the tick), claim, throttle, compose, send, settle,
   and the campaign's status when its last row settles. Attachments route to
   single sends; everything else batches at 100.
5. `POST /internal/marketing/drain` — `CRON_SECRET` **or**
   `AGENT_BRIDGE_SECRET`, unset refuses. Added to `apps/api/vercel.json` at
   `* * * * *`.
6. Attachments — `attachments.service.ts`, upload through `@crm/db/blob`,
   40 MB total enforced at upload and at compose, absent entirely without
   `BLOB_READ_WRITE_TOKEN`.
7. Unsubscribe — `apps/app/app/u/[token]/page.tsx`, `/u` added to `ANONYMOUS` in
   `proxy.ts`, and `POST /api/m/u/:token` on the API.
8. `POST /api/m/webhook/resend` — raw body, `resend.webhooks.verify()`, unknown
   `providerId` dropped and counted.
9. `apps/app/.../marketing/campaigns/` — list, and the campaign sheet with
   Content / Audience / Schedule / Results. **Send email** on the contact and
   company sheets.

**Tests.** Materialising twice writes one row per recipient. A suppressed
address is `SKIPPED` with a reason. Two concurrent drains send each row once. A
drain interrupted mid-batch resumes and does not resend. A send with an
attachment never reaches the batch endpoint. The webhook rejects a bad signature
and a replayed timestamp. An unsubscribe is written before the response returns.

## Phase 5 — Engagement and the brand pass

*No pixel and no redirect are built. Resend measures; we read and we report.*

1. `email.opened` and `email.clicked` are already handled by the Phase 4
   webhook — this phase only adds the reading. Settings shows the two states
   from `domains.get` with a link to Resend; **there is no toggle of ours.**
2. Retention: `MarketingEvent` joins the existing tracking sweep at 90 days,
   with `BOUNCED` / `COMPLAINED` / `UNSUBSCRIBED` exempt.
3. The Results tab, with the Apple MPP sentence beside the open rate and the
   click-rewriting caveat beside the click rate (§14).
4. **The brand pass** (§17.1) — `apps/agent/agent/lib/marketing-brand.ts`, a new
   `DIRECT_KIND` beside `brand`: `brandByDomain` on the workspace's own domain,
   `mirror()` the logo, reject an SVG-only logo for email, contrast-check the
   colour against white and darken until it clears 4.5:1, then write the two
   default `MarketingPartial` rows. **Every step optional, nothing throws.**
   Queued by `MarketingSettingsService` when the key is saved.

**Tests.** An SVG-only brand falls back to the wordmark rather than emitting a
broken `<img>`. A light brand colour is darkened until it passes, and the
recorded value is the darkened one. No Context key writes plain defaults and
returns cleanly.

## Phase 6 — Drips: the graph and the engine

*No canvas yet. The engine is provable without one, and it is the part that can
be wrong quietly.*

1. `@crm/db/marketing/graph.ts` — `validateGraph(nodes, edges, settings)`:
   acyclic, one root, no dangling handle, every `BRANCH` with both outputs,
   every `SPLIT` with weights summing to 100, and **a `BRANCH` on `opened`
   refused outright when open tracking is off at the Resend domain** (§13.1) —
   that arm can never fire and is dead code. **Returns a list of problems with
   node ids**, never a boolean — the canvas and the agent both need to say which
   box is wrong.
2. `@crm/db/marketing/drips.ts`:
   - `sweepExits(db, campaignId)` — one compiled `where` intersected with active
     enrolments, bulk update, stamping `exitKind` as well as `exitReason`
     (§13.8 depends on the kind, not the string).
   - `sweepEntries(db, campaignId)` — one compiled `where`, minus the six
     exclusions in §13.8's table, bulk insert at `pass = lastPass + 1`.
   - `advance(db, enrolmentId)` — resolve the current node, follow the edge,
     write the next send or the next `nextDueAt`. `BRANCH` and `SPLIT` resolve
     and keep walking within the tick.
   - `linkReplies(db, since)` — stamp `repliedAt` from inbound `EmailMessage`.
3. `marketing-drain.service.ts` gains the five ordered stages from §13.3.
   **Replies first, exits second.** An exit rule that cannot see a reply from
   thirty seconds ago is the bug this order exists to prevent.
4. `drips.service.ts` / `drips.router.ts` — `graph` (read), `writeGraph`,
   `updateNode`, `activate`, `pause`, `resume`, `drain`, `archive`, `enrol`,
   `unenrol`, `enrolments` (paginated), `nodeStats`.
5. **Lifecycle** (§13.9) — `resume` takes `{ clocks: "restart" | "backlog" }`
   and defaults to `restart`; `DRAINING` runs every stage but the entry sweep
   and auto-archives when the last enrolment settles; `archive` **refuses** with
   the active count unless it is told to drain or to exit everybody.
6. The contact sheet gains **Enrol in drip** and lists current enrolments with
   the node each person sits on.

**Tests, and these are the ones that matter most in the whole build.**

Every exit rule, one spec each, against real rows — a reply written by
`ThreadWriterService` must actually stop the drip. An exit fires **between** two
touches, not at the next one. A cycle is refused at save with the edge named. A
`SPLIT` assigns the same enrolment to the same arm across a retried tick. A
`BRANCH` on `opened` with tracking off is refused, and the message names the
node.

**Re-entry, one spec per row of §13.8's table**, because every one of them is a
way to mail somebody twice: an `ACTIVE` enrolment blocks a second; a
`SUPPRESSED` exit blocks re-entry **forever, including when the cooldown has
passed**; `maxPasses` holds at its limit; a second pass starts at the root, not
where the first ended; and `@@unique([nodeId, recipientId, pass])` lets pass 2
send the touch that pass 1 already sent — which is the one assertion that proves
the column earns its place.

**Lifecycle:** resume with `restart` moves every past-due `nextDueAt` forward
and sends nothing on the next tick; resume with `backlog` sends them. `DRAINING`
admits nobody and still advances everybody. Archive refuses with a count while
anybody is active.

**Ten thousand active enrolments cost two queries per drip per tick**, asserted
with a query counter — the set-operation design is a claim, and an untested
claim about query count is the one that regresses in month three.

## Phase 7 — The canvas

1. `packages/ui` — `flow-canvas`, wrapping `@xyflow/react`. The library
   stylesheet imported **here and only here**. Five node components on the
   shadcn primitives. **Read `.agents/skills/react-flow` first.**
2. `flow-tokens.css` — **every** `--xy-*` variable mapped to a token, in one
   file (§20). Not the four that show up on the happy path: the selected-edge
   stroke and the handle colours are how somebody sees which edge they are about
   to reattach, and they only appear in a state a screenshot misses.
3. Server-side layout — `dagre` on save when a node has no position, so the
   agent never invents coordinates (§13.5). A dragged node persists `x`/`y` and
   is left alone afterwards.
4. `apps/app/.../marketing/campaigns/[campaignId]/` — the canvas page. **No
   marketing sidebar**; app header and icon rail only, with a **← Campaigns**
   breadcrumb (§2). Chat rail collapsible. `BLAST` renders the composer it
   already had; `DRIP` renders the canvas. **The template editor and the segment
   builder lose the sidebar in the same change** — one rule, three pages, or the
   third one gets it wrong in a later PR.
5. The node sheet — the record-sheet pattern, ~1,000px, canvas still visible
   behind it. Left half is the phase 2 body editor, unchanged and reused; right
   half is the **live server render** from `templates.preview` in an `iframe
   srcDoc`, with desktop / mobile / plain-text (§13.5).
6. **The shell is two locked rows** bookending the block list — header at the
   top, footer at the bottom, muted, with a lock, opening the partial in
   Templates (§8). Visible, never editable. **No shell controls anywhere in the
   sheet.**
7. Deleting a node with enrolments on it is refused with the count.

**Tests.** The canvas renders a fifty-node graph without a literal colour or
radius anywhere in the diff — checked by the design lint, not by eye. **The
built stylesheet contains no literal colour outside `flow-tokens.css`**, and
every `--xy-*` variable the installed version defines is mapped — asserted
against the library's own stylesheet, so a version bump that adds one fails the
build instead of shipping a blue handle.

## Phase 8 — Splits and per-touchpoint numbers

1. `SPLIT` reporting — the arms side by side, and **Declare winner** (§13.4):
   reweight to 100/0, keep the losing arm and its history, and say in one line
   how many people stay on it. The readiness states — *too early*, *inside the
   noise*, *A wins on reply rate* — are the panel's, not the marketer's
   arithmetic. **Reply rate first, clicks second, opens never.**
2. **Promote to template** — a second, separate action that copies the winning
   subject, preheader and body onto the `MarketingTemplate` the node came from.
   It is the only way a win escapes this drip.
3. `nodeStats` on the canvas: sent, delivered, opened, clicked, replied,
   bounced, unsubscribed, as a compact strip on every `EMAIL` node.
4. The pipeline — enrolments grouped by `currentNodeId`, drawn as a count in
   flight on each edge, with `nextDueAt` giving when they move (§13.7).
5. Deliverability (§14) — bounce and complaint rates on every campaign and in
   Settings, **and the automatic pause at 5% hard bounces**, which is a service
   rule and gets its own spec.
6. A `BRANCH` on *opened* shows the Apple MPP warning in its inspector and
   defaults to *clicked* (§13.1). The hard refusal when tracking is off already
   landed in phase 6.

**Tests.** The 5% pause fires, records why, and a resume works. Per-node counts
match the send rows they are derived from, on a graph with a split in it.
Declaring a winner reweights the edges, moves nobody who is already in flight,
and leaves the losing arm's numbers readable. Promote-to-template writes the
template and changes no live node.

## Phase 9 — The agent, and the co-pilot

1. `apps/agent/agent/tools/` — the fourteen tools from §18. Every write goes
   through `@crm/db/marketing`; none of them reimplements a rule and none of
   them holds a transport.
2. `write_campaign_graph` — nodes and edges, no coordinates, through
   `validateGraph`. **Problems come back to the model to fix**, exactly as lint
   errors do from `write_template`, and for the same reason.
3. **Three new `AgentRecordKind`s** — `campaign`, `segment`, `template` in
   `apps/app/lib/agent-record.ts`; `AgentConversation` gains three nullable ids
   with `onDelete: Cascade`; the rail is the existing panel on all three
   surfaces. **Read `docs/agent-panel.md` first**; every rule in it applies
   unchanged and each one is a bug somebody already had.
4. **The composer moves to `/packages/ui`** from
   `apps/app/components/agent-builder/agent-composer.tsx`, and `/chat` and the
   marketing rails both use it. `ChatChipResource.kind` gains `segment`,
   `template` and `campaign`. Not a fork — one component, two call sites, or
   they drift within a month.
5. **Approval as an eve policy, not a flag** (§13.6) — draft edits
   `not-applicable`, live edits `user-approval`, an autonomous principal
   `{ type: "denied" }` with a reason. Denied rather than parked: a run nobody
   can answer hangs until it expires.
6. Graph building — the parent writes structure in one `write_campaign_graph`;
   copy is delegated one node per child through eve's built-in `agent` tool with
   an `outputSchema`, emitted as one batch so they run concurrently.
   **Non-overlapping write scopes**, which one-node-each satisfies.
7. Every co-pilot edit returns the changed node ids, and the canvas flashes them
   off `action.result` — **never off a re-fetch and diff**, which races the next
   edit (§13.6).
8. **No `activate_campaign` tool.** The absence is the control — not `always()`,
   because an approval prompt can be clicked through and a missing tool cannot.
9. `send_email` — resolve the contact, resolve the template, check suppression,
   `queueDirect`, then `POST /internal/marketing/drain` on `API_URL` with
   `AGENT_BRIDGE_SECRET`. **Fire and forget**: the row is the message, and a
   failed poke costs one tick, not the send.
10. `lib/approval.ts` — the principal check. A rep in a conversation sends; a
   dispatched task or scheduled run cannot, and stages instead.
11. `lib/preamble.ts` — a marketing entry, naming the neighbouring records with
   their ids, per *three records, no dead ends*.
12. `apps/app/lib/agent-transcript.ts` — `TOOL_VERBS` for the fourteen.
13. `apps/agent/agent/skills/` — a marketing skill holding the tone rules, the
   linter's reasoning **and what a good drip looks like** — how many touches,
   how far apart, what to branch on — so the co-pilot's first graph is worth
   reviewing rather than worth deleting.

**Tests.** `write_template` returns lint errors to the model rather than saving.
`write_campaign_graph` returns a cycle to the model rather than saving.
`send_email` sends for a rep principal and refuses for a task principal —
asserted, because it is the rule the whole approval design rests on.
`send_email` to a suppressed address returns the reason and writes no row.
`schedule_campaign` never reaches `SCHEDULED` without the review screen. No tool
can move a drip to `ACTIVE`.

## Phase 10 — Telemetry, docs, polish

1. `packages/telemetry/src/allowlist.ts` — the twenty-five properties **first**.
2. The rollup query, and `first_campaign_sent` in the funnel sweep.
3. `docs/telemetry.md` — the new rows, and the marketing entries under *what is
   never sent*.
4. `docs/marketing.md` — the operating rules, added to the table at the top of
   `AGENTS.md`. This plan is a plan; that file is the doc a future change must
   read first.
5. `docs/api.md` — the sentence from §3. Today it names the exchange-rate
   fetcher as the one exception to *no vendor client in Nest*; it must name the
   mailbox pipeline and marketing sending as what the API sends and receives
   mail with, and leave the intelligence rule exactly as it is. **Do this in the
   phase that adds `resend` to `apps/api/package.json`, not here** — a rule and
   the code that reads oddly against it must never be apart across a merge.
6. `.env.example`, `CHANGELOG` via the release flow in `CONTRIBUTING.md`.

## Phase 11 — Overview

Deferred to design. The rail sends anybody mid-setup to
`/marketing/setup/connect` instead (§2), so this route only ever has to answer
for a workspace that has finished: the last five campaigns and nothing more
until it is designed. Nothing here is invented in an engineering PR.

---

## Rules to re-read before starting each phase

- `docs/api.md` — one router per module, `AuthMiddleware` at the class, zod in
  and service out, `listInput` for every list, filter in Prisma, invalidate
  through `useCrmCache()`. **`src/generated/server.ts` is committed and only
  `check-types` and `dev` regenerate it** — if the app cannot see
  `marketing.campaigns.list`, that is why.
- `docs/agent.md` — `claimDue`'s lease, which the drain copies; capabilities
  that never throw; and the warning about work detached after a response on a
  serverless API, which is why the drain is a cron and a timer rather than a
  `void` after the mutation.
- `docs/design.md` — the radius scale, the two filled variants, and
  `/packages/ui` as the only home for a new one. **Before phase 7**, read it
  again with React Flow's default stylesheet open beside it.
- `docs/agent-panel.md` — **before phase 9**. The chat rail is that panel, not a
  new one.
- `apps/agent/node_modules/eve/docs` — **before phase 9**, and the installed
  version rather than memory (`AGENTS.md`). `tools/human-in-the-loop.md` for the
  approval-policy shape and the app-principal check, `subagents.mdx` for the
  built-in `agent` tool and the non-overlapping-write-scope rule,
  `concepts/sessions-runs-and-streaming.md` for the event names the canvas
  listens to, and `skills.mdx` before writing the marketing skill.
- `.agents/skills/react-flow` — **before phase 7**, for the `--xy-*` variable
  list at the installed version.
- `docs/tracking.md` — read before writing anything under `/api/m`. The
  collector already solved bot filtering, origin checks, atomic rate limiting and
  never storing an IP, and none of it should be solved twice.
- `.agents/skills/resend/references/domains.md` before Phase 1, and
  `webhooks.md` before Phase 4. **The rule for this whole feature is that
  Resend's answer beats ours**: if a thing we are about to build has an
  endpoint on their API — DNS records, verification status, open and click
  tracking, suppression — we read theirs instead.
- `.agents/skills/react-email`, `.agents/skills/resend`,
  `.agents/skills/email-best-practices`.
- **No code comments. No `Co-Authored-By`.**
