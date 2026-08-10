# CMP-73: Agent runtime, builder chat, and Slack hardening

Date: 2026-08-10

Status: Implemented and verified locally

Audience: A junior developer taking over this area

## What changed in one minute

The agent builder now owns its questions and transcript in the database, so a refresh does not erase the state needed to continue. Normal follow-up chat no longer reopens the builder just because `/create agent` appeared earlier in the conversation.

CRM changes now create durable event work in the same database transaction as the record change. Matching agents receive real-time runs without polling. An agent version can listen to several events.

Declared external actions must actually execute before a run can succeed. Slack messages now go through a real executor with idempotency, cancellation checks, delivery receipts, and actionable failures.

Slack is one organization-wide connection for this single-workspace CRM. OAuth redirects to the app URL, inventory refreshes on demand, people match by exact email, and the UI only shows real data.

The shortest system view is:

```text
CRM transaction
  -> save record + durable AgentTask
  -> agent dispatcher
  -> matching AgentRun
  -> Eve agent runner
  -> declared action executor
  -> Slack delivery receipt
```

The builder question flow is:

```text
builder asks
  -> question saved on AgentConversation
  -> API returns the durable question
  -> UI can reload and show the same card
  -> answer is validated and submitted once
  -> question is cleared
```

## 1. Immediate chat feedback

### Problem

After sending a message, the text disappeared until the server caught up. The interface looked frozen, and users could submit again because there was no obvious progress.

### Cause -> effect

The UI rendered only server-confirmed submissions. Network and agent latency therefore created a blank period between clicking Send and seeing a response.

### Solution -> effect

`apps/app/components/agent-builder/agent-builder-chat.tsx` now renders the pending user message immediately and shows the shared thinking indicator. Pending UI state is cleared in the mutation's completion path, outside React render.

The user sees their message and an active response state immediately. Moving cleanup out of render also prevents render-time state updates and extra render loops.

### Drawbacks and pending work

- This is optimistic UI. A failed request still has to replace the temporary state with the real error.
- The full browser interaction was not covered by an end-to-end browser test. Component logic and app tests pass.

## 2. Refresh-safe builder questions

### Problem

A follow-up question could appear in the live stream, disappear after refresh, or reject a selected answer with `The agent is no longer waiting for that answer.`

### Cause -> effect

The question was emitted inside a child Eve session, while persistence and answer validation were scoped to the root conversation session. Recent child questions did not emit the old `input.requested` event. The live stream could render a question that the server had never saved.

### Solution -> effect

`apps/agent/agent/channels/crm.ts`, `apps/agent/agent/lib/builder-runtime.ts`, and `apps/api/src/conversations/conversations.service.ts` now save the active request in `AgentConversation.pendingInputRequest` at the point where the builder actually asks it.

The API exposes only that durable question. Answers must match its request ID, and answering or ending the turn clears it. A refresh can reconstruct the same answerable card from the database.

The old stream-only fallback was removed. If persistence fails, the UI hides the question instead of displaying a card that can never submit.

### Drawbacks and pending work

- The UI refresh interval can add roughly 2.5 seconds before a newly persisted question appears.
- This depends on Eve's current child-tool and input request shape. An Eve upgrade needs a regression test against the installed version.
- Hiding an unpersisted question is safer than offering a broken answer, but the user may only see general progress if persistence itself fails.

## 3. Complete conversation transcripts

### Problem

Reloading a builder conversation returned only a small fraction of its events. Progress and questions looked random because most activity lived in child sessions.

### Cause -> effect

`events()` filtered by the root session ID. The builder does most of its work in descendant sessions, so those events vanished whenever the live stream was no longer attached.

### Solution -> effect

`AgentEvent` now has a `conversationId`. New root and child events are attached to the owning conversation when they are ingested. Conversation reads use that ownership field, so one reload returns the whole recorded builder history.

Sharing logic was updated to preserve conversation ownership without leaking events to a different conversation.

### Drawbacks and pending work

- Historical child events created before this migration were not comprehensively backfilled. Some old conversations can remain incomplete.
- Events that cannot be associated with a conversation still rely on their session-level use cases.

## 4. Builder UI appears only for builder work

### Problem

Once a conversation had ever used `/create agent`, later ordinary messages could summon the full `Building the agent` interface again. Follow-up clarification felt blocked by an unrelated creation flow.

### Cause -> effect

The UI searched the entire submission history for a create command. One old command made `creatingAgent` permanently true.

### Solution -> effect

`apps/app/lib/agent-builder-state.ts` and the chat component now derive builder progress from the current active `agent_builder` tool call. Command routing sends normal follow-ups through CHAT unless the current request explicitly creates or revises an agent.

Ordinary messages remain ordinary chat. Builder chrome appears because the builder tool is active, not because an old slash command exists somewhere in history.

### Drawbacks and pending work

- This follows Eve's current tool-call event representation. Tool event schema changes require updating the state helper and its tests.
- A user still needs to state an explicit create or revise intention when they want to re-enter builder mode.

## 5. One central CRM event catalog

### Problem

Event names originally lived as two niche constants near one implementation. That made new event surfaces easy to forget and allowed the builder, API, and dispatcher to disagree.

### Cause -> effect

There was no shared domain catalog. Each layer could invent or omit event strings independently.

### Solution -> effect

`packages/db/src/crm-events.ts` is now the shared event boundary. It defines and validates:

- `company.created`
- `contact.created`
- `deal.created`
- `deal.stage.changed`
- `deal.opened`
- `deal.closed`

The API emitter, builder schema, manifest parser, and runtime matcher consume the same definitions. Adding an event now has one obvious type-level starting point.

### Drawbacks and pending work

- This catalog is intentionally small. Update, delete, owner, amount, activity, email, and calendar events are not implemented.
- Direct database writes and seed scripts bypass API service emitters.
- A deal created in a closed stage emits both `deal.created` and `deal.closed`. A later closing transition emits `deal.stage.changed` and `deal.closed`. Subscribing to both means two runs by design.

## 6. Real-time CRM event delivery

### Problem

The builder offered scheduled polling for requests such as “notify me when a deal is created,” even though the schema already mentioned event triggers.

### Cause -> effect

The draft schema allowed only manual and schedule triggers, and CRM write services emitted no durable work. `EVENT` existed as a database enum without a runtime path.

### Solution -> effect

Company, contact, and deal writes now create a typed event record and an `AgentTask(kind = agent-event)` in the same database transaction as the CRM change. The agent process matches enabled event triggers and idempotently creates `AgentRun` rows.

The record cannot commit while silently losing its event work. Agents react through the existing durable dispatcher instead of polling.

### Drawbacks and pending work

- Dispatch is durable but not instantaneous to the millisecond; it waits for the agent dispatch loop.
- `WEBHOOK` remains in the database enum but has no implemented intake or runtime.
- The public intake API does not exist. The UI now says it is unavailable instead of displaying a fake endpoint.

## 7. Multiple triggers on one agent version

### Problem

The builder told users to create a second agent when one behavior needed several events.

### Cause -> effect

The database already supported many `AgentTrigger` rows, but the draft and manifest accepted only one `trigger` object. A schema limitation leaked into the product as a false rule.

### Solution -> effect

Drafts and manifests now accept one to ten triggers. Persistence writes every trigger for the version, and the migration converts existing singular manifests to the plural shape.

One agent can now react to created, opened, stage-changed, and closed events without duplicating its instructions and actions.

### Drawbacks and pending work

- Duplicate event triggers and duplicate manual triggers are rejected.
- Schedules still need valid independent definitions; this change does not add calendar-style event composition.

## 8. Run lifecycle, serialization, recovery, and cancellation

### Problem

Concurrent dispatches could overlap for one agent, terminal events could race, and cancellation could be accepted after an external action had started.

### Cause -> effect

Run ownership and lifecycle decisions were spread across dispatch and event handlers. No single claim guarded one active turn per agent, and terminal updates were not consistently first-writer-wins.

### Solution -> effect

The runtime now:

- claims one active run per agent and leaves later work queued;
- uses delivery leases before handing work to Eve;
- records the root Eve session without letting nested sessions replace it;
- ingests replayed events and usage idempotently;
- lets the first terminal state win;
- restores builder continuations after an expired pre-delivery lease;
- exposes cancellation through the API and agent detail UI;
- checks cancellation again immediately before Slack's `chat.postMessage` call.

These changes prevent duplicate turns, duplicate terminal logs, and most cancellation-versus-delivery races.

### Drawbacks and pending work

- If a run was delivered to a real Eve session and that session disappears without a terminal event, the run can remain `RUNNING`. Recovery intentionally requeues only stale runs with no session ID, so it does not kill legitimate long-running work.
- Cancellation cannot retract a provider request Slack has already accepted or that is already in flight.
- Cancellation is cooperative at guarded boundaries, not a distributed transaction with Slack.

## 9. Declared actions must execute

### Problem

An agent could declare `slack.message.post`, perform no Slack action, and still report a successful run.

### Cause -> effect

Manifest validation checked the shape of requested actions but did not prove that an executor existed or that required actions produced successful action records.

### Solution -> effect

`apps/agent/agent/lib/agent-actions.ts`, `agent-manifest.ts`, `run-preflight.ts`, and `run-runtime.ts` now share an action registry. Deployment rejects unsupported actions. Runtime completion verifies required action fulfillment and fails with explicit `NO_EXECUTOR` or `ACTION_NOT_PERFORMED` semantics.

A green run now means its declared required action types actually succeeded.

### Drawbacks and pending work

- A manifest currently allows only one action of each type. One version cannot declare two independent Slack post actions.
- Fulfillment is checked by declared action type. This is correct while duplicate action types are forbidden, but must become action-instance based if duplicates are added.

## 10. Real Slack message execution

### Problem

The builder could create Slack actions, but the runner had no tool that called Slack.

### Cause -> effect

The product contract was ahead of the implementation. Runs could describe delivery without an executor or durable receipt.

### Solution -> effect

`post_slack_message` now resolves the connected bot token, opens a DM when needed, and calls `chat.postMessage`. It records action claims, leases, provider responses, and stable `client_msg_id` values so retries do not intentionally create a second Slack message.

Channel targets are checked against the inventoried bot-joined channels. Person targets resolve from exact CRM-to-Slack matches. Provider and scope errors fail the action and therefore the run.

### Drawbacks and pending work

- Slack's acceptance is an external side effect. A network failure after Slack accepts a request but before the receipt is stored can remain ambiguous, even with a stable client message ID.
- There is no support yet for replies, reactions, files, channel creation, channel joining, or message history.
- Real DM and channel delivery were not executed against the user's live Slack during this verification pass.

## 11. Correct Slack bot OAuth

### Problem

Installation used the API origin in the token exchange, causing a redirect URI mismatch. The earlier scope guidance also included permissions the runtime did not need.

### Cause -> effect

Better Auth's custom generic OAuth token callback receives its own default API callback URL. Configuring only the authorization redirect did not change the redirect URI sent during token exchange.

The built-in Better Auth Slack provider is an OpenID user-login provider. It requests identity scopes and is not the correct abstraction for installing a bot that posts messages.

### Solution -> effect

The implementation intentionally uses Better Auth's custom `genericOAuth` plugin and pins the app-origin callback URI in both authorization and token exchange.

The exact bot scopes are:

- `channels:read`
- `groups:read`
- `chat:write`
- `im:write`
- `users:read`
- `users:read.email`

Slack is not trusted for implicit account linking, sign-up is disabled for this provider, and missing Slack profile data routes to the connection page with actionable error copy.

### Drawbacks and pending work

- The Slack installer's Slack email must exactly match the signed-in CRM user's email for Better Auth to link the provider safely.
- OAuth was verified through configuration and tests, not through a fresh live Slack install in this pass.
- The callback URL in Slack app settings must exactly match the app-origin URL generated by this deployment.

## 12. Organization-wide Slack connection

### Problem

Slack looked connected only to the person who installed it, even though agents and connections are shared by the whole team.

### Cause -> effect

Better Auth stores provider credentials on an `Account` row belonging to one CRM user. Reading only the current user's account made an organization capability look personal.

### Solution -> effect

The connection service treats Slack as one global capability for this intentionally single-workspace CRM. Account hooks remove older Slack provider rows after a new connection is created or updated, so the newest valid install is the one effective connection.

Every signed-in CRM member can use the same bot connection to inspect destinations and build agents.

### Drawbacks and pending work

- The credential still physically belongs to the installing Better Auth user. Deleting that CRM user can cascade-delete the connection.
- There is no dedicated Slack installation table containing Slack team ID, team name, installer, or rotation history.
- Any signed-in CRM member can currently connect, replace, or disconnect the shared Slack install. An owner/admin permission gate is still a product and security decision.
- The UI says `Slack workspace` because team metadata is not persisted.
- True multi-organization support would require workspace-scoped credentials and data. The current product uses one constant CRM workspace, so this is architecture debt rather than a current tenant leak.

## 13. Truthful Slack people and channel inventory

### Problem

The people page showed stale or hardcoded-looking results, repeatedly spammed refresh requests, and could report no account after a new Slack member joined. The builder also did not know newly available channels.

### Cause -> effect

Inventory only refreshed as a side effect of a people-match job. The UI had no clean on-demand refresh path, polling did not stop reliably, and old Slack IDs could survive reconnects even when the email no longer proved the identity.

### Solution -> effect

The API exposes connection status, matches, refresh, and disconnect operations. A stale status check enqueues one inventory task using an advisory idempotency lock. The UI polls only while a sync is active.

The agent fetches Slack members and channels, then replaces cached inventory with:

- non-deleted, non-bot people with exact email matches;
- non-archived channels where the bot is already a member.

Every refresh re-evaluates email. The previous preserved-Slack-ID fallback and unused `explicitlyUnmatched` column were removed because stale identity could route a DM to the wrong person.

### Drawbacks and pending work

- Matching is exact email only. Aliases and different work/personal emails need a future manual mapping UI.
- Only CRM workspace members become selectable matched people. Arbitrary Slack members are not offered as agent person targets.
- Only channels the bot has joined are listed. The product does not auto-join channels.
- Inventory is refreshed on status demand or manual request, not from Slack Events, so it can be stale between refreshes.
- Slack rate limits or network failures leave the previous cached inventory in place and surface the refresh failure.

## 14. Structured Slack destination selection

### Problem

The builder asked users to type Slack IDs and could present a follow-up that was impossible to answer after the bot joined a channel.

### Cause -> effect

The builder relied on stale free-text context and stream-only questions. It had no reliable structured inventory to offer as answer choices.

### Solution -> effect

Builder context includes current matched people and bot-joined channels. Its instructions require structured clarification choices when a person or channel is ambiguous. The durable question flow preserves those choices across refresh.

Users can choose the exact Slack destination instead of copying an ID from Slack.

### Drawbacks and pending work

- The choice list is only as current as the latest successful inventory refresh.
- If no eligible destination exists, the user still has to invite the bot or fix the member email, then refresh.

## 15. Connections pages tell the truth

### Problem

Connections UI showed seeded preview data, implied unsupported integrations worked, and displayed an intake endpoint that did not exist.

### Cause -> effect

Presentation was implemented before backend capability. Placeholder rows and promises looked like real customer data and working features.

### Solution -> effect

The overview and detail pages now read actual connection state. Empty results render empty states. Stripe and Docusign are labeled `Coming soon`. The intake page explicitly says the endpoint is unavailable and exposes no fake URL or key.

Google and Microsoft callback and disconnect redirects preserve the active workspace slug, so users return to the correct connections page.

### Drawbacks and pending work

- Stripe, Docusign, and generic intake remain unimplemented.
- Google Workspace still reports only the capabilities its current integration actually has; sending on behalf of the user remains future work.

## 16. Local development starts the intended processes

### Problem

`bun run dev` failed because the tRPC watch glob was quoted incorrectly on Windows, and Nest could not resolve the Slack database dependency.

### Cause -> effect

The package script passed literal quote characters to `nestjs-trpc`. Separately, `SlackModule` did not import the module that provides the database injection token.

### Solution -> effect

`apps/api/package.json` now uses a Windows-safe watch argument, and `SlackModule` imports the database provider module. Nest boot verification maps the Slack router successfully.

### Drawbacks and pending work

- Bun still prints warnings that linked package files are outside the API watch project. Those warnings predate this fix and can mean edits in shared packages require a restart.
- The Eve dev process has its own environment/runtime requirements and was not kept running during verification because the user's server owns that process.

## 17. Database migrations and generated contracts

### Problem

Durable questions, event ownership, plural triggers, Slack matches, and delivery state needed persistent schema support. Schema-only edits would leave deployed databases inconsistent.

### Cause -> effect

These behaviors cross process boundaries and restarts. In-memory state cannot enforce them, and Prisma requires explicit migrations.

### Solution -> effect

Seven task migrations add Slack matches, pending builder input, event tasks, conversation-owned events, canonical builder tokens, plural trigger manifests, and removal of the unused unmatched flag. Prisma generation and the generated tRPC server were refreshed.

All 44 repository migrations apply locally, and Prisma reports no schema drift.

### Drawbacks and pending work

- The canonical token migration supports old `crm:builder:<id>` values while new writes use `builder:<id>`. Code remains tolerant during rollout.
- Production deployment still needs its normal backup, migration, and smoke-test procedure.

## Verification performed

| Check | Result |
| --- | --- |
| API, agent, app, and auth typechecks through Turbo | Passed: 8 tasks |
| App tests | Passed: 137 tests, 370 assertions |
| Agent custom runtime tests | Passed: 31 tests, 65 assertions |
| Agent builder integration | Passed: 7 tests, 29 assertions |
| Agent durable runtime integration | Passed: 14 tests, 49 assertions |
| API auth end-to-end boot | Passed: 5 tests; Nest mapped Slack routes |
| API Slack connection service | Passed: 3 tests |
| Focused API conversation, run, event, deal-contact, and mailbox suites | Passed individually |
| tRPC generation | Passed: 17 routers, 120 procedures |
| Prisma migrations | Passed: 44 applied, no schema difference |
| Diff whitespace validation | Passed |

### Verification limits

- Running all API database suites together under Bun 1.3.2 is not a reliable signal in this repository. Shared lifecycle behavior can hang, and an existing isolated `.rejects.toThrow` matcher can also hang. Focused affected suites pass.
- React Doctor could not produce a report. The repository enforces Bun through `devEngines`, `bunx` could not locate the scanner command, and forced `npx` hung without output. The affected React was manually audited, app tests pass, and app typechecking passes.
- No live Slack OAuth install or live message was performed during this final pass.
- No browser automation covered refresh -> answer -> deploy as one end-to-end journey.

## Commit batches

| Commit | Purpose |
| --- | --- |
| `e131b6e` | Immediate sent-message and thinking feedback |
| `25d044a` | Durable database and event foundations |
| `6906227` | Builder state, runtime correctness, triggers, and actions |
| `b719b10` | Truthful Slack connection, inventory, and connections UI |
| `06eaf78` | Slack and builder fallback gaps found during review |
| `8853d2a` | Explicit pre-delivery Slack cancellation guard |
| `e4209c2` | React-safe optimistic state settlement |

Every new task commit includes `CMP-73` in its title. `e131b6e` predates the Median task assignment and is listed because it is part of the same user-visible flow.

## Handoff priority

If another developer continues this work, the best next order is:

1. Run a real Slack install, DM, and channel-post smoke test using a disposable Slack app/workspace.
2. Add a browser test for builder question -> refresh -> answer -> deploy.
3. Decide who may replace or disconnect the organization Slack connection.
4. Move Slack installation credentials into a dedicated workspace-owned model before adding real multi-organization support.
5. Add an explicit recovery policy for Eve sessions that disappear after delivery.
6. Add manual CRM-to-Slack identity mapping for teams whose emails differ.
7. Implement a real webhook/intake product before enabling `WEBHOOK` in builder UX.

## Files intentionally not included

The existing user modification to `AGENTS.md` and the existing deletions under `apps/api/.scratch/` were not changed or committed as part of CMP-73.
