# Fix spec — the builder conversation does not own its own state

`v0.1`. Read-only investigation is complete; every claim below is backed by a
query against the local database or a named line of code. Do not re-derive it.

---

## Mission

**A builder conversation's question, transcript, and progress state live in the
live event stream instead of in the conversation. When the stream is not
attached, that state does not exist — so the follow-up question vanishes on
refresh, answering it is rejected as stale, and most of the transcript is
invisible.**

The fix is one idea: **the conversation row is the source of truth, and the
stream is only a renderer.** Everything below follows from that.

## Why this is urgent

The user cannot answer the builder's questions at all. Every path is blocked:

- Ask a question → refresh → the card is gone.
- Ask a question → answer it → `Unable to submit. Check your connection and try
  again.`
- Send an ordinary follow-up instead → the "Building the agent" UI takes over the
  thread.

Their words: *"i now have no way to answer this type shit"* and *"the chat flow
feels so choppy"*. Both are accurate descriptions of the bug, not of the design.

## Root cause, in one sentence

The `agent_builder` subagent runs in a **child eve session**. Persistence and
validation are scoped to the **root session**. So the durable record of a
builder question is never written, and the transcript is read back almost empty.

### Proof — child sessions hold nearly all the data

```
events in the last 36h, grouped by session class
  CHILD  213
  ROOT    11
```

For the most recent builder conversation (`…sp8wpxyz`, "New Deal Alert — Ping
Grim", root session `wrun_01KZNE9W95SQFKTMH57G1A9DWX`):

```
events visible to conversations.events() (root only):   11
total events persisted in the last 36h (all sessions):  749
```

`conversations.service.ts:878` is why:

```ts
const events = await this.db.agentEvent.findMany({
  where: { sessionId: conversation.sessionId },   // root session only
```

**On reload the UI receives 11 events out of 224.** That is the "choppy" feeling
— it is not a rendering problem, the data was never sent.

### Proof — the durable question record is never written

`crm.ts:113` has an `input.requested` channel handler that writes
`agentConversation.pendingInputRequest`. It has never fired for a subagent
question, because **that event type is not emitted**:

```
distinct event types, last 36h:
  session.started, turn.started, message.received, step.started,
  actions.requested, action.result, reasoning.completed, step.completed,
  message.appended, message.completed, turn.completed, session.waiting

input.requested:  ABSENT
```

The only two `input.requested` rows in the entire database are from **2026-08-05**
— before the root instruction in `instructions/task.ts:67` was changed to
*"call agent_builder immediately; do not ask the user a clarification yourself"*.
That change moved every question into the subagent and silently severed the
durable path. Nothing failed; the write just stopped happening.

Consequence, on every recent builder conversation:

```
pendingInputRequest: null
```

So `answerBuilderQuestion` (`conversations.service.ts:553`) always throws:

```ts
const question = pendingBuilderQuestionOf(conversation.pendingInputRequest);
if (!question) throw new BadRequestException(
  "The agent is no longer waiting for that answer.",
);
```

That is the `Unable to submit` toast. It is not a network error and the copy is
misleading.

### Where the question actually lives

It arrives as a **message part**, not a channel event: a `dynamic-tool` part in
state `approval-requested` carrying `toolMetadata.eve.inputRequest`, inside
child-session events. `agent-transcript.ts:334` reads it from the live stream:

```ts
export function pendingQuestion(messages: readonly EveMessage[]) {
  for (const part of messages.at(-1)?.parts ?? []) {   // last message only
```

Two independent fragilities: it only inspects the **last message**, and it only
works while the stream is attached. That is the "randomly summons" behaviour.

### Still reproducing after the first round of fixes — 2026-08-10 09:25

The user built "Deal Slack notifier agent", was shown a follow-up question with
two choices, picked one, and got `The agent is no longer waiting for that
answer.` Database state at that moment:

```
"Deal Slack notifier agent"  pendingInputRequest: null  token: builder:cmsn0zrbk0000lcvjtl86dy5t
newest conversation          pendingInputRequest: null  token: null
input.requested rows, total lifetime: 2      (both 2026-08-05)
```

This is the `!question` branch at `conversations.service.ts:556`, not a network
failure. The question was rendered from the **live stream**; the server never
had a record of it. The error copy changed since the first report — the user now
sees the server's real message rather than "Unable to submit. Check your
connection" — but the underlying failure is identical. **Do not treat improved
error copy as progress on this bug.**

Note also that the continuation token format has drifted: older rows are
`crm:builder:<id>`, newer ones `builder:<id>`. `idFromToken`
(`custom-agent-dispatch.ts:626`) uses `lastIndexOf`, so both still resolve — but
anything new that parses tokens must tolerate both, and the two formats should
be reconciled rather than left to coexist.

## What is already done — do not redo it

Another agent made real progress. Keep all of this:

- `crm.ts:113` — `input.requested` handler writing `pendingInputRequest`, and
  clearing it to `Prisma.DbNull` on completion (`crm.ts:211`). Correct code; it
  simply listens for an event that never arrives. Keep the write, change the
  trigger.
- `conversations.service.ts:377` — the conversation payload already exposes
  `pendingQuestion` derived from `pendingInputRequest`. The durable channel
  exists end to end; only the writer is missing.
- `agent-builder-chat.tsx:243` — `data.pendingQuestion ?? pendingQuestion(agentMessages)`
  already prefers durable over stream. Correct.
- `agent-builder-state.ts:54` — `agentBuilderCallIsActive()` scans for an active
  `agent_builder` `subagent-call`. Verified sound: `actions.requested` events on
  the **root** session do carry `kind: "subagent-call"`, so this works even with
  root-only reads.
- `agent-builder-chat.tsx:343` — the build card is now gated on
  `working && builderCallActive`. Correct.

## The work

### 1. Write the pending question from where it is actually raised

`pendingInputRequest` must be written whenever the builder asks, regardless of
which session raised it. Do not rely on the `input.requested` channel event —
it is not emitted for subagents.

Write it from the builder's `ask_question` path itself, keyed to the
conversation. Clear it when the answer is accepted and on turn end. After this,
`answerBuilderQuestion` validates against a row that exists, and the card
survives refresh because it is a database read.

The token helper is not the problem: stored tokens look like
`crm:builder:cmsk0be2o000l7kvj8qbw6ee1`, and `idFromToken`
(`custom-agent-dispatch.ts:626`) uses `lastIndexOf`, so the `crm:` channel prefix
resolves correctly. Leave it alone.

### 2. Return child-session events from `conversations.events()`

Without this the transcript stays 95% missing and the thread keeps feeling
broken even once the question card is fixed. Either record descendant session
ids on the conversation as they start, or resolve them at read time. Preserve
ordering across sessions and keep the existing `limit`.

### 3. Finish the sticky-state cleanup

`hasCreateAgentCommand(submissions)` is `.some()` over **every submission ever
sent in the conversation** (`agent-builder.ts:66`). Once any message was
`/create agent`, it is permanently true. `creatingAgent` still drives six
branches:

```
agent-builder-chat.tsx: 311, 356, 381, 392, 630, 1081
```

Audit each. Anything describing the **current turn** must use
`builderCallActive` or `currentSubmissionCreatesAgent`. Only genuinely
historical facts — "this conversation produced an agent" — may stay sticky.

### 4. Fix the error copy

`Unable to submit. Check your connection and try again.` is wrong: the network
was fine. When a question is genuinely stale, say so, and leave the answer in
the composer rather than discarding it.

## Definition of done

- Ask a builder question, hard-refresh, and the question is still there and
  answerable.
- Answering succeeds. `pendingInputRequest` is non-null while waiting, null
  after.
- A reloaded builder conversation shows the full transcript, not ~5% of it.
- An ordinary follow-up message in a conversation that once used `/create agent`
  does **not** render the "Building the agent" card.
- No error toast blames the connection for a state mismatch.
- `bun test` in `apps/app` and `apps/api` pass; typecheck and Biome clean.
- No code comments. No `Co-Authored-By`.

## Out of scope

Slack posting and `EVENT` triggers — see
`.agents/prompts/fix-agent-external-actions.md`. Do not batch them. This spec is
about correctness of conversation state; that one is about a missing capability.
