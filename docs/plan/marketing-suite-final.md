# Marketing suite — what is left

The single list to work from. The design reasoning is in
[`marketing-suite.md`](./marketing-suite.md), the original phasing in
[`marketing-suite-build.md`](./marketing-suite-build.md), and the operating
rules a future change must read first in [`../marketing.md`](../marketing.md).

Written 12 August 2026, after reading the tree rather than from memory.

Last worked 12 August 2026.

**Where it stands:** 46 commits on `lewis/marketing-suite`. A real email has gone
out through Resend. The engine walks a branching drip and the agent can build
one. All 14 packages typecheck, lint is clean, and 1231 specs pass. What follows
is everything that is not done, ordered so that doing it top to bottom never
leaves the product in a worse state than it is now.

---

## Done since this list was written

- **The drain cron is registered** at `* * * * *` in `apps/api/vercel.json`.
- **`RESEND_WEBHOOK_SECRET` is in `.env.example`**, and the `CRON_SECRET` note
  now names the drain route.
- **Quiet hours and the daily cap are enforced** in the drain and editable on
  the settings page, along with the sends-a-minute rate.
- **The settings page no longer touches DNS.** It lists the domains Resend has
  verified; open and click tracking are switches that write to Resend.
- **Every editor shares one shell** — back link, inline-editable name, badges,
  actions, a meta line and the co-pilot on the right.
- **New campaign, segment and template create an Untitled record** and open it.
  The three create sheets are gone.
- **The co-pilot knows which record is open** and edits it rather than making a
  second one, its thread survives a refresh, and the canvas repaints when a run
  finishes.
- **Company sends and enrolments**, the hand-add panel and archive on a segment,
  Save as segment on the contacts list, duplicate / archive / send-a-test on a
  template, and `first_campaign_sent` as the ninth funnel step.
- **A `building-a-segment` skill** gives the agent every facet and the tool
  order.
- **A branch can be added from the canvas.** It arrives with a condition and
  both arms, and the logic sheet edits that condition, refusing to save when a
  rule is one the editor cannot show rather than dropping it.
- **The shell is not a separate concept.** Header and Footer are rows in
  Templates and open the same editor, with a co-pilot. A blast has one too.
- **New campaign has no dropdown.** It creates an Untitled campaign and the
  header toggles blast or drip while it is a draft.
- **The node sheet edits the body.** Add block was a label; it is now the same
  block editor a template uses.
- **The unattended lane is whole.** `schedule_campaign` stages a draft as
  `PENDING_APPROVAL` with a note, **Waiting for you** on the overview lists what
  is staged, and Approve or Send back to draft finishes it. `update_node`
  changes one node without rewriting the graph.
- **The shell editor** at `/marketing/templates/shell` edits the header and the
  footer, so the locked rows point at a real door.
- **Add step** on the canvas appends an Email, a Wait or an Exit through the
  same validator the co-pilot uses.
- **Hold out** sits beside Add on a segment, so `excludeMember` has a button.
- **Every Paper comment on `/marketing` is resolved** — eleven of them, listed
  under "What the comments asked for" below. The page has none open.

---

## Fixed while finishing this list

**Website tracking lost every event from a first-time visitor.** The ingest
service wrote a `trackedEvent` pointing at a `trackedVisitor` row that nothing
ever created, so the foreign key rejected the whole batch and the collector
logged and swallowed it. It looked like 7 failing specs; it was the product.
`accept()` now upserts the visitor first.

**`bun run lint` passes across the repo.** Biome read Nest's
`app.useGlobalPipes(...)` as a React hook outside a component; the rule is off
for `apps/api/**`.

---

## What the comments asked for

Eleven threads on the `/marketing` page in Paper, all now resolved. The page has
no open thread left.

| Comment | What it meant | Done |
| --- | --- | --- |
| "Who gives a fuck about compilers?" | Settings copy leaked an implementation word | Rewritten |
| "Why do we need to share the DNS?" | Connect to verified Resend domains, never onboard one | Domain picker; no records anywhere |
| "Too verbose" | Tracking copy ran four lines | One line |
| "Turn these into a switch" | Open and click tracking were read-only text | Two switches that write to Resend |
| "This should be in the card header" | The Replace key button sat in the card body | `CardAction` |
| "Similar issue, buttons go in the card action header" | Same for Save | `CardAction` |
| "Delete this whole thing… card in card" | Domains were bordered boxes inside a bordered card | Plain rows |
| "No multi-line table cells!" | Segments, templates and campaigns stacked two lines in a cell | One line each |
| "Don't we need a full co-pilot here?" | The segment editor had no rail | Rail added, and every editor now has one |
| "Remove the Segment dropdown" | The new-campaign sheet asked too early | The sheet is gone; a campaign is created Untitled |
| "The current app looks nothing like this" | The templates list had no thumbnail and no checks | Glyph, Subject, Used by, Last edited, Checks |

## Found while using it

Reported 12 August 2026 from a real session with the co-pilot.

### 1. The co-pilot does not know how to build a segment

It took several turns to work out the tool sequence. The facets, the operator
names and the rule shape are all in the code and none of it is in the agent's
context.
Fix: done. `apps/agent/agent/skills/building-a-segment.md` lists every facet,
the tree shape and the order to call the tools in.

### 2. The co-pilot forgets the conversation on refresh

Reload the campaign page and the thread is empty. The chat product already
stores every message and replays it. Marketing must do the same.
Fix: done. `useSavedConversation` only ever sent `contactId`, `companyId` and
`dealId`, so the server refused a save with no record and nothing was stored.

### 3. The canvas does not repaint after the agent writes the graph

The agent reported twelve nodes. React Flow kept the old ones. The rows are in
the database, so this is a stale client cache, not a lost write.
Fix: done. `AgentPanel` takes eve's `onFinish`, and each editor invalidates its
own query on it.

### 4. The React Flow controls were invisible

Every `var(--color-*)` in `flow-tokens.css` named a variable that Tailwind
never emits, because `@theme inline` inlines those values instead. The zoom
buttons fell back to the library's light theme, so white icons sat on a white
button in dark mode, and the nodes had the library's 3px corners.
Fix: done. The file now names the base tokens (`--foreground`, `--card`), and
`--radius-sm/lg/xl` are real variables.

### 5. Two React children shared a key

`EmailGlyph` keyed its bars by width class, and two bars are `w-full`.
Fix: done. The key is the index and the class together.

---

## What is left

- **Paper has no board for the header and footer editor.** The Templates board
  lists them; the editor itself is only in the app.
- **The co-pilot on a header or footer has no preamble.** It opens with no
  record context, because the agent's template tools do not reach a partial.
- **Nobody has clicked any of this in a browser.** Every surface has specs and
  typechecks; the assembled pages are still unopened.

---

## Verified, so nobody re-checks it

- **A real email sent** through Resend from `mail.trycomp.ai` (verified domain),
  composed by the same renderer the preview uses, carrying the postal address,
  the unsubscribe link, resolved merge tags and both `List-Unsubscribe` headers.
- **The drain route** was returning 401 to cron because it lacked
  `@AllowAnonymous()` — the global guard ran before the controller's own secret
  check. Fixed and exercised.
- **`claimDueSends` binds the clock** as a parameter. Using `now()` against a
  naive `timestamp` column resolved through the session timezone and claimed
  nothing. Found by a spec.
- **The delivery webhook is exercised** with a real Svix signature: it records
  a delivery, suppresses the address on a hard bounce, refuses a forged
  signature and shrugs at an event for a send this install does not have.
- **The staging lane is exercised**: `stageCampaign`, `updateCampaignNode`, both
  preambles, `pending`, `approve`, `reject` and `setKind`. Add step is checked
  against the validator the server runs, which caught an email that saved with
  no subject.
- **1231 specs pass**: 399 api, 330 agent, 165 app, 172 `@crm/db` (engine, re-entry row by
  row, exit sweeps firing between touches, split stability across retries, blast
  idempotency, deliverability auto-pause, event retention, quiet hours, the
  daily cap, the graph validator), 61 telemetry, 43 auth, 17 env, 24 email render
  and lint, 15 ui (canvas nodes, autosave), 5 validation.

## Known unknowns

- **The assembled canvas page has never been opened in a browser.** Every node
  component is asserted to render; React Flow's own layout of them is not.
- **Two `react` copies** remain in `node_modules` (19.2.8 and 19.2.4). Harmless
  today, and the same class of duplicate resolution that broke the eve build and
  cost an afternoon.

## Deliberately not doing

Still deferred in §21, with the condition that brings each back: SMTP, double
opt-in, a preference centre with topics, campaign templates with drips built in,
automatic A/B winners, send-time optimisation, landing pages and a forms
builder. Nothing here is a gap.

---

## Three process notes worth keeping

**Paper drifts within a single session.** It went out of date three times while
this was being built, because the app kept changing after each sync. Syncing
Paper belongs in the definition of done for a change, not at the end of a batch.

**The design was ahead of the code twice.** The settings rate control and the
reply-to picker were both drawn and then not built. When Paper and the app
disagree, check which one is right before assuming it is Paper.

**Never `git stash` in this repository while other stashes exist.**
`git stash push -- <path>` saved nothing on one occasion, and the `git stash pop`
that followed applied somebody else's `WIP on main` entry over live work. It
conflicted in `.github/`, `CHANGELOG.md`, `CONTRIBUTING.md` and `package.json`.
Nothing was lost — a conflicted pop keeps the stash entry — but the recovery
cost twenty minutes. Use a scratch branch or a worktree instead.
