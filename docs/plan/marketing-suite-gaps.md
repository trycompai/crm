# Marketing suite — gaps against the Head of Growth review

Read `docs/marketing.md` and `docs/plan/marketing-suite.md` before you act on
this file. This document does not restate the rules. It lists what the Head of
Growth asks for, what the code does today, and what is missing.

The reference screenshots are HubSpot. HubSpot is the comparison, not the
target. Some of these gaps are deliberate calls in the plan. This file marks
those calls and does not reopen them.

## How to read the tables

| Column | Meaning |
| --- | --- |
| **Asked** | The Head of Growth's words |
| **Today** | What the code does now |
| **Gap** | What is missing |
| **Size** | S — one screen. M — a screen and a procedure. L — a schema change |

Every claim below names a file. Open the file before you argue with the claim.

---

## 1. The headline

Three gaps stop real work today. Everything else is polish.

1. **BROKEN — A drip can never get an audience.** The canvas has no segment
   picker. `CreateCampaignButton` makes a `DRIP` with `segmentId: null`. Only
   `blast-composer.tsx` writes `segmentId`. A drip therefore shows *"No segment
   yet — nobody starts here"* forever, and `sweepEntries` returns `0`.
2. **BROKEN — Nobody can see who opened, clicked or got stuck.**
   `marketingCampaigns.recipients` and `marketingCampaigns.enrolments` are live
   tRPC procedures. No screen calls either one. The numbers are totals only.
3. **NOT DONE — Nobody can send themselves a test of the email they wrote.**
   `marketing.sendTest` sends the *oldest template in the workspace* to the
   signed-in user. It ignores the campaign on screen.

The rest of this document is ordered by the Head of Growth's three areas.

---

## 2. Emails

The email overview is `/marketing/campaigns`
(`campaigns-table.tsx`). The email detail is the campaign editor
(`campaign-canvas.tsx` → `blast-composer.tsx`).

### 2.1 The overview list

| Asked | Today | Gap | Size |
| --- | --- | --- | --- |
| Search my emails | `ListSearch` searches `name` only | Subject line is not searched. `list()` filters `name: { contains: q }` in `marketing-campaigns.service.ts:57` | S |
| See open rate and click rate at a glance | Columns show **counts**: Sent, Opened, Clicked, Replied | No rate column. The rate is one division in the cell | S |
| Clone an email | No clone. Only templates have `duplicate` | `marketingCampaigns.duplicate` does not exist | M |
| Group into folders | No folders | No folder table, no column, no screen. Nothing in the repo mentions folders | L |

Two more findings on this screen:

- **An archived campaign disappears.** `list()` hard-codes
  `status: { not: "ARCHIVED" }`. The UI never sends a status filter. A person
  who archives a campaign cannot find it again.
- **The list runs 4 queries per row.** `list()` maps each row to four
  `marketingSend.count` calls. Twenty-five rows cost one hundred queries. One
  `groupBy` replaces all of them.

**Deliberate call, do not reopen:** the overview page hides open rate on purpose.
`overview.tsx` says why. That call covers the *dashboard*, not the list column.
A per-campaign open rate is already on the campaign screen.

### 2.2 The email detail

| Asked | Today | Gap | Size |
| --- | --- | --- | --- |
| Segments included | One `Select`, one segment | Only one segment enters a campaign. `MarketingCampaign.segmentId` is a single foreign key | L |
| Segments excluded | Nothing on the campaign | Exclusion lives inside a segment ("Hold out" members) or in a drip's `exitDefinition`. Neither is on the blast screen | L |
| Subject line | Present | None | — |
| Preview text | Present as "Preheader" | The word differs from the Head of Growth's word | S |
| From name and address | Workspace-wide, in Settings | `MarketingCampaign.fromName` and `fromAddress` are columns. `updateCampaignInput` does not accept them. No screen sets them | M |
| Reply-to per campaign | Workspace-wide fallback only | `updateCampaignInput.replyTo` exists. No screen sets it | S |
| Send myself a test | Sends the oldest template, not this email | See §1.3 | M |
| Clone this email | No | See §2.1 | M |
| Save as a template | No | `marketingTemplates.create` takes a document. No button hands the node's document to it | S |
| "View the preview" in a new page | Preview is an `iframe` inside the editor | No standalone preview route and no shareable URL | M |

**The excluded-segments gap is the biggest one in this section.** The Head of
Growth's screenshot excludes four segments from one send: customers, free
addresses, hard-core DND, and unengaged contacts. Today that needs one
hand-built segment carrying all four exclusions as rules. Editing the customer
rule then means editing every segment that excludes customers.

Two ways to close it:

- **`segmentIds` and `excludeSegmentIds`, both arrays.** A join table replaces
  the single foreign key. The compiler already answers "who is in this list", so
  the blast is `IN (any included) AND NOT IN (any excluded)`. This is the right
  shape and it is a schema change.
- **A "suppression segment" on the workspace.** One global exclusion applied to
  every send. Cheaper, and it does not answer the screenshot.

Take the first. The second grows a second concept for the same query, which
§13.2 of the plan warns against.

### 2.3 The analytics dashboard on an email

`campaign-results.tsx` shows eight numbers: sent, delivered, bounced,
complaints, opened, clicked, replied, unsubscribed. Every number is a total.

| Asked | Today | Gap | Size |
| --- | --- | --- | --- |
| See **who** opened | Totals only | `marketingCampaigns.recipients` returns per-send rows with `openedAt`, `clickedAt`, `repliedAt`. No screen calls it | M |
| Click a contact to inspect | No | The rows carry `contactId`. Route it into the record sheet | S |
| Export a list, e.g. everybody who clicked | No | **There is no CSV export anywhere in this codebase.** Not in marketing, not in contacts, not in deals | M |

The recipients procedure is finished server work with no client. A "Recipients"
tab beside "Flow" and "Results", filtered by opened / clicked / bounced /
unsubscribed, is the whole job.

### 2.4 Writing the email

The block editor (`packages/ui/src/components/email-blocks.tsx`) supports
heading, text, button, image, quote, divider, spacer and columns.

| Asked | Today | Gap | Size |
| --- | --- | --- | --- |
| Add text | Yes | None | — |
| Add images | Yes, **by URL only** | No upload. The field is a text input for `https://…`. The workspace logo is mirrored to blob by `runMarketingBrand`, so the blob path exists and is unused here | M |
| Targeting | See §2.2 | | |
| Subject and preview text | Yes | None | — |
| Test send | No | See §1.3 | M |

**No scheduled send.** `scheduleInput` accepts an `at` date. `blast-composer.tsx`
always calls `schedule({ id, at: null })`. The button says "Send now" and there
is no other button. A marketer cannot queue Tuesday 9am.

---

## 3. Segments

The builder is `segment-builder.tsx`. The compiler is
`packages/db/src/marketing/segments.ts`.

### 3.1 Segments are contacts, and only contacts

| Asked | Today | Gap | Size |
| --- | --- | --- | --- |
| A segment of contacts | Yes | None | — |
| A segment of companies | No | `compile()` returns `Prisma.ContactWhereInput`. `MarketingSegmentMember` holds `contactId` | L |
| A segment of deals | No | Same | L |

**Do not build three compilers.** §11 of the plan is explicit that one compiler
answers "who is in this list" for five callers. Three object types would make
fifteen answers.

The cheaper move answers the real ask. The Head of Growth wants *"companies who
have a deal"* so they can **email the people at those companies**. A company
segment is a contact segment with company-shaped rules. Four of those rules are
already in the compiler and hidden from the builder. See §3.2.

A true company or deal segment only earns its place when somebody exports it or
reports on it. Nothing in this review asks for that yet.

### 3.2 The builder hides a third of the compiler

The compiler accepts **24 facets**. `apps/app/lib/marketing-facets.ts` lists
**18**. These six are implemented, tested, and unreachable by a person:

| Facet | What it answers | Why it matters here |
| --- | --- | --- |
| `deal.atStage` | Has a deal at a named stage | *"Companies who have a deal"* |
| `field.equals` | Any live custom field, by key | The dynamic-fields work is invisible to marketing |
| `company.domainIn` | Domain in a list | Account lists, ABM |
| `marketing.openedCampaign` | Opened campaign X | Retargeting, the named use case |
| `marketing.clickedCampaign` | Clicked campaign X | Retargeting |
| `marketing.inCampaign` | Currently in drip Y | Exclude people already in a drip |

Adding them is one array in one file, plus a choice field for stage, campaign
and field key. This is the highest-value small change in the whole review.

`meeting.bookedWithin` and `meeting.notBookedWithin` are already exposed, so
*"has a meeting booked"* works today.

### 3.3 The builder cannot say "not", and cannot nest

`marketing-facets.ts` defines `UNSUPPORTED_RULE`: nested groups, negation, and
anything unreadable. The builder refuses all three and warns that saving drops
them.

The **compiler supports both**. `filterSchema` is
`{all} | {any} | {not} | {facet}` and it is recursive.

The Head of Growth asks for *"don't have a deal created yet"*. `deal.hasNoOpen`
covers that one case. It does not cover *"in Website visitors, not in Closed
won"*, which §11 of the plan names as the point of segments.

Today the only way to write a `not` is to ask the co-pilot. `write_segment`
writes the tree, and the builder then shows *"This editor cannot show a not
rule, so saving drops it"*.

**The save is guarded.** `segment-builder.tsx:200` disables Save while
`problems.length > 0`, and every unsupported rule is a problem. Nothing is
destroyed. Add a spec so the guard stays.

The guard has a cost. **Save is the only writer on that screen, so the whole
segment locks.** A person cannot rename it, cannot add a rule, and cannot remove
the rule that locked it. This holds for a `not`, for a nested group, and for
each of the six hidden facets in §3.2. A co-pilot-written segment is therefore
read-only to a person, which reverses the plan's rule that *direct manipulation
never goes away*.

Two fixes, and do both:

1. **Let the name save while the rules are locked.** Two fields, two writes.
2. **Support `not` and one level of nesting** in `RuleTree`. A per-rule "is / is
   not" toggle covers most of it and costs little. Exposing the six facets in
   §3.2 removes the commonest cause of the lock.

### 3.4 Using a segment elsewhere

| Asked | Today | Gap | Size |
| --- | --- | --- | --- |
| Use it in a campaign | Blasts yes, drips no | See §4.1 | M |
| Export it to use somewhere else | No | No CSV export exists | M |

---

## 4. Workflows

A workflow is a `DRIP` campaign. The canvas is `campaign-canvas.tsx`.

### 4.1 Targeting and exclusion

| Asked | Today | Gap | Size |
| --- | --- | --- | --- |
| Who enters this workflow | **No screen sets it** | Only `blast-composer.tsx` writes `segmentId`, and a drip never renders that composer | M |
| When they enter | `entryMode` is forced to `CONTINUOUS` for every drip | `entryDefinition` has no UI at all. No screen in `apps/app` mentions it | M |
| Who is excluded | No screen sets it | `exitDefinition` has no UI at all | M |

This is the worst gap in the suite. `sweepEntries` reads `segmentId` first and
falls back to `entryDefinition`. Both are unreachable from the canvas. A drip
built by a person, without the co-pilot, can never enrol anybody.

The entry node on the canvas already reads `entryLabel(campaign.segment?.name)`
and renders *"No segment yet — nobody starts here"*. It is `selectable: false`.
Making it selectable, and opening a sheet with a segment picker plus an exit
rule tree, closes all three rows above.

The exit sheet should also show the exits a drip gets for free — replied,
unsubscribed, bounced, meeting booked, deal moved. §13.2 of the plan lists them
and a marketer cannot see that they are on.

### 4.2 Building the structure

| Asked | Today | Gap |
| --- | --- | --- |
| Wait X days | `WAIT` node, `delayHours` | None |
| Send an email | `EMAIL` node with its own document | None |
| Exit the workflow | `EXIT` node | None |
| Branch on a condition | `BRANCH` node, compiled from the same facets | None |
| A/B a path | `SPLIT` node | None |
| Write the emails inside the workflow | `NodeSheet`, with desktop, mobile and plain-text render | None |

This part is built and it is good. The node sheet matches §13.5 of the plan.

Two smaller gaps:

- **No test send from a node.** Same gap as §1.3.
- **No re-enrolment display on the canvas.** `DripSettings` holds the cooldown
  and `maxPasses`. The canvas does not say "re-enrol off", which the HubSpot
  trigger card does.

### 4.3 Enrolment history

| Asked | Today | Gap | Size |
| --- | --- | --- | --- |
| See enrolment history | **No screen** | `marketingCampaigns.enrolments` returns status, pass, `currentNodeId`, `nextDueAt`, `exitKind`, `exitReason`, `enrolledAt`. Nothing calls it | M |
| Check if a contact got jammed | No | The rows above answer it. `nextDueAt` in the past with `status: ACTIVE` is a jam | M |

The canvas shows a per-edge count — `"12 here"` — which says *how many* are
waiting. It never says *who*. Troubleshooting needs the name.

An "Enrolments" tab beside "Flow" and "Results" is the fix, and the procedure is
already written.

### 4.4 The contact's own view

| Asked | Today | Gap | Size |
| --- | --- | --- | --- |
| See which workflows a contact is in | **No** | The contact sheet has four tabs: Overview, Deals, Activity, Agent. None is marketing | M |
| Enrol them | Yes | `ContactMarketingActions` → "Enrol in a drip" | — |
| Unenrol them | **No** | `marketingCampaigns.unenrol` is a live mutation. No screen calls it | S |

There is a further problem here that nobody asked about, and it is worse than
the missing tab.

**A marketing email never appears on a contact's timeline.** The marketing code
writes no `Activity` row. `packages/db/src/marketing` and
`apps/api/src/marketing` do not reference `Activity` anywhere. A rep opens a
contact, sees the Activity tab, and reads no sign that the contact got four
marketing emails last week. The rep then sends a fifth by hand.

Two fixes, and they are different:

- **A "Marketing" tab on the contact sheet** — enrolments, sends, opens, clicks,
  unsubscribe status, and an Unenrol button.
- **An `Activity` row per marketing send** — so the existing timeline is honest.
  Decide the volume question first. A daily newsletter to nine thousand people
  writes nine thousand activity rows a day.

---

## 5. Deliberate calls, so nobody reopens them

These look like gaps against HubSpot and are not.

| Looks missing | Why it is absent |
| --- | --- |
| An open-tracking pixel and a click redirect | Resend does both at the domain. §14 of the plan. Adding ours is a mistake |
| A per-node header or footer override | §8. The named HubSpot complaint. A capability we do not offer is a bug we cannot ship |
| Automatic A/B winners | §21. A tool that promotes a winner off 40 opens is worse than no tool |
| Landing pages and a form builder | §21. Tracked forms already file a contact |
| An open rate on the overview dashboard | Apple Mail Privacy Protection inflates it. `overview.tsx` says so on the screen |
| Goals as objects | §21. A goal is an exit rule with a reason |
| Sending from a rep's Gmail | Settled. A 2,000/day quota and one revoked token stops a campaign |

---

## 6. What shipped, and what is left

Sections 1 to 5 record the review as it was found on 12 August 2026. This
section records what changed after it. **Read it before you act on anything
above** — most of §1 to §4 is now history.

### Done

| # | What | Where it lives now |
| --- | --- | --- |
| 1 | The drip entry node opens an audience sheet — segment picker, entry rule, exit rule, manual or automatic entry | `audience-sheet.tsx`. `activate` refuses a continuous drip with no audience |
| 2 | Recipients and Enrolments tabs, filtered, clickable into the record sheet | `campaign-recipients.tsx`, `campaign-enrolments.tsx` |
| 3 | A real test send of the email on screen | `marketingCampaigns.sendTest`, `send-test.tsx` |
| 4 | The six hidden facets are in the builder | `marketing-facets.ts`, `use-marketing-facets.ts` |
| 5 | A locked segment saves its name | `segment-builder.tsx` |
| 6 | Unenrol, from the campaign and from the contact | `campaign-enrolments.tsx`, `contact-marketing.tsx` |
| 7–10 | Rate columns, subject search, a status facet including Archived, and the N+1 replaced by four `groupBy` calls | `campaigns-table.tsx`, `marketing-campaigns.service.ts` |
| 11 | Included and excluded segments, both arrays | `MarketingCampaignSegment`, `audience.ts` |
| 12 | CSV export, shared, paging through the API | `packages/ui/src/lib/csv.ts`, `export-csv.tsx`. Wired into recipients, enrolments, segments and contacts |
| 13 | A Marketing tab on the contact sheet | `contact-marketing.tsx` |
| 14 | Clone a campaign, save a node as a template | `duplicate`, `saveNodeAsTemplate` |
| 16 | Schedule a send for a named time | `schedule-send.tsx` |
| 17 | Per-campaign from-name and reply-to | `campaign-settings.tsx` |
| 18 | An is / is not toggle on every rule | `rule-tree.tsx`, `marketing-facets.ts` |

Three things were found while building and fixed with the rest:

- **The preheader was written, previewed and never sent.** No send carried it and
  the drain never passed one. `MarketingSend.preheader` now freezes it.
- **The daily cap could swallow a test.** `skipOverCap` counted every origin.
  It now counts `CAMPAIGN` and `DRIP` only.
- **An entry or exit rule could not be cleared.** `update` mapped `null` to
  `undefined`, which Prisma reads as *leave it alone*. It writes `DbNull` now.

Two things arrived from the same conversation and are not in the list above:

- **Right-click a node to delete it.** It stitches the neighbours together,
  takes the arms nothing else reaches, and asks first when it would. The server
  already refuses to delete a node people are standing on.
- **Campaign settings replaced drip settings**, so a blast has them too.

The last four were decided and built on the same day:

| # | What | Decision |
| --- | --- | --- |
| 15 | Image upload in the block editor | Built. PNG, JPEG and GIF only — Outlook draws nothing else. 2 MB cap. Refuses with *paste a URL instead* when the install has no blob token, so a self-hoster loses a capability rather than the screen |
| — | A standalone preview URL | Built. `/{slug}/marketing/preview/{nodeId}`, opened in a new tab from both composers, with desktop, mobile and plain text |
| — | An `Activity` row per marketing send | **Built, on the Head of Growth's call.** One row per successful send. It never bumps `lastActivityAt` — see `docs/marketing.md`, because that would let a drip keep somebody out of *Quiet for 60 days* |
| 19 | Folders | **Decided: neither, for now.** The list has search, a kind facet and a status facet. Revisit when 93 emails actually become unfindable. A saved view is the cheaper answer when it does |

---

## Issues

1. RISK — `ExportCsv` pages the API from the browser and stops at 50,000 rows.
   A larger export silently ends there; only the toast says so. I caused this.
   Fix: not done. A server-side export needs a job and a download.
2. RISK — One `Activity` row per send is the chosen behaviour, and it is real
   volume. A daily newsletter to nine thousand people writes nine thousand rows
   a day. Nothing prunes them.
   Fix: not done. Watch the table, then decide on retention.
3. RISK — A campaign's audience count is a live query, so a blast that takes
   minutes to queue can send to a slightly different set than the screen showed.
   This predates the review.
4. UNKNOWN — No browser ran. Every screen here is verified by the type checker
   and the suite, not by eye.
