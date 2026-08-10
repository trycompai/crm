# Fix spec — deployed agents promise Slack, cannot send, and report success

`v0.1`. Read-only investigation is complete; every claim below is backed by a
query against the local database, a run log, or a named line of code.

---

## Mission

**The agent builder can draft, validate and deploy an agent whose stated purpose
is to post to Slack. Nothing in this codebase can post to Slack. The run then
finishes green, having done nothing, and the failure is visible only as prose
buried in a summary.**

Two things are broken and they must be fixed together, in this order:

1. **An agent must not be able to promise a capability that has no executor.**
2. **A run that could not perform its declared action must not report success.**

Adding the Slack tool without fixing 2 leaves the same class of silent failure
waiting for the next unimplemented action type.

## The incident, in full

The user built **"New Deal Alert — Ping Grim"** and ran it twice manually. Both
runs are marked **Succeeded**, both report **1 external action**. Nothing was
ever sent to Slack — no channel message, no DM, nothing.

### Proof — what the deployed version promises

Agent `cmsn02nhj0009ocvjuveic6uq`, status `LIVE`, version
`cmsn02ni0000aocvjwbvfaq3q`. Declared actions from the stored manifest:

```json
[
  { "type": "slack.message.post",
    "provider": "slack",
    "summary": "Post new deal alert in #test mentioning @grimstudioss when a new deal is detected",
    "destination": { "id": "C0BNPPGQN2K", "kind": "channel",
                     "label": "#test", "resolution": "chosen" } },
  { "type": "crm.activity.create", "provider": "crm", "activityTypes": ["NOTE"] },
  { "type": "run.summary", "provider": "crm" }
]
```

Note the destination is fully resolved and validated — a real channel id, the
exact inspected label. The draft-time validation in `builder-runtime.ts:525` did
its job perfectly. It validated a promise nothing could keep.

### Proof — what actually got recorded

```
run …lev863  status SUCCEEDED  trigger MANUAL
  actions: [ { type: "crm.activity.create", provider: "crm",
               status: "SUCCEEDED", errorCode: null } ]

run …u5ivds  status SUCCEEDED  trigger MANUAL
  actions: [ { type: "crm.activity.create", provider: "crm",
               status: "SUCCEEDED", errorCode: null } ]
```

**Zero `slack.message.post` rows. No FAILED row. No `errorCode`. Both runs
green.** The "1 external action" shown in the UI is the CRM note.

The `AgentAction` model (`schema.prisma:795`) already has `status`,
`errorCode`, `errorMessage`, `attemptCount` and a unique `idempotencyKey`. It is
built precisely to record this. Nothing used it.

### Proof — the capability does not exist

```
grep -rn "chat.postMessage|conversations.open|postMessage" apps/agent apps/api packages
  → no matches
```

The only Slack API calls in the repository are in
`apps/agent/agent/lib/slack-people.ts`:

```
line 117:  https://slack.com/api/users.list
line 143:  https://slack.com/api/conversations.list
```

Both read-only, both for people matching.

The runner subagent's complete tool list
(`apps/agent/agent/subagents/agent_runner/tools/`):

```
ask_question  bash  create_crm_activity  finish_run  glob  grep
inspect_run   query_crm  read_crm_record  read_file  todo
web_fetch     web_search  write_file
```

`grep -rn "slack" apps/agent/agent/subagents/agent_runner/` → **no matches.**

Meanwhile `slack.message.post` appears in exactly three places, all builder-side:

| File | Role |
| --- | --- |
| `agent_builder/lib/draft-input.ts:34` | lets the builder declare it |
| `lib/builder-runtime.ts:525` | validates its destination |
| `agent_builder/instructions.md:30` | instructs the builder to use it |

A rich vocabulary for an action with **no implementation anywhere**.

### What the model did when it hit the wall

From the run #001 summary, verbatim:

> **Slack message: NOT sent.** A message to `#test` mentioning `@grimstudioss`
> was intended, but could not be delivered because no Slack posting tool is
> available in this runtime — only `create_crm_activity` is exposed as a
> side-effecting tool.

The model diagnosed the bug correctly and then **returned success anyway**,
because nothing in the run contract says it should not.

It also improvised state: with no `EVENT` trigger and no run-scoped storage, it
wrote the last-check timestamp into a **CRM note on a real deal** and diffed
against that note's `createdAt`. Run #002 then compared the deal's creation time
(`09:00:04`) against the previous note's timestamp (`09:00:45`) and correctly
concluded nothing was new. The workaround works exactly once and then races
itself, and it has left two junk "Deal Check Run" notes on a customer record.

## The work

### 1. Close the promise gap — do this first

There must be exactly one list of executable action types, and the builder must
draft only from it. Either:

- **implement `slack.message.post`** (preferred — see 3), or
- **remove it** from `draft-input.ts`, `instructions.md` and `builder-runtime.ts`.

What cannot remain is today's state, where the builder confidently drafts it.
`.agents/skills/pit-of-success/SKILL.md` is in this repo and this is exactly its
case: the natural path bypasses required semantics. Read it.

Add a test that fails if a type is declarable in the draft schema and has no
executor registered. That test is the real deliverable of this step — it makes
the class of bug impossible, not just this instance.

### 2. Make unperformed actions fail the run

A declared action that is never attempted, or attempted and failed, must:

- write an `AgentAction` row with `status: FAILED` and a real `errorCode`
  (`NO_EXECUTOR`, `PROVIDER_ERROR`, `NOT_AUTHORISED`), and
- mark the run failed, not succeeded.

`finish_run` must not accept a success outcome while any declared action is
unattempted. A run whose stated purpose did not happen is a failed run.

This step is what makes the next unimplemented action type loud instead of
silent.

### 3. Implement Slack posting

`chat.postMessage` for a channel, `conversations.open` then post for a DM. Per
`AGENTS.md`, this lives in **`apps/agent`, never the API**.

Everything needed already exists:

- Bot token — `account` row, `providerId: "slack"`, `accessToken` set.
- Scope — `chat:write` is already requested (`packages/auth/src/auth.ts:117`).
- Destination resolution — `builder-runtime.ts:636` `slackDestinationIssues()`
  already rejects ids and labels outside the inspected workspace.
- Idempotency — `AgentAction.idempotencyKey` is unique; use it so a retry cannot
  double-send. Record the Slack `ts` in `externalId`.

Handle `not_in_channel` explicitly and surface it as an actionable message. The
user hit this: the bot was not in `#test`, later invited, and the workspace
channel inventory never refreshed because it only populates during
`runSlackPeopleMatch()`. A stale inventory must not read as "channel does not
exist".

### 4. Remove the need for the note hack

Once runs can record their own state, the agent must stop writing scaffolding
into CRM notes. Give a run access to its previous run's completion time. The two
existing "Deal Check Run" notes on deal `cmsn03kyr0006ksvjwkc3guy6` should be
cleaned up.

## Definition of done

- No action type can be drafted that has no executor; a test enforces this.
- A run that cannot perform a declared action is **FAILED**, with a FAILED
  `AgentAction` row carrying an `errorCode`.
- "New Deal Alert — Ping Grim" actually posts to `#test`.
- A retried run does not double-post.
- `not_in_channel` is reported as itself, with a path to fix it.
- No agent writes its own bookkeeping into CRM notes.
- Typecheck and Biome clean. No code comments. No `Co-Authored-By`.

## Related, deliberately not in scope

**`EVENT` triggers.** `AgentTriggerType` (`schema.prisma:203`) is already
`MANUAL | SCHEDULE | EVENT | WEBHOOK`; `EVENT` and `WEBHOOK` are modelled and
implemented nowhere — grep returns nothing outside the enum. `draft-input.ts:11`
restricts the builder to `MANUAL | SCHEDULE`, which is why the user was offered
polling instead of "when a deal is created".

Wiring it is genuinely small — emit from `deals.service.ts:235`, match enabled
`EVENT` triggers, `agentRun.upsert` with an idempotency key, the same shape as
the `SCHEDULE` branch in `custom-agent-dispatch.ts:187` minus the cron maths —
but it is a **feature**, and this spec is a **correctness fix**. Separate task,
separate review. Do it after this one; it is far more useful once actions
actually execute and failures are visible.

### Follow-on gap found once EVENT triggers landed

`EVENT` triggers have since been implemented: `draft-input.ts` now accepts
`{ type: "EVENT", event: z.enum(AGENT_EVENT_TYPES) }`, and
`packages/db/src/agent-events.ts:1` defines:

```ts
export const AGENT_EVENT_TYPES = ["deal.created", "deal.closed"] as const;
```

Two problems surfaced immediately, both worth their own small task:

**An agent can only have one trigger.** `trigger` in the draft schema is a single
discriminated-union object, not an array. A user asking for "a message when a
deal is opened, closed, or created" is forced to pick one event and told to
"build a second agent for the other event afterwards" — which is a schema
limitation presented as a product rule. The database already supports the
opposite: `AgentTrigger` (`schema.prisma:697`) is its own model keyed by
`agentId` + `versionId`, so many triggers per version are representable today.
The draft schema is the only thing preventing it.

**"Opened" is not an event.** The user's mental model included a deal opening;
only `deal.created` and `deal.closed` exist. The builder folded "opened" into
"created", which is defensible, but the explanation leaked the internal
constraint instead of stating what the CRM can actually notice. If stage
transitions matter, the event list needs to say so.

Also out of scope: builder conversation state — see
`.agents/prompts/fix-builder-conversation-state.md`.
