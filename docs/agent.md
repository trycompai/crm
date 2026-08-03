# Agent — Rules for working on `apps/agent`

Product discovery is also agent-owned. Hunter, Brave and GitHub clients,
deterministic scoring, evidence collection and provider-cost accounting live in
`apps/agent/agent/lib/prospecting.ts`; the API only persists review decisions,
external form events and approved Gmail actions. See
[product prospecting](./prospecting.md).

The research agent works out who the people in the CRM are. It is an
[eve](https://eve.dev/docs) app, it is **its own deployment**, and it owns every
piece of intelligence in this repo.

Read this with [`api.md`](./api.md) — whose first rule is that none of this may
move into the API — and
[`plan/contact-intelligence-agent.md`](./plan/contact-intelligence-agent.md),
which is why it is shaped this way.

## The framework is the source of truth

The complete eve documentation ships inside the package, matching the installed
version exactly:

```
apps/agent/node_modules/eve/docs/README.md
```

Read the relevant guide there before writing eve code. Guessing at this API is
expensive in a specific way: it typechecks, builds, and then behaves differently
from what you assumed — see the note on principal mapping under [the
bridge](#the-bridge).

## The model is a setting, not a deploy

The agent runs on **`zai/glm-5.2-fast`** by default, and a rep can change that
on the settings page without touching the code.

`DEFAULT_AGENT_MODEL` lives in [`@crm/db/settings`](../packages/db/src/settings.ts)
because two processes need the same answer — the agent, to compile its
fallback, and the API, to tell the settings page what "Default" resolves to.
A second copy of that string is a second answer to the question.

- **The choice is a row, not an env var.** `AppSetting` holds one record, and
  `agent.ts` resolves it through `defineDynamic` on `session.started` — so a
  change applies to the next session rather than the next deployment, which
  matters in an install whose owner cannot redeploy. A conversation already
  open finishes on the model it started with, and that is deliberate: prompt
  caches are per model, so switching part-way re-ingests the thread at uncached
  prices.
- **The window travels with the id.** eve never inherits
  `modelContextWindowTokens` from the fallback, so `lib/model.ts` always sends
  it. A model with a smaller window than the default would otherwise be
  compacted against a number it does not have, and the turn fails at the
  provider after the context has been assembled and paid for.
- **A failed read degrades, it does not throw.** No row, no database, a
  resolver that raises — all of them leave the compiled fallback in force.
  `lib/model.ts` logs the reason, because the alternative is a session quietly
  running on a model nobody chose.
- **The chooser only offers models this agent can run.** Every read the agent
  has is a tool, so `ModelCatalogService` filters the gateway catalog to
  language models tagged `tool-use`. An unreachable gateway makes the chooser
  read-only rather than failing the page, and the id already stored keeps
  running.
- **Not a frontier model, on purpose.** The hard part of this job is refusing a
  plausible-looking wrong answer, and that is enforced by the tools and the
  evidence model below rather than by model strength. What the job does want is
  a long window — a company preamble hands over every contact on the account —
  and answers fast enough that the sheet's Agent tab reads as a conversation.

## Pictures are copied, never linked

A logo and a profile photograph both arrive as somebody else's URL, and neither
may be stored as one. LinkedIn signs its CDN URLs with an expiry roughly three
weeks out; a brand's own CDN is fine until it is a rate limit on a page drawing
forty logos. Either way the failure is the same and it is the worst shape a
failure can take here — a picture that works today and is a broken image next
month, with nothing to connect the two.

So `mirror()` copies the bytes into Vercel Blob and the record points at our
copy.

**It lives in [`@crm/db/blob`](../packages/db/src/blob.ts), not in the agent.**
It started here, on the reasoning that whoever writes the URL onto the record
should own fetching the bytes — which is still right, and is exactly why it had
to move once more than one thing wrote one. There are four writers now, in three
processes:

| Writer | What it copies |
| --- | --- |
| `lib/brand-images.ts` (agent) | The four artwork columns on a company |
| `lib/portrait.ts` (agent) | A contact's photograph |
| `FaviconService` (API) | The icon a domain's own site serves |
| `ImageMirrorService` (API) | Anything on an existing row still pointing off-site, including a signed-in user's Google avatar |

`packages/db/prisma/seed.ts` is the fifth, and it matters more than it sounds:
demo rows outlive their sources, and a clone seeded today is still open in six
months.

- **The key carries a hash of the bytes.** That is what makes re-running both
  idempotent and correct: unchanged artwork lands on the same URL and the record
  does not move, while a brand that redesigns its mark gets a *new* URL rather
  than the same one behind a month of CDN cache.
- **One list of the columns that hold a picture**, `COMPANY_IMAGE_FIELDS` in
  [`@crm/db/images`](../packages/db/src/images.ts). Four things read it and a
  column missing from one of them is a picture that is never brought in-house,
  with nothing anywhere to say so.
- **It fetches through `@crm/db/safe-fetch`**, which is the favicon resolver's
  own guard, exported rather than copied. The URL came from a vendor's answer
  about a domain a rep typed, so a logo link pointing at `169.254.169.254` is a
  request forgery from inside our network. One copy of that rule, several
  callers.
- **No `BLOB_READ_WRITE_TOKEN` means no photographs**, and everything else keeps
  the origin's URL. The distinction is deliberate: a face comes from a signed
  CDN link that expires, so storing one would promise a picture that breaks in
  three weeks, while a logo or a favicon merely stays somebody else's to serve.
  It is an optional capability like every other, and it is in
  `lib/capabilities.ts` so the agent is told before it plans.
- **A mirrored URL is what lets the browser optimize it.** `isOptimizable` in
  `@crm/db/images` is the whole of that decision and both halves are load
  bearing: `next.config.ts` allow-lists our Blob host and nothing else, because
  a wildcard would make the deployment an open image proxy — and a mirrored
  *SVG* is still refused, because Blob's separate origin is the only reason we
  store SVG at all, and `/_next/image` would re-serve those bytes from ours.
  Everything that fails the check renders as the plain `<img>` it always was.
- **Faces are not optimized, and that is not an oversight.** `EntityLogo` uses
  `<Image>`; `AvatarImage` deliberately does not. Radix establishes an avatar's
  load state by probing the URL with its own `new window.Image()`, so an
  optimized child would request a second, different URL — two fetches per face
  on a table drawing forty. There is nothing to win for the second one either:
  every photograph we store arrives pre-thumbnailed by its source
  (`shrink_100_100`, `=s96-c`), while brand artwork arrives at whatever size the
  brand publishes.
- **A photograph is only ever taken from a source already tied to this person.**
  `lib/portrait.ts` holds the write and `lib/portrait-sources.ts` holds the
  chain, in order of certainty: their LinkedIn profile, their GitHub account,
  their employer's own team page. Every one is keyed on an identifier already on
  the record, so each asks *what does this account look like* rather than *who
  is this name*.
- **There is no image search by name, and there must never be.** It is the
  obvious fourth step and the one that breaks everything else. A search for
  "Paula Marchetti" returned Brightwater's CEO, an HR lead at Reply and a data
  engineer in Seattle, all confidently — and those were names, which a rep can
  read and smell. Nobody audits a face. Guess where to look, never what you will
  find: a team page is a guess about a URL, and the name printed beside the
  photograph is the answer.
- **`get_linkedin_profile` stores the picture itself** the moment it computes
  `isSamePerson`, in code, rather than asking the model to remember a follow-up
  call.

### A portrait is not a research session

`schedules/dispatch.ts` runs `portrait` rows **directly, without `receive`**.
This is the one kind that skips the model, and it is worth knowing why: the work
is three reads keyed on identifiers already on the record and a byte copy, with
nothing in it to decide.

Routed through a session it also did not work. Seven queued faces sat behind
sixty LLM sessions at five a minute and had not landed twenty five minutes
later, each one waiting to pay for a context window in order to make no
decisions with it.

The schedule still decides nothing, which is the rule it has to keep. The row
says what the work is; the branch only says whether it needs a conversation.

### Catching up what was missed

Enrichment is queued when a record is created, so anything created before a
capability existed never gets it. Two routes, and picking the wrong one is
expensive:

| | Covers | Cost |
| --- | --- | --- |
| Automatic sweep, on sign-in | Records never successfully looked up | Ten credits per company |
| `ImageMirrorService`, in the same sweep | Rows whose picture is still served from somebody else's origin | Nothing |
| `bun run --filter=agent backfill:images` | Records already enriched, missing only the *pictures* | Nothing |

The middle row is the one that keeps "every picture is ours" true rather than
true-since-Tuesday. Every writer copies as it writes, but that says nothing
about rows written before it did, or rows whose copy failed at the time because
the origin was down. Left alone those never resolve, and nothing looks broken —
the pictures render perfectly, off someone else's server, forever. It is capped
at twenty five rows per table per sweep, so a backlog drains over several
sign-ins instead of in one burst that looks like a scrape.

**A photo sweep queues anyone with a LinkedIn URL, a GitHub URL, or an employer
with a website — the three doors the chain knows. The third reads the company's
team page and costs Context.dev credits, which is why a **finished `portrait`
task stands that contact down for thirty days**. Most people are not on their
employer's team page and never will be; without the stand-down every sweep would
pay to re-read the same sites and find the same nothing, forever. The task's
`outcome` carries what was actually tried, so a month of paid lookups leaves
something readable behind.

The sweep has no button, deliberately.** It had one on each list page, and a
control whose correct usage is "press it whenever you notice blanks" is a chore
dressed as a feature — a rep has no way of knowing which records predate the
favicon resolver, and no business fixing that by hand.

The trigger is **signing in**, which is the one moment nothing else in the app
can see. `packages/auth` owns it, through a Better Auth
`databaseHooks.session.create.after`; `BackfillService.onModuleInit` subscribes
via `onSignedIn`. The registry exists because the arrow cannot point the other
way — `@crm/auth` is a dependency of the API, so it must not import a Nest
provider — and it means the Next.js app, which imports the package only to read
sessions, runs none of this.

`BackfillService` has no router at all as a result. Nothing calls it; it is
subscribed. A five-minute stand-down collapses a burst — a team arriving at
nine, or Google linking an account mid-sign-in — and `auto()` returns before any
work starts, so nothing is between a person and their CRM.

It writes `AgentTask` rows and decides nothing, which is what keeps it on the
API's side of the line in [`api.md`](./api.md); whether a given company is worth
the credits stays the agent's call. Each pass is capped at 500 rows and the
leftover is logged rather than rounded away.

The script is the cheap half: it re-derives from the `CompanyEnrichment.raw`
payloads already on disk, which is what keeping them was for. Reach for it when
the records are fine and only the images are missing.

## Evidence, not confidence

**No tool accepts a confidence, a score, or a `sourceUrl` offered as proof.** A
tool reports what it *observed* — `crm.signature-block`, `github.account-identity`
— and `lib/evidence.ts` prices it. This is the rule the whole design rests on:
a model asked to grade its own certainty will, and it will be wrong in the
direction that makes it look useful.

- `lib/evidence.ts` — the weights, the combination rule, the bands.
- `lib/facts.ts` — the only write path to a contact's fields. Applies at
  `VERIFIED`, stores a proposal below it, and enforces three things a prompt
  cannot: never overwrite a human, never re-offer a dismissal, never write
  without a primary source.
- The bands are behaviour, not labels. `PROBABLE` means *a rep decides*, and
  that is a correct outcome — four Marchettis work at Fernhill.

Adding a fact field means adding it to `FIELDS` in `lib/facts.ts` **and** to
`FACT_COLUMNS` in `apps/api/src/contacts/contacts.service.ts`, which is where an
accepted proposal writes through.

## Optional by default

Every outside source is optional and the agent is designed to run with none.
`lib/capabilities.ts` is the single place that knows what is set: it prints the
list at boot, states it in the session instructions so the agent plans around
what it has, and gives tools a shared "not configured, and retrying will not
help" result — checked **before** the research budget is charged.

A missing key removes a place to look. It is never an error, and it must never
throw.

## Budget, and deciding what to do next

- `lib/focus.ts` holds the per-session budget in `defineState`. Every vendor
  call charges it. Running out is a normal ending.
- `lib/tasks.ts` is the work queue. `claimDue` leases rows with
  `FOR UPDATE SKIP LOCKED`, so two dispatchers take disjoint work and a run that
  dies frees its row when the lease expires.
- `schedules/dispatch.ts` is the **only** schedule. It decides nothing: it
  leases what is due and starts a session per row. Anything that looks like
  "every N minutes, the oldest ten contacts" belongs in a task's `dueAt`, not in
  a cron expression.
- `tools/schedule_recheck.ts` is how the agent books its own next look, and its
  `reason` is shown to the rep. An agent that cannot say why it will be back in
  fourteen days does not have a reason, it has a default.

## Three records, and no dead ends between them

The CRM has contacts, companies and deals, and the agent is opened on any of
them. Every read hands back the **ids** of the neighbouring records, and that
rule is not decoration — the two worst answers this agent has given both came
from breaking it:

> I don't have a tool that lists contacts by company, only ones that look up a
> specific contact by ID or email. Could you paste the contact's name or email
> address?

Said to a rep who had the company open, with the contacts on screen. The
company preamble reported a *count* of contacts, the only read took a
`contactId`, and the agent correctly concluded it had nowhere to go. And, on a
contact who plainly worked somewhere, that no company was available: the
history returned `companyName`, a display string, while every company tool
takes an id.

So:

| Read | Free | Hands back |
| --- | --- | --- |
| `read_crm_history` | yes | the contact's **company id**, the deals they are on, their colleagues |
| `read_company_history` | yes | **every contact with their id**, every deal, the account's threads and meetings, the notes |
| `read_deal_history` | yes | the stage clock, every stage it moved through, the people on it with ids, the last reply |
| `search_crm` | yes | contacts, companies and deals matching what a person would type |

**A preamble or a tool result that names a record without its id is a bug**,
because the only recovery available to the agent is to ask the human — which is
the CRM handing its own join back to the person using it. Ambiguity is
different, and fine: four Marchettis come back as four rows with their titles,
and asking which one is a question rather than a chore.

`search_crm` deliberately does no fuzzy matching. "Northwind" reaching
"Northwind Savings Group" is useful; "Marchetti" reaching "Marchetta" is a
wrong record in a CRM, and a wrong record about a real person is the one
failure this whole design exists to prevent.

### A session is a conversation, and they are not all the same one

`lib/preamble.ts` builds what a session is told before it speaks, and it varies
on two axes:

- **Which record.** A person is asked who they are, a company what it does and
  who we know there, a deal where it stands. Each preamble names that record's
  neighbours, with ids, and points at the read to start from.
- **Who opened it.** A dispatched task is a research pass with a budget; a rep
  in the sheet is a conversation. Told neither, the agent assumed the first,
  which is how a question got a work plan back. `taskKind` is the tell — the
  dispatcher sets it and the panel never does.

The prose lives in `lib/preamble.ts` rather than in `instructions/task.ts` so
that `test/preamble.integration.spec.ts` can assert the thing that actually
matters: that a company session can name its own contacts. `task.ts` is the
resolver, and it owns the one side effect — seeding `lib/focus.ts`, without
which the audit hook files a session's events against nothing.

Adding a fourth record kind is an entry in `sessionPreamble`, a read beside the
other three, and a line in `TOOL_VERBS` (`apps/app/lib/agent-transcript.ts`),
which a test enforces so no tool ever shows a rep a bare slug.

## What the agent may read, and what may leave

It may read **everything**, including full email bodies — single-tenant internal
tool, and a signature block is the best source of a job title there is. The
boundary is egress, and it is three rules:

1. No customer text in a third-party query. Derived questions only.
2. Nothing from a mailbox into `/workspace`. The sandbox has a different
   lifetime.
3. Nothing sensitive logged. Reading is not logging.

`skills/data-boundaries.md` is the agent's copy of this. Keep them in step.

## The sandbox

`agent/sandbox/sandbox.ts` turns on `bash`, the file tools, and a `/workspace`,
with **`deny-all` egress** set on the backend factory so it cannot be forgotten
per session. That costs nothing: `web_fetch` runs in the app runtime and
`web_search` at the model provider, so retrieval is unaffected.

**Never give the sandbox `DATABASE_URL`.** CRM access is authored tools in the
app runtime. A shell with credentials and network is exfiltration-shaped even in
an internal tool; a shell with neither is a text processor.

## The bridge

The contact sheet's **Agent** tab talks to a running agent. The path:

```
browser  →  /eve/v1/*  (same origin, session cookie)
              + x-crm-contact: the record the rep has open
         →  apps/app/app/eve/v1/[...path]/route.ts
              checks the Better Auth session
              strips the cookie
              mints a 2-minute HS256 token naming the rep
              and carrying the contact id
         →  AGENT_URL/eve/v1/*
              agent/channels/eve.ts → repFromCrm() verifies it
              instructions/task.ts reads attributes.contactId
```

**The record travels in the token, never in the message.** The panel used to
prefix everything a rep typed with `About contact <cuid> (Name):` so the agent
knew what it was looking at, which meant the rep read their own question back
with plumbing bolted to the front. The claim reaches the agent through the same
`session.auth.attributes` path the dispatcher uses, so the message stays theirs.

Mounted at `/eve/v1/*` deliberately: that is where `useEveAgent()` looks by
default, so the hook needs no `host` and there is no CORS and no cross-site
cookie anywhere in it. It is the same trade the app already makes for the API.

Three things worth knowing before you touch it:

- **The proxy is an enforcement point, not a passthrough.** The agent never sees
  the session cookie, so if that route did not check the session, nothing
  downstream would.
- **eve's `jwtHmac()` helper resolves an HMAC token to
  `principalType: "service"`** with a namespaced `principalId`. Correct for a
  machine credential, wrong for a person — and `lib/approval.ts` decides whether
  to pause for a human by reading exactly those fields, so a rep would have been
  refused a sensitive write while sitting there watching. `repFromCrm` wraps
  `verifyJwtHmac` and maps the subject to a real user principal.
  `test/channel-auth.spec.ts` pins it.
- **`AGENT_BRIDGE_SECRET` unset skips the auth entry rather than opening it.**
  The panel stops working; the agent keeps running its own schedule. An
  optional capability's absence must never widen access.

### The panel knows which record it is on

`lib/agent-record.ts` is the single place that maps a record kind to everything
downstream: the header the panel sends, the claim the proxy mints, the field a
conversation is filed under, and the questions offered on an empty thread. A
contact is asked "Who is this person?", a company "What do they do?", a deal
"Where does this stand?" — offering the first of those on a company is the tell
that a chat box was bolted on rather than built into the record.

The agent gets the same context: `instructions/task.ts` opens a session with a
preamble built from the record, so a deal session starts knowing the stage, the
amount, the close date and who is on it, rather than spending its first two tool
calls finding out.

Adding a fourth kind is one entry in `COPY` plus a branch in the agent's
preamble — not four edits in four layers.

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

## Tests

`bun run --filter=agent test`. The integration specs need `DATABASE_URL` and run
against a real Postgres, which is the point — "never overwrite a human" is only
true if the transaction says so.
