# Build prompt — connections

Hand this to a build agent. It is a spec, not a wish: every screen exists in
Paper, every node ID below is real, and the agent is expected to read the design
rather than invent one.

Iterate on this file rather than re-typing it. `v0.2`.

**Ten steps, eight screens. Every screen is its own step. None of them is
optional, and none of them is a variation you can fold into another — the two
"before" states in particular are the whole point of the set.** Work the coverage
checklist at the bottom before you claim to be done.

---

## Before you write a line

Read, in this order:

1. `docs/connections.md` — the rules for this area. Non-optional.
2. `docs/design.md` — colour, radius, type.
3. `docs/api.md` — before touching `apps/api`.
4. `.agents/skills/nestjs-trpc/SKILL.md` and `.agents/skills/shadcn/SKILL.md`.

Then open the Paper file and look at what you are building:

```
mcp__paper__open_file  → 01KZ72S23CM00WXN6S1MP68M03, page 1-0 ("crm - grim")
mcp__paper__get_screenshot  → each frame ID in the table below
mcp__paper__get_jsx / get_computed_styles  → exact values, never read from a screenshot
```

Tell the user which docs and skills you read before you start.

## The eight screens

| # | Frame | Node | Position | Route / state |
| --- | --- | --- | --- | --- |
| 3 | Index, populated | `K10-0` | 4554, 12945 | `/settings/connections` |
| 4 | Index, empty | `KLY-0` | 4554, 14235 | same route, nothing connected |
| 5 | Add connection | `L0I-0` | 8272, 14235 | dialog over the index |
| 6 | Slack, before connecting | `KOP-0` | 6413, 14235 | `/settings/connections/slack`, not connected |
| 7 | Slack, match people | `LEI-0` | 6413, 15525 | `/settings/connections/slack/people` |
| 8 | Slack, connected | `KDC-0` | 8272, 12945 | `/settings/connections/slack` |
| 9 | Intake endpoint | `K9K-0` | 6413, 12945 | `/settings/connections/intake` |
| 10 | Builder asks where to post | `LLM-0` | 8272, 15525 | `/chat/:chatId` |

Steps 3–8 are one continuous journey: nothing connected → pick something →
see what you are granting → connect → match your people → live connection.
Build them in that order and each one hands off to the next.

Shared chrome, clone rather than rebuild: icon rail `K3O-0` (56px), settings nav
`K4N-0` (213px), content viewport `K54-0` (1510px).

Brand SVGs on canvas: Google `KK0-0`, Slack `KKI-0`, HubSpot `L5E-0`, Docusign
`L5Z-0`, Ergo `KJJ-0`.

## What exists today

`apps/app/app/(app)/[slug]/settings/connections/` has `page.tsx`,
`google-connection.tsx`, `microsoft-connection.tsx` — Google and Microsoft only,
two inbound sources each, an auto-create toggle, sync status. No outbound, no
Slack, no agent linkage, and **no empty state and no pre-connect state at all**.

`apps/api/src/google/google.router.ts` is the shape to follow for a connection
module: `status`, `syncNow`, `revokeAccess`, `purgeSyncedData`, `setAutoCreate`.

Reusable: `packages/ui/src/components/questionnaire.tsx`, `entity-logo.tsx`,
`brand-logos/*`, `sheet.tsx`, `dialog.tsx`, `switch`, `empty.tsx`.

---

## Step 1 — Page tokens

Add to the Tailwind theme, values exactly as in `docs/connections.md`:
`--spacing-page-top` 40px, `--spacing-page-bottom` 40px, `--spacing-page-inline`
24px, `--spacing-page-gap` 24px, `--spacing-block-inline` 20px,
`--container-page` 820px, `--container-page-wide` 1120px, `--container-narrow`
560px, `--container-sheet` 640px.

Nothing after this step may use a literal page metric.

## Step 2 — Brand marks

Extract path data from Paper nodes `L5E-0` (HubSpot), `L5Z-0` (Docusign),
`KJJ-0` (Ergo) into `packages/ui/src/components/brand-logos/hubspot.tsx`,
`docusign.tsx`, `ergo.tsx`, shaped exactly like the existing `stripe.tsx`:
a single default-exported component taking `React.SVGProps<SVGSVGElement>`,
`viewBox="0 0 24 24"`, `aria-hidden="true"`, brand hex inline.

Do not invent paths. If a node will not yield clean data, stop and say so.

## Step 3 — Index, populated — `K10-0`

Column `KJU-0` at `--container-page`, **top-aligned** so nothing jumps when a row
is added. Four connection cards (`KJY-0` Google, `KKG-0` Slack, `KKZ-0` Ergo,
`KLI-0` HubSpot), each a card with `--spacing-block-inline` padding:

- Row 1: brand mark 20px, name, status text right-aligned, Manage button.
- Row 2: a two-column `Brings in` / `Sends` block. Label lane is fixed width;
  use `flexShrink: 0` so the value lane starts at the same x on every card.

Copy is plain language. No scope tokens, no mono, no arrows. `Sends` says
"Nothing, so nothing here can change HubSpot" when a connection is read-only —
that sentence is load-bearing, keep it.

## Step 4 — Index, empty — `KLY-0`

**Its own screen, not a conditional afterthought.** This is what a new workspace
sees, and it is the only screen that has to argue for connecting anything.

Viewport `KNE-0`, body `KNH-0` **centred vertically** (a fixed amount to say, so
the whitespace is symmetric — do not top-align this one).

- Heading block `KNI-0` — "Nothing is connected yet" (`KNJ-0`), then the cost of
  not connecting (`KNK-0`): "Right now every deal, contact and note has to be
  typed in by hand. Connect a tool and the CRM starts filling itself in from the
  work your team already does." Lead with the cost, not the feature.
- Starter list `KNL-0` at `--container-narrow`, three rows: `KNM-0` Ergo,
  `KNY-0` Google Workspace, `KO9-0` Slack. Each is mark + name + one line of
  what it does + a Connect button.
- **All three Connect buttons are secondary.** A filled button here would claim
  one integration is *the* action, and none is. Ergo sits first, which says the
  same thing quietly.
- Footer `KOL-0` — "Looking for something else? Browse all connections", opening
  step 5.

## Step 5 — Add connection dialog — `L0I-0`

Overlay `L47-0`, dialog `L48-0` at `--container-narrow`. Rows `L4E-0` Stripe
(hover/selected state), `L4K-0` Docusign, `L4R-0` "Anything else" — which routes
to the intake page in step 9, because a generic endpoint is a real answer to
"my tool isn't listed". Footer names what is already connected.

The overlay is offset so the dialog centres over the **content column**, not the
window. Match that: the settings nav is 213px and the rail 56px.

## Step 6 — Slack, before connecting — `KOP-0`

**Its own screen.** What you see before granting anything. If this is skipped,
the first thing a user learns about Slack access is an OAuth consent screen they
did not write.

Viewport `KQ5-0`, body `KYP-0` **centred vertically**, column `KYQ-0`. Flat
sections, no card chrome.

- Title `KYR-0` — mark + "Slack" + "Not connected" right-aligned, then the
  framing line: "Connecting Slack gives the CRM a way in and a way out. What it
  actually does with that is up to you afterwards, one automation at a time."
- `KZ3-0` — "What you are handing over", three checked lines. These are the
  **OAuth scopes in plain words**, which is all this page can honestly know.
- `KZI-0` — "What it will never do", three lines with × marks. The important
  half: "Send anything at all until you build an automation and switch it on."
- `KZX-0` — Connect Slack (the one filled button on the page) plus "You approve
  the workspace in Slack. You can disconnect it here at any time."
- `L02-0` — "Afterwards, most teams start with one of these", three cards
  (`L08-0`, `L0B-0`, `L0E-0`), explicitly labelled **"Suggestions, not settings.
  None of them exist until you pick one and switch it on."**

Do not put specific automations above the fold as if they were configuration.
This page cannot know which automations you want; it only knows the scopes.

## Step 7 — Slack, match people — `LEI-0`

Post-OAuth step. Body `LHQ-0` centred, column `LHR-0`. Table `LI3-0`, rows
`LI8-0`, `LIH-0`, `LIR-0`, `LJ0-0`.

Every value sits in one vertical lane: name column 300px `flexShrink: 0`, value
lane, then an 80px trailing lane. Matched rows render the handle inside a
transparent-bordered box with the same height and padding as the picker, so text
aligns exactly. No check icons — the handle already says it matched.

`LIR-0` is the unmatched row: an active select reading "No Slack account with
that email". `LJA-0` explains that unmatched is allowed and what happens then:
the automation stops and says so rather than guessing at a similar name.
`LJJ-0` is the continue action.

API: match on email, expose `status`, `matches`, `setMatch`, `clearMatch`.
Unmatched is a valid persisted state, not an error.

## Step 8 — Slack, connected — `KDC-0`

Body `LJO-0`, column `LJP-0`. Three sections:

- `LK2-0` — "What an agent can do here", three checked lines. Flat.
- `LKH-0` — "Agents that use Slack". Header says "Built in chat, not here."
  Three **read-only** agent cards (`LKO-0`, `LKV-0`, `LL3-0`): name, one-line
  description, status dot + label in a fixed 76px lane, linking to
  `/agents/:agentId`. Then `LLA-0`, a row that opens the builder.
- `LLG-0` — People summary ("3 of 4 … Dan is not, so nothing will message him")
  with a Review link back to step 7.

**No toggles. No Edit buttons. No trigger UI.** If the design seems to want one,
re-read the ownership rule in `docs/connections.md`.

## Step 9 — Intake — `K9K-0`

Flat page, no card chrome on sections. Body `KRC-0`, column `KRD-0`.

- Title block `KRE-0` — heading, one-line subtitle, then a liveness row: green
  dot + "Last call arrived 31 minutes ago", divider, amber dot + "1 call needs a
  look", then "Open activity" in `--color-dark-ring`.
- Address block `KRI-0` — endpoint chip is its own inset surface: `POST` badge in
  `--color-primary`, URL in `--font-mono`. Mono is correct here; it is a URL.
- Code block `KS0-0` — real formatted JSON, two-space indent, keys in
  `--color-dark-code-foreground`, strings in `--color-dark-code-string`,
  punctuation in `--color-dark-code-gutter`.
- Permissions `KT4-0` — six rows (`KT9-0` Companies, `KTF-0` People, `KTM-0`
  Deals, `KTS-0` Notes, `KTZ-0` Moving a deal forward, `KU5-0` Quotes), each a
  real Switch with a plain sentence. The two off rows state *why* they are off.
  No "4 of 6 enabled" counter — it says nothing and affords nothing.

## Step 10 — Builder asks where to post — `LLM-0`

The payoff. When the builder cannot derive a destination it asks in chat.

Card `LRR-0` in the conversation lane. Header `LRS-0` — brand mark + question
(`LS0-0`), description saying why (`LS1-0`). Choices `LS3-0` — `LS4-0` selected,
`LS8-0` unselected, `LSC-0` the escape hatch. Footer `LSG-0` — the constraint
(`LSH-0`), and a submit that restates the answer, "Use #sales" (`LSJ-0`).

Build this on `packages/ui/src/components/questionnaire.tsx`. Do not write a
parallel renderer — `agent-clarification-composer.tsx` and
`builderQuestionResponseInput` already carry this.

Agent side (`apps/agent`, read `docs/agent.md` first): the builder must classify
each destination as derived or chosen, resolve derived ones silently, and raise
one question per chosen one. Slack becomes taggable by extending the integration
id space that `builderResource.kind` already supports.

---

## Coverage checklist

Tick every row. A screen is not done because its route renders — it is done when
the state in the named frame is reachable in the running app.

| Node | Screen | Reachable by | Done |
| --- | --- | --- | --- |
| `K10-0` | Index, populated | visiting `/settings/connections` with ≥1 connection | ☐ |
| `KLY-0` | Index, empty | same route with **zero** connections | ☐ |
| `L0I-0` | Add connection | "Add connection", and "Browse all connections" from `KLY-0` | ☐ |
| `KOP-0` | Slack, before connecting | Slack detail while **not** connected | ☐ |
| `LEI-0` | Slack, match people | returning from OAuth, and the Review link on `KDC-0` | ☐ |
| `KDC-0` | Slack, connected | Slack detail while connected | ☐ |
| `K9K-0` | Intake | `/settings/connections/intake`, and "Anything else" in `L0I-0` | ☐ |
| `LLM-0` | Builder asks | tagging Slack in the builder and describing a post to a standing channel | ☐ |

If you cannot reach `KLY-0` or `KOP-0` without editing the database by hand, they
are not done — add whatever seeding or state toggle the team needs to see them.

## Definition of done

- All eight rows above ticked.
- Every page metric is a token.
- No connection page can author or edit an automation.
- The intake page shows liveness above the fold.
- An unmatched person is persistable and blocks nothing.
- The builder asks for chosen destinations and never guesses.
- HubSpot, Docusign and Ergo render real marks.
- Biome and `tsc` clean. Note that `packages/ui/src/components` is Biome-excluded,
  so lint will not catch anything you put there — check it by hand.
- No code comments. No `Co-Authored-By`.

## Where to stop

Not in scope, and the design does not exist yet: the delivery/activity log. Both
the intake and Slack pages link to it ("Open activity"). Wire the link to a
route that 404s cleanly, or omit it — do not invent that screen.

Also undecided: the connection page still shows "Pause all sending" in the top
bar. That now overlaps with pausing each agent. Ask before building it.
