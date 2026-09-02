# Agent — `apps/agent`

An [eve](https://eve.dev/docs) app, its **own deployment**, owning every piece of
intelligence in this repo. Read with `api.md`, whose first rule is that none of this
may move into the API. Local dev, the bridge env vars and the manual dispatch command
are in `docs/setup.md`.

**Read the eve guide before writing eve code** —
`apps/agent/node_modules/eve/docs/README.md` matches the installed version;
`.agents/skills/eve` is the skill. Guessing typechecks, builds, then misbehaves.

## Model

Default `zai/glm-5.2-fast`; `DEFAULT_AGENT_MODEL` in `@crm/db/settings` because the
agent and the API both need it.

- **A row (`AppSetting`), not an env var**, via `defineDynamic` on `session.started`.
  Open conversations keep their model — prompt caches are per model.
- **`lib/model.ts` always sends `modelContextWindowTokens`**; eve never inherits it.
- **A failed read logs and keeps the compiled fallback.** Never throws.
- **The chooser offers only `tool-use` models** (`ModelCatalogService`).
- **Not a frontier model, deliberately** — refusing wrong answers is enforced by the
  tools and evidence model, not model strength.

## Pictures are copied, never linked

`mirror()` copies bytes to Vercel Blob; the record points at our copy. Lives in
**`@crm/db/blob`** — writers are `lib/brand-images.ts`, `lib/portrait.ts`,
`FaviconService`, `ImageMirrorService`, `prisma/seed.ts`.

- **The key hashes the bytes** — idempotent, and a redesigned mark gets a new URL.
- **`COMPANY_IMAGE_FIELDS` (`@crm/db/images`) is the one list of picture columns.**
- **Fetch through `@crm/db/safe-fetch`** — vendor URLs are SSRF vectors.
- **No `BLOB_READ_WRITE_TOKEN` means no photographs**; logos keep the origin URL.
- **`isOptimizable` (`@crm/db/images`) is the whole rule**: `next.config.ts`
  allow-lists only our Blob host (a wildcard makes us an open image proxy), and a
  mirrored **SVG is still refused**.
- **Faces are not optimized** — `AvatarImage` skips `<Image>` because Radix probes the
  URL itself, doubling fetches.
- **A photograph only comes from a source already tied to this person** —
  `lib/portrait-sources.ts`: their LinkedIn, their GitHub, their employer's team page,
  each keyed on an identifier already on the record.
- **There is no image search by name, and there must never be.** Nobody audits a face.
  **Guess where to look, never what you will find.**

## Two lanes

`schedules/dispatch.ts`, split by `DIRECT_KINDS` in `@crm/db/agent-tasks`.

| | Kinds | How | Per tick |
| --- | --- | --- | --- |
| **Visible** | `brand`, `portrait` | Directly — no `receive`, no model | 60, six at a time |
| **Research** | everything else | One eve session per row | 12 |

**Neither visible kind has anything to decide**, and through a session they queued
behind sixty LLM runs for 25 minutes (`test/lanes.integration.spec.ts`). **The row says
what the work is; the lane only says whether it needs a conversation.**

**Priority**: `brand` 900 · `portrait` 800 · `workspace` 500 · `requested` 300 ·
`meeting` 200 · `identify` 100 · `sweep` 50 · `companyProfile` 40 · `recheck` 0. The
top two are what a rep reads *before* deciding what to open.

**`claimDue` sorts what it claims** — Postgres does not order `UPDATE … RETURNING` by
its sub-select's `ORDER BY`.

### Dispatch on demand

`POST /internal/crm/dispatch` drains **both lanes**; `AgentTriggerService.poke()` calls
it after writing any `AgentTask`.

- **Fire-and-forget, never awaited** — the row is still the message.
- **Both lanes.** Visible-only made them diverge under `eve dev`, where there is no
  cron: logos resolved instantly while `identify` sat at `attempts = 0` forever.
- **Calls the channel's own `send`, not `receive`** — it is already on the crm channel.
  Principal from `APP_AUTH` (`lib/app-auth.ts`); `taskAuth()` keeps schedule and route
  from drifting.
- **`drainAll` collapses** via `collapsing()` (`lib/pool.ts`) — forty new contacts poke
  forty times, and `claimDue` hands each a disjoint batch. Per-process; cross-process
  overlap is leases and `FOR UPDATE SKIP LOCKED`.
- **An abandoned sweep is still in flight, and `dispatchHealth()` says so.** The
  timeout aborts the lanes, which stop between items, but the sweep only leaves
  `unsettledSweeps` when it truly settles. Until then health reports `running: true`
  and the endpoint answers `503`, and a new sweep is refused rather than stacked on
  top of stuck work.
- **A slow `start(task)` is reconciled, never failed.** Past
  `sweep.startTimeoutMs` the lane stops waiting, the record stays *Researching*, and
  the late session id is attached by `noteSession` when the send lands. Only a send
  that actually rejects settles the record `FAILED`; a send that never lands is
  retired by `retireExhausted` after `MAX_ATTEMPTS`. A session id that never
  reaches the row after `research.link.attempts` raises `unlinkedSessions` in
  health, so a task running under a session nobody recorded is visible.
- **`AGENT_BRIDGE_SECRET` unset refuses rather than opens.**

### `POST /internal/crm/verify-key`

Probes a candidate Context key → `valid`/`invalid`/`unknown`. No session, no model, no
task row; exists because the API may not call Context.

- **The probe is free and chosen to be** — a free-provider address gets a `422` before
  billable resolution. **Do not point it at a real domain**: ten credits per typo.
- **`classifyKey` rejects on `401` and nothing else.**
- **The candidate key, never the stored one.**

### Blank fields are filled on the dispatch tick

`sweepBlankFacts` (`lib/blank-facts.ts`) applies every pending suggestion whose field is
still empty and clears the ones that have stopped saying anything. It runs at the top of
`schedules/dispatch.ts`, every minute, over **every contact in the workspace** — it is a
database pass with no session, no model, no task row and no credits, so there is nothing
to ration and nobody to scope it to.

- **Scans 2000 suggestions and fills at most 500 a pass**, and reports what it did not
  reach (`unscanned`) rather than a clean sweep it did not make.
- **Idempotent** — a second pass fills nothing, because those fields are no longer blank.
- **The suggestions left are conflicts**, every one against a value already on the
  record. That number should stay small and reads as work for a rep.
- **It does not belong on sign-in, and that is not a preference.** It lived there for one
  release and never once ran. Two reasons, either fatal: `onSignedIn` fires on
  `session.create`, so a rep already signed in never triggers it; and `BackfillService`
  does its work in a detached `void (async () => …)()` after the response, on a Nest API
  that is a Vercel **serverless function** (`apps/api/api/index.ts`) — the tail of that
  chain is not guaranteed to run at all. A cron in the agent is the only trigger here
  that is a fact rather than a hope.

### Stale rows are closed on the dispatch tick

`reconcileStaleTasks` (`lib/stale-tasks.ts`) runs before `drainAll`, every minute. Like
the blank-field pass it is a database pass with no session, no model and no credits. It
closes rows that are provably done or provably dead, so the queue a rep reads is the
work that is actually happening.

- **It only looks at work that is due.** A `recheck` booked ninety days out is not
  stale, it is scheduled, and closing it would delete the next look at that contact.
- **A live lease is never touched.** That is work in flight, whatever the record says.
- **A record that completed after the task started closes the task** with a plain
  outcome. That is the row the settle path failed to close: research landed, facts were
  written, and the task sat open holding the contact on *Researching*.
- **A dead lease with attempts left goes back to waiting**, and the lease is cleared so
  the row reads as waiting rather than as running. Exhausted rows are retired by
  `retireExhausted`, which is the one rule for giving up.
- **Idempotent** — a second pass in the same minute closes nothing, because the rows it
  closed have a `finishedAt` and the rows it released have no lease.
- **Scans 200 rows a pass** and reports `unscanned` rather than a clean sweep it did not
  make. The counts are in `dispatchHealth().staleTasks`, so a growing number of stale
  rows is visible at `GET /internal/crm/dispatch-health`.

**It is a safety net, not the fix.** The settle path still fails to close some rows;
this pass keeps that from reaching a rep, and the count it reports is how you see the
underlying bug getting worse.

### Backfills

Sign-in sweep covers records never looked up (10 credits/company);
`ImageMirrorService` in the same sweep re-hosts off-site pictures (free);
`backfill:images` fixes enriched records missing only pictures (free);
`backfill:facts` is the blank-field sweep above run by hand, with `--dry` to read it
first — the cron covers it, so this is for a machine pointed at another database.

- **The image sweep keeps "every picture is ours" true**, not true-since-Tuesday.
  25 rows/table/sweep.
- **Nobody clicks a suggestion into a blank field.** The rule is enforced at the write
  path, so no queue forms; the sweep is for rows written before it existed and for the
  field a rep clears while a suggestion is pending. **An unreachable agent leaves the
  suggestions where they are** — the API cannot apply one itself.
- **A finished `portrait` task stands that contact down for thirty days** — that third
  source costs credits and usually finds nothing.
- **No button, deliberately** — a rep cannot know which records predate a resolver.
- **The trigger is signing in**, via `databaseHooks.session.create.after` in
  `packages/auth`; `BackfillService` subscribes with `onSignedIn` and has no router
  (`@crm/auth` must not import a Nest provider). Five-minute stand-down, and `auto()`
  returns before work starts.
- **The 500-row cap is on the pass, not each query in it.** Deduplicate the union, cut
  to 500, count `remaining` against the union.

## Evidence, not confidence

**No tool accepts a confidence, a score, or a `sourceUrl` offered as proof.** Tools
report what they *observed* (`crm.signature-block`, `github.account-identity`) and
`lib/evidence.ts` prices it. A model asked to grade its own certainty will, and will be
wrong in the direction that looks useful.

- **`lib/facts.ts` is the only write path to a contact's fields.** Applies at
  `VERIFIED`, proposes below it, and enforces three things a prompt cannot: never
  overwrite a human, never re-offer a dismissal, never write without a primary source.
- **A band decides only when there is something to lose.** An empty field is filled by
  whatever cleared the floor for keeping, whatever the band — approving a sourced guess
  into a blank is a click that can only say yes, and a rep with four hundred contacts
  reads none of them. `fillsBlank` is the whole rule: no human value in the way and
  nothing already found. **`PROBABLE` still means *a rep decides* when the field is
  already filled**, which is the case where a wrong answer costs something. The dispatch
  tick applies the same rule to rows that predate it — `sweepBlankFacts`, above.
- **Applying settles the field's other suggestions.** They were all offers to fill the
  same blank, and the sheet shows one at a time — so left alone, accepting one reveals
  the next, forever. The same rule holds when a rep accepts one (`decideFact`).
- **The same value is never offered twice.** A second `PROPOSED` row with a value
  already waiting is refused at the write path, not deduplicated on read.
- **"The same value" is `sameValue`, and a URL is compared as an address, not a
  string.** `canonicalValue` lowercases, collapses whitespace, and for `http(s)` drops
  the scheme, `www.`, a trailing slash and the query, and reads `twitter.com` as
  `x.com`. Compared byte for byte, `…/in/pogrebs/` is not `…/in/pogrebs`, so the record
  showed a suggestion offering back the URL already in the field — the exact click this
  whole rule exists to remove. **The stored value is still what the source said**; only
  the comparison normalises. **The refusal
  is for offers only** — the check runs after `applies` is decided, so evidence that has
  reached `VERIFIED` since the offer was made still lands, settles the suggestion it
  matches, and replaces the older value. Refusing it there left a weaker value on the
  record with the answer sitting unread beneath it.
- **A new fact field goes in `FIELDS` (`lib/facts.ts`) *and* `FACT_COLUMNS`**
  (`apps/api/src/contacts/contacts.service.ts`).

## Optional by default

`lib/capabilities.ts` is the single place that knows what is set: prints it at boot,
states it in the session instructions, and gives tools a shared "not configured,
retrying will not help" result — **checked before the research budget is charged**. A
missing key removes a place to look. **Never an error, never throws.**

**`capabilities()` is async** because the Context key is a row;
`capabilitiesFrom()`/`markdownFor()` are the pure halves. `contextDevKey()` is the only
resolver, and `lib/context-dev.ts` memoises its client on the key string.

## Budget and scheduling

- `lib/focus.ts` — per-session budget in `defineState`; running out is a normal ending.
  **A unit is one metered vendor call, not one credit.** `spend(2)` is what a
  billable lookup costs: a brand lookup is 10 Context credits, a person enrich is
  20. Both charge 2, because the budget rations calls per contact and a session
  with a budget of 4 must still be able to make two of them.
- `lib/tasks.ts` — `claimDue` leases with `FOR UPDATE SKIP LOCKED`.
- **`schedules/dispatch.ts` is the only schedule and decides nothing.** "Every N
  minutes, the oldest ten contacts" belongs in a `dueAt`.
- `tools/schedule_recheck.ts` — its `reason` is shown to the rep.

## Three records, no dead ends

**Every read hands back the ids of neighbouring records.** Breaking this made the agent
ask a rep who had a company open, contacts on screen, to paste an email.

| Read (all free) | Hands back |
| --- | --- |
| `read_crm_history` | the contact's **company id**, their deals, their colleagues |
| `read_company_history` | **every contact with id**, deals, threads, meetings, notes |
| `read_deal_history` | stage clock and history, **people with ids**, last reply |
| `search_crm` | contacts, companies and deals matching typed text |

**A preamble or tool result naming a record without its id is a bug** — the only
recovery is asking the human. Ambiguity is fine: four Marchettis is four rows with
titles. **`search_crm` does no fuzzy matching** — "Marchetti" reaching "Marchetta" is a
wrong record about a real person.

### Preambles

`lib/preamble.ts` varies on **which record** (each names its neighbours with ids and
points at the read to start from) and **who opened it** — a dispatched task is a
research pass with a budget, a rep in the sheet is a conversation. Told neither, the
agent answered a question with a work plan. `taskKind` is the tell.

`task.ts` is the resolver and owns one side effect: seeding `lib/focus.ts`, without
which the audit hook files events against nothing.

**A fourth record kind** = `sessionPreamble` entry + a read + a `TOOL_VERBS` line
(`apps/app/lib/agent-transcript.ts`) + a `COPY` entry (`lib/agent-record.ts`).

### Every session knows who *we* are

`composeClosing()` puts a **Who we are** block before the capabilities in every
preamble; `lib/workspace.ts` is the only renderer.

- **Tiny, enforced by the write path** — `MAX_NARRATIVE` (320) and `MAX_LINE` in
  `@crm/db/workspace`. It is prompt-cached and precedes every question.
- **It says what the context is for** — fit, competitor, partner, or nothing — and
  **never a pitch**, or the model sells our own product back to us.
- **No profile still gets the name line**, plus *do not guess at what we sell*.
- **The profile dies with its website** — `readWorkspaceIdentity` returns it only while
  `website` matches.
- **Not a `Company` row** — that needs excluding from every list, facet and join. One
  `WorkspaceProfile` keyed on `WORKSPACE_ID`.

The pass is a `workspace-profile` task using `web_fetch` (no credits), filed only via
`write_workspace_profile`, queued by `WorkspaceService.update` on a website change. **A
finished attempt stands the sweep down for seven days.**

## What may be read, and what may leave

It may read **everything**, including full email bodies — internal single-tenant tool,
and a signature block is the best source of a job title there is. The boundary is
egress:

1. No customer text in a third-party query. Derived questions only.
2. Nothing from a mailbox into `/workspace` — different lifetime.
3. Nothing sensitive logged. Reading is not logging.

`skills/data-boundaries.md` is the agent's copy. Keep them in step.

## Sandbox

`agent/sandbox/sandbox.ts`: `bash`, file tools, `/workspace`, **`deny-all` egress on
the backend factory** so it cannot be forgotten per session. Costs nothing —
`web_fetch` runs in the app runtime, `web_search` at the provider.

**Never give the sandbox `DATABASE_URL`.** CRM access is authored tools. A shell with
credentials and network is exfiltration-shaped; with neither it is a text processor.

## Team-agent builder and runner

`agent_builder` and `agent_runner` are declared subagents with independent
instructions, tools and deny-all sandboxes. They inherit nothing from the root. The
root built-in `agent` copy tool is disabled; these two named specialists are the only
delegation paths for custom agents.

- **Creation requires the current `CREATE_AGENT` turn.** Every builder tool checks the
  purpose and command type in session auth. A normal builder chat cannot create a
  draft by prompt alone.
- **Builder clarification is durable HITL.** The specialist calls eve's built-in
  `ask_question` directly; descendant input requests are proxied to the root channel,
  and the same child turn resumes when the user answers. The authored
  `tools/ask_question.ts` disable override must stay absent. Builder task output is
  typed as `draft_ready` and carries the immutable version ids only after save.
- **Empty never means all.** A version chooses `SELECTED` or `WORKSPACE` record scope.
  Selected scope requires at least one record tagged in that private conversation;
  workspace scope is an explicit grant and cannot also list selected records.
- **Connections are executable permissions.** Only `google:gmail` and
  `google:calendar` are accepted, only when connected, and the runner does not query
  their synced tables unless the deployed manifest includes that source.
- **Actions are structured permissions.** `crm.activity.create` separately names
  `NOTE`, `TASK`, or both. Runtime enforcement never infers a grant from the action's
  prose summary. Every action is ledgered before execution and keyed by eve's call id
  for replay safety.
- **CRM events are shared domain contracts.** `@crm/db/crm-events` owns the event
  vocabulary, record kind, and builder-facing description used by the API, builder,
  and worker. API writes enqueue a durable `agent-event` task; the agent worker alone
  matches live triggers and creates runs. Do not duplicate event lists in prompts or
  feature code.
- **Versions can have multiple triggers.** The manifest stores a `triggers` array and
  each entry becomes its own `AgentTrigger` row. Deployment enables every trigger on
  the approved version, so one agent can react to several independent lifecycle
  moments without polling or duplicate agents.
- **Deployment is the human approval boundary.** Saving produces a private READY
  version and never deploys it. The review screen shows its triggers, scope, actions,
  access and exact files. A user's Deploy action pins that immutable version for the
  team. Scheduled runner sessions use task mode and therefore cannot pause for a
  per-action approval; the deployed permission and idempotent runtime checks are the
  boundary.
- **Approved instructions are system context.** The runner resolves the pinned
  version instructions at `session.started`, then calls `inspect_run` for the manifest
  and current run state. Every runner tool also checks the `team-agent` purpose and
  revalidates scope and action permission.
- **Stopping a run is a row, not a signal.** `agents.cancelRun` settles the
  `AgentRun` to `CANCELLED` inside one transaction — terminal event, outstanding
  `AgentAction` rows, audit entry — and *then* pokes
  `POST /internal/crm/cancel-run`, which calls eve's `cancel({ continuationToken })`
  for `run:<id>`. **The row is what stops the work**: every run tool refuses a run
  that is not `RUNNING`, so a cancel that never reaches the agent still means
  nothing further is written. The poke only stops it spending tokens, and an unset
  `AGENT_BRIDGE_SECRET` costs exactly that and nothing more.
- **Cancelling is not undoing.** eve keeps side effects that already completed, so
  a note, task or Slack message the run already made stays. The dialog says so.
- **Whoever started it can stop it**, plus the creator and workspace admins.
  `canCancel` is computed server-side per run and is what the button reads, so the
  control and the 403 cannot disagree.
- **`turn.cancelled` settles the run too**, keyed off `run:` in the continuation
  token, so a cancel from any other path still reaches `finishedAt` rather than
  leaving the run reading *Running* forever.
- **No generic execution surface.** Both specialists disable shell, file, arbitrary
  web and todo built-ins. The runner also disables direct questions; the builder keeps
  only `ask_question` for durable clarification. CRM access exists only through their
  small authored tool sets. Tool code runs in the trusted app runtime; the sandbox
  remains isolated and deny-all.

Runner manifests fail closed when either the explicit record-scope mode or an
activity type grant is missing. Versions created before these typed permissions were
introduced must be revised and deployed again before they can run.

`bun run --filter=agent eval` runs the eve end-to-end builder eval against the real
HTTP channel. It creates an isolated private conversation, dispatches the builder,
asserts the declared subagent path, verifies a READY side-effect-free manifest, and
cleans up its rows. It skips visibly when the database, bridge secret or model
credential is unavailable.

## The bridge

```
browser → /eve/v1/*  (same origin, session cookie, x-crm-contact header)
        → apps/app/app/eve/v1/[...path]/route.ts
            checks the Better Auth session, strips the cookie,
            mints a 2-minute HS256 token naming the rep + record
        → AGENT_URL/eve/v1/* → channels/eve.ts repFromCrm()
                             → instructions/task.ts reads attributes.contactId
```

- **The record travels in the token, never in the message.**
- **Mounted at `/eve/v1/*`** because that is where `useEveAgent()` looks — no `host`,
  no CORS, no cross-site cookie.
- **The proxy is an enforcement point, not a passthrough** — the agent never sees the
  session cookie, so if that route did not check, nothing would.
- **eve's `jwtHmac()` resolves to `principalType: "service"`** — wrong for a person,
  and `lib/approval.ts` reads exactly those fields to decide whether to pause for a
  human. `repFromCrm` maps the subject to a real user principal
  (`test/channel-auth.spec.ts`).
- **`AGENT_BRIDGE_SECRET` unset skips the auth entry rather than opening it.**

### The panel

`lib/agent-record.ts` maps a record kind to everything downstream. The panel's own
rules — snapshot loading, composer state, thread capture, scrolling — are in
**`docs/agent-panel.md`**. It lives in the API and is not a breach of rule one:
listing history decides nothing.

## Continuation tokens are namespaced

**eve prefixes them with the channel name.** `channels/crm.ts` mints `task:<id>`;
`session.waiting` returns `crm:task:<id>`. Minting the prefix ourselves meant matching
against `crm:crm:task:<id>` and returning before `completeTask` — research ran, facts
were written, sessions looked clean, but **no task reached `finishedAt`**, so contacts
sat on "Researching" forever. Hidden because the archived event's
`data.continuationToken` is *un-namespaced* while `channel.continuationToken` is not.

### Conversations are kept

A record accumulates conversations, and they survive a reload. `AgentConversation`
holds the *handle* — the durable eve session id plus its cursor — while the
transcript itself is already in `AgentEvent`, written by the audit hook. Nothing
is stored twice.

- **Resuming.** The panel passes the saved cursor as `initialSession`, so
  reopening a contact continues last week's thread rather than starting another.
  eve keeps sessions for 30 days.
- **Replay from the start.** `streamIndex: 0` on resume, deliberately — the
  saved index is where the *last reader* stopped, and a reopened thread should
  show what was said in it, not only what has happened since.
- **Which thread is open lives in the URL** (`?thread=`), like every other view
  state in the sheet, so a refresh keeps your place and a conversation is a link.
  It is cleared when the record or the tab changes, by the same rule that drops
  a half-typed quick-add form.
- **Nothing mounts until the list has loaded.** Rendering a thread while the
  history is still in flight starts a *new* eve session and then remounts onto
  the real one — which presents as "the history only appears if I refresh".
- **The thread the panel landed on is captured once.** Re-deriving "the latest"
  as the list changes would swap the open conversation out from under a live
  answer the moment the first save adds a row. `resolveThread` in
  `lib/agent-transcript.ts` holds the rule, and it is tested.
- **The panel is not unmounted when you switch tabs.** It holds a live stream,
  and Radix drops an inactive tab by default — which aborts the stream
  mid-answer, so the reply landed in the durable session with nothing attached
  to receive it. That is the "I went to another tab and the answer never came
  back" bug, and no amount of re-reading state on the way in could fix it,
  because the events had been dropped. `keepMounted` on the tab descriptor
  (`detail-sheet.tsx`) keeps it alive; it renders nothing until the tab is
  opened once, so flicking through records costs nothing.
- **A thread is loaded with `session.snapshot()`, not by hand.** One call
  returns the complete event prefix, the cursor that continues from it, and a
  continuation token *if and only if* eve will accept another turn — about 30ms
  against a hundred-event thread. `lib/agent-session.ts` is the whole of it.

  What it replaced is worth remembering, because every panel bug of the last
  day came out of it: a raw `fetch` of `…/stream?startIndex=-1`, parsing the
  last line into a state machine. The endpoint *follows*, so awaiting the body
  never returned. The stream opens with a bare newline, so "the first line" was
  empty — which failed closed to "busy" and locked **every** reopened
  conversation with "still working on the last question", including ones parked
  with a perfectly good token. And a read that failed reported the *session* as
  working rather than reporting itself as broken, so it could never recover.
  The framework had a documented answer to the exact question that code was
  asking. Read the guide before hand-rolling the protocol.
- **The token is the authority on whether a message can be sent**, not our
  reading of the events. eve returns one only when the captured prefix ends
  parked, which is precisely the condition under which the next send lands.
- **A turn that has gone quiet for 90 seconds is over, not working.** A
  restarted agent leaves sessions with no closing boundary; they never park, and
  treating them as in-flight locks that thread forever.
- **An unreachable agent is `offline`, not `working`.** One is a fact about us
  and the other a claim about the session; stated as the latter it is both
  untrue and unrecoverable, since the read fails identically next time. The
  transcript then comes from our own `AgentEvent` archive — which is also what
  makes a thread older than eve's 30-day retention still readable — and the
  composer stays usable.
- **An ended thread gets a button, not a locked box.** Ended and working both
  disable the composer and mean completely different things: one is a wait of
  seconds, the other is permanent. `composerState()` keeps them apart, and an
  ended thread offers **Start a new conversation**, which moves the picker to a
  new thread. The transcript stays on screen throughout, and the save hook
  treats the fresh session as a new conversation by comparing session ids
  rather than by whether the panel started empty.
- **`autoScroll` and nothing else.** The scroller is a state machine
  (`following-bottom`, `free-scrolling`, `anchored-to-message`) and
  `scrollAnchor` selects the third, which *stops it following the bottom* — the
  answer then streams below the fold while the modes fight over each new row.
  Left alone, `autoScroll` follows the tail while the reader is at the bottom
  and releases the moment they scroll away, which lights the jump-to-end button.
- **One `MessageScrollerItem` per message, not per part.** The row is what the
  scroller measures; a row per tool call adds a boundary every few hundred
  milliseconds during an answer. Part ids prefer `toolCallId`, which is stable
  across a call's streaming states.
- **A thread nobody has spoken in is loaded from nothing.** The snapshot query
  is disabled without a conversation; a brand-new thread mounts with no session
  and no events, and its first message creates both.
- **Scoped to the rep.** Two people asking about the same contact are having two
  conversations. `ConversationsService` filters on the caller, and a session id
  in a request body decides which row, never whose.
- **Cached the way `api.md` prescribes**: read through
  `cache-manager` (Redis when `REDIS_URL` is set), write on miss, explicit
  invalidation on every save. The list is read on every sheet open and changes
  only when somebody sends a message, which is the shape a cache is for.

This lives in the API rather than the agent, and that is not a breach of rule
one: listing a record's history researches nothing, scores nothing and decides
nothing. The agent owns judgement; the data surface owns filing.

### Turning it on

Same value in both processes, from the one root `.env`:

```sh
AGENT_URL="http://127.0.0.1:2000"        # the default
AGENT_BRIDGE_SECRET="$(openssl rand -base64 32)"
```

Then `bun run dev` (the agent serves on `:2000`) and open any contact.

**If the Agent tab errors:**

| Symptom | Cause |
| --- | --- |
| `503`, "not configured for this install" | `AGENT_BRIDGE_SECRET` is unset in the app's process |
| `401` | The two processes hold *different* secrets |
| `502`, "not reachable" | The agent is not running, or `AGENT_URL` is wrong |

`eve dev` takes about five seconds to bind, and it listens on **IPv4 only**.
That is why `AGENT_URL` defaults to `http://127.0.0.1:2000` rather than
`http://localhost:2000`: Node resolves `localhost` to `::1` first, so the
`localhost` form fails to connect on a machine where the agent is plainly
running — and reports itself as "not reachable", which sends you looking in the
wrong place.

A variable in `.env` is not enough on its own: Turbo runs in strict env mode, so
`apps/app/turbo.json` and `apps/agent/turbo.json` both declare the pair in
`passThroughEnv`. Adding a variable and not declaring it produces exactly the
`401` above.

### Checking it without a browser

`localDev()` accepts anything on loopback, so a bare `curl` to `127.0.0.1`
proves nothing about the bridge. Send a non-loopback `Host` to make that entry
skip:

```sh
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'Host: agent.example.com' \
  http://127.0.0.1:2000/eve/v1/info                      # 401

curl -s -H 'Host: agent.example.com' \
  -H "authorization: Bearer $TOKEN" \
  http://127.0.0.1:2000/eve/v1/info | jq '.tools.available | length'
```

`GET /eve/v1/info` is the whole inventory — tools, skills, schedules, channels,
sandbox, and a `diagnostics` count that is the fastest way to find a file eve
silently ignored.

## Watching it work

`eve dev` shows every tool call, every result and every token in its interactive
TUI, and it is the agent package's default `dev` command. The package's Turbo
task is explicitly interactive, so select the agent pane and press Enter to hand
stdin to eve. Type `/traces` to open the live trace viewer; Ctrl+Z returns input
to Turbo.

`dev:headless` keeps `eve dev --no-ui` available when a terminal cannot render
the nested TUI. It starts the same server on the same port with the same routes
and watcher. In that mode `hooks/activity.ts` narrates the session instead: a
line per tool call with its arguments, a line per result with how long it took,
the finish reason and token spend of each step, and any failure with its code.

- **The lines go to stderr, not stdout.** The TUI's default log mode is `stderr`
  and it keeps stdout buffered and hidden, so a `console.log` here would be
  invisible in the mode it exists to serve. Written to stderr the same lines show
  under `--no-ui`, under the TUI, and in `eve logs`.
- **Contents print outside production; the shape prints everywhere.** Which tool
  ran, whether it worked, what it cost — none of that is anybody's data, so it
  logs wherever the agent runs. Arguments and replies carry names, addresses and
  whatever a rep typed, which is the "nothing sensitive logged" rule above, so
  they are gated on `NODE_ENV`. In production the durable record is an
  `AgentEvent` row, not a log drain.
- **It is not the audit trail.** `hooks/audit.ts` writes every event to
  `AgentEvent` whatever this prints, and the panel's transcript is read back from
  there. A change to one is not a change to the other.
- **A call is timed by remembering it, because the result event does not carry
  the tool name or a duration.** The map of in-flight calls is bounded rather
  than trusted: a turn that dies between request and result would otherwise leak
  an entry per call, forever, in a process that stays up for days.

`eve logs` reads the full record back, but only for an **interactive** `eve dev`
— that is the process that writes `.eve/logs/`. Under `--no-ui` the pane is the
record, so keep the turbo scrollback rather than going looking for a file that
was never written.

Two consequences of opting into `dev:headless`, both worth recognising rather
than debugging:

- **A headless dev process cannot reconnect.** An interactive `eve dev`
  reconnects to a local server that is already up; `dev:headless` rejects it and
  exits non-zero. `A dev server is already running for this eve agent` means
  exactly what it says: use the terminal it is in, or stop it before starting
  another.
- **An orphaned agent holds the port.** If turbo dies without reaping its child,
  nothing on screen says so and every later `dev:headless` fails the same way.
  `lsof -nP -iTCP:2000 -sTCP:LISTEN` names the process to kill.

### Nothing is researching, and the queue only grows

**`eve dev` never fires schedules on their cron cadence.** It is one line in
eve's own [schedules guide](../apps/agent/node_modules/eve/docs/schedules.mdx),
and it used to be the single most confusing thing about working on this agent,
because every visible part of the loop worked: the Research button wrote its
`AgentTask` row, the sheet said *Queued*, the toast promised the page would
update — and `schedules/dispatch.ts`, the only thing that turns a row into a
session, was never called. Twenty rows sat with `attempts = 0` and `AgentEvent`
was empty. Nothing was broken and nothing reported a problem, because nothing
ran.

**The poke is what makes dev behave like production now**, which is most of why
it was widened to both lanes — see [dispatch on demand](#dispatch-on-demand).
A row written by the API is dispatched immediately whatever the clock is doing,
so the schedule is a backstop rather than the only door.

**It only does that when `AGENT_BRIDGE_SECRET` is set**, and that variable is
optional: `poke()` reads it first and returns without sending anything when it is
unset. So an install that has not set it is back at the paragraph above with no
cron behind it either — rows queue, nothing dispatches, and the queue looks
exactly like a slow agent. Set it, or run the dispatch below by hand.

That leaves two cases where the clock's absence bites even with the poke
working, and both look identical to the above: **a task the API did not
write** — `schedule_recheck`,
which books its own `dueAt` weeks out — and **anything queued while the agent was
down**, since a missed poke is not retried. For those, the dev server mounts a
one-shot route that runs the exact dispatch path production cron uses:

```sh
bun run --filter=agent dispatch
# {"scheduleId":"dispatch","sessionIds":["wrun_01KZ…", …]}
```

It drains **both lanes**, exactly as the cron does: up to `VISIBLE_BATCH` (60)
`brand` and `portrait` rows six at a time, handled in the process with no session
at all, and `RESEARCH_BATCH` (12) research rows, one session each. So the
`sessionIds` it prints are the research rows only — a run that resolved forty
logos prints an empty list and was not idle. Either way it spends real credits, a
vendor call per visible row and a model session per research one; that is the
point of it, and the reason it is a command you run rather than a ticker somebody
leaves on. Watch the agent pane; the session ids it returns are also streamable at
`GET /eve/v1/session/:id/stream`.

`eve start` on a built app *does* run the schedule, and so does Vercel, where
each `defineSchedule` becomes a Cron Job. Dev is the only place the clock is
missing.

### The continuation token you write is not the one you read

**eve namespaces a continuation token with the channel's name.** `channels/crm.ts`
mints `task:<id>`; by the time `session.waiting` hands it back on the channel
context it is `crm:task:<id>`. The `eve` channel's own sessions read back as
`eve:<uuid>` for the same reason.

This is worth stating because of how it failed, which was silently and
completely. `taskToken()` used to mint `crm:task:<id>` itself, so the handler was
matching `startsWith("crm:task:")` against `crm:crm:task:<id>`, getting `null`,
and returning before `completeTask`. Nothing errored. The research ran, facts
were written, briefs were saved, and the agent pane showed a clean session — but
**no task ever reached `finishedAt`**, so every contact sat on "Researching"
forever and the sweep re-queued work that had already been done. Twenty-eight
tasks, zero finished.

Two things made it survive a reading:

- **The event data and the channel accessor disagree.** `session.waiting`'s
  `data.continuationToken` carries the token *as stored* — un-namespaced — while
  `channel.continuationToken` carries it namespaced. Debugging from the archived
  event says the token is fine, because from that angle it is.
- **Nothing downstream depends on settling.** The record's status is the only
  thing that notices, and "still researching" is indistinguishable from
  "researching slowly" until you look at `attempts` in the table.

So `taskFromToken` keys on the `task:` marker rather than a fixed prefix, which
reads correctly whoever namespaced it and still settles sessions parked before
the fix. `test/crm-token.spec.ts` pins all three forms.

The general rule: **a channel handler must not assume the token it receives is
byte-identical to the one it sent.** Parse for your own marker.

## Tests

`bun run --filter=agent test`. The integration specs need `DATABASE_URL` and run
against a real Postgres, which is the point — "never overwrite a human" is only
true if the transaction says so.

The `test/e2e` scripts are separate and you run them by hand. Three of them cost
money or change something outside the database, so each one is off unless you
switch it on:

| Variable | What it does |
| --- | --- |
| `E2E_LIVE_MODEL=1` | `live-run.e2e.ts` calls the real model. It spends credits. |
| `E2E_SLACK_JOIN=1` | `slack-join.e2e.ts` joins real Slack channels. It does not leave them. |
| `E2E_SLACK_CREATE=1` | `slack-channel-create.e2e.ts` creates a real channel named `e2e-create-<ms>`. Slack cannot delete a channel, so archive it by hand. Add `E2E_SLACK_CREATE_PRIVATE=1` to make it private, which needs the workspace user token. |
| `E2E_LOAD_COUNT` | How many tasks `load.e2e.ts` queues. The default is 300. |

Stop the local agent before you run an e2e script against a dev database. A
running agent leases the rows the script seeds and retires exhausted tasks the
script did not create.
**`taskFromToken` keys on the `task:` marker, not a fixed prefix**
(`test/crm-token.spec.ts`). **A channel handler must not assume the token it receives
is byte-identical to the one it sent.**
