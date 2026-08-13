# Plan — Marketing suite

Campaigns — one-off sends and branching drips — with templates and segments, in
one section with its own sidebar, for a marketing team of two or three who
currently do this in HubSpot and use a tenth of it.

This document is the design record — what we decided and why. The build order —
files, procedures, phases, tests — is
[`marketing-suite-build.md`](./marketing-suite-build.md), which points back here
for the model in §6 rather than copying it.

Read it with [`AGENTS.md`](../../AGENTS.md), [`api.md`](../api.md),
[`agent.md`](../agent.md), [`design.md`](../design.md),
[`tracking.md`](../tracking.md) and [`telemetry.md`](../telemetry.md). The three
skills it was written against are `.agents/skills/react-email`,
`.agents/skills/resend` and `.agents/skills/email-best-practices`.

---

## 1. What this is, and what it is not

**Is:** a list you can define, a template you can make beautiful, a one-off send
to that list, a **drip that branches** and follows up over weeks, and a record of
what happened at every touch. Every one of those reachable by the agent as well
as by a person — and buildable by talking to it.

**Is not**, and should not become: landing pages, a forms builder (tracked forms
already exist — `docs/tracking.md`), ad management, social scheduling, a CMS,
lead scoring (that is the agent's job and it is not a number), or SMS. Each is
deferred in §21 with the condition that would bring it back.

**Two things left that list on 11 August 2026**, after the Growth call: the
branching canvas and A/B testing. The earlier draft deferred both on the grounds
that a canvas is a layout engine and a quarter of work. That was the wrong call
for the wrong reason — the expensive part of a canvas is the *engine*, and we
need the engine anyway the moment a drip can bifurcate. React Flow draws the
picture; §13 is the engine, and it is the centre of this plan rather than an
appendix to it.

The measure of the thing is that a marketer can go from "we should email the
people who visited pricing and never booked a demo, then follow up differently
depending on whether they open it" to a live drip without asking an engineer and
without reading a manual.

## 2. The section

A sidebar exactly like Settings', because a rep already knows how that one
behaves and there is nothing to gain by being different:

```
/marketing              Overview      (designed later — §20)
/marketing/campaigns    Campaigns     one-off sends and drips, one list
/marketing/campaigns/[campaignId]     the drip canvas and its chat rail (§13.5)
/marketing/templates    Templates
/marketing/segments     Segments
/marketing/settings     Settings

/marketing/setup/connect     the wizard — no rail, no sidebar (§17)
/marketing/setup/identity
/marketing/setup/branding
/marketing/setup/test
```

`marketing-sidebar.tsx` is `settings-sidebar.tsx` with its own `ITEMS` and its
own `aria-label`; the layout is the same two-line file. **Do not generalise the
two into one shared sidebar component on the way past.** They are the same
today and the first thing the marketing one will grow — a live "3 sending" badge
on Campaigns — is the thing a shared component would then have to grow a prop
for.

**A full-page editor drops the sidebar.** The drip canvas, the template editor
and the segment builder each keep the app header and the icon rail and nothing
else: all three carry a working surface *and* a co-pilot rail (§13.6), and the
marketing sidebar is 224px of nav that somebody editing one thing is not using.
The icon rail stays because you need a way out and it costs 56px — these are
pages, not modals, and they must not feel like ones. A breadcrumb
(**← Campaigns**, **← Templates**) sits in the page header.

The rule is *editor, not list*. The four list pages keep the sidebar, because
moving between them is exactly what somebody on a list is doing. Nothing here is
per-screen taste: the same question — is this a place you browse, or a place you
work? — answers it every time somebody adds a screen.

That makes three layouts in the section: the app shell, the wizard's
full-screen with no chrome at all, and the editor. Three is one more than the
earlier draft wanted, and it is right anyway.

The icon rail gets **Marketing** (`Bullhorn`), between Deals and Settings, and a
`/marketing` case in `section-prefetch.ts` prefetching `campaigns.list`. The
rail prefetches its section; a new entry that does not is a new entry that feels
slower than the five beside it.

**Nothing redirects.** Not `proxy.ts`, not a layout, not a page. The rail's
**Marketing link simply points at the right place** — `/marketing/setup/connect`
until setup is finished, `/marketing` after. A link that already knows where it
goes beats a navigation that lands somewhere and bounces.

**One SSR read, in the app shell, passed down as a prop.**
`[slug]/layout.tsx` resolves the flag once and hands it to `AppIconRail`, which
is a client component and takes a boolean. The file already has the pattern:
`WorkspaceHeader` is an async server component inside a `Suspense` boundary that
fetches and renders the client `AppHeader` with props. This is the same shape
around the rail, inside the `AppIconRailFallback` boundary that is already there.

- **A cheap query of its own.** `marketing.status` → `{ onboarded }`, not
  `marketing.settings` — the settings payload carries a masked key and a dozen
  fields, and the shell needs one boolean. It is read on every page in the app,
  so it should cost a boolean.
- **It must never break the shell.** The rail renders above every screen in the
  CRM. The read is caught the way `workspacePromise` is caught, and an
  unreadable status **defaults to onboarded** — pointing at `/marketing` and
  letting that page explain itself is a small wrong answer, whereas trapping
  somebody in setup, or failing the layout, breaks the whole app for a feature
  they may not use.
- **`section-prefetch.ts` follows the same flag**, or it warms a list the click
  is not going to.

**The trade-off, stated rather than discovered:** typing `/marketing/campaigns`
into the address bar still reaches Campaigns with nothing configured. That is
accepted. Those pages show their own empty state with a link to setup, which is
what they need anyway for the workspace that has finished setup and simply has
no campaigns yet.

`/marketing/setup/*` still sits **outside the marketing layout**, now purely
about chrome rather than about redirects: it has no rail and no sidebar, and a
layout that conditionally deletes its own chrome is a layout with two
personalities. Sibling route groups give the same URLs with different layouts:

```
(marketing)/marketing/          layout.tsx — the sidebar
                                page, campaigns, templates, segments, settings
(marketing-setup)/marketing/    no layout of its own
                       setup/[step]/page.tsx
```

Route groups do not appear in the URL, so both still serve `/marketing/…` and
the paths do not collide. **Verify against
`apps/app/node_modules/next/dist/docs` before building it** — `apps/app/AGENTS.md`
is explicit that this Next.js is not the one in anybody's training data, and
layout nesting is exactly the kind of rule it may have changed.

## 3. Sending lives in the API

The transport, the queue and the drain are all `apps/api`. The agent reaches
them by writing the same rows the UI writes.

| | |
| --- | --- |
| **`apps/api`** | `src/marketing/` — tRPC for campaigns, templates, segments and settings; the Resend client; the drain; the webhook |
| **`packages/email`** | The renderer and the rules. Pure, imported by all three |
| **`@crm/db/marketing`** | The write paths the API and the agent share — recipients, materialisation, claiming, settling, `assertSendable` |
| **`apps/agent`** | Tools only. It writes a `MarketingSend` row and asks the API to drain; it never opens a socket to a mail provider |

**This is not the exception to *no vendor client in Nest* that it first looks
like.** That rule is about intelligence — enrichment, scoring, research,
identity — and `docs/api.md` names what the API is *for* in the same breath:
HTTP, auth, tRPC **and the mailbox sync**. `MailboxApiClient` already makes
bearer-token calls to `gmail.googleapis.com` and `graph.microsoft.com` from
Nest, on a five-minute cron, and nobody has ever thought that a breach. Mail is
the API's. Resend is a mail provider, not a data vendor: it decides nothing
about a person, it delivers a message somebody already wrote.

What *would* breach the rule is putting the composition, the segment reasoning
or the "who should get this" question in Nest. None of that is here — the
segment is a compiled query, the document is a stored value, and the send is a
row with a `dueAt`.

**`docs/api.md` still needs a sentence**, because today it says the exchange-rate
fetcher is the one documented exception, and a reader who finds `resend` in the
API's `package.json` deserves better than inference. The change is to name the
mailbox pipeline and marketing sending together as *what the API sends and
receives mail with*, and leave the intelligence rule untouched.

### The drain

`MarketingDrainService`, on the pattern `TelemetryService` already uses, because
this install ships in two shapes and both have to work:

- **In-process**, every 30 seconds, for a long-running container.
- **`POST /internal/marketing/drain`**, in `apps/api/vercel.json` at
  `* * * * *`, for a serverless deployment where nothing stays warm.

The tick is claimed under a row lock before anything is read, so two of them
produce one drain rather than two. It claims sends with
`FOR UPDATE SKIP LOCKED`, exactly as `claimDue` does in the agent.

**Scheduling a campaign does not send it in the request.** `apps/api` on Vercel
is a serverless function, and `docs/agent.md` is explicit about what happens to
work detached after a response: the tail of that chain is not guaranteed to run
at all. So the mutation writes rows and returns, the UI says *sending starts
within a minute*, and the drain is the thing that is a fact rather than a hope.

The route accepts `Bearer CRON_SECRET` **or** `AGENT_BRIDGE_SECRET`, so the
agent can ask for a drain the moment it queues a one-off send — the mirror of
`AgentTriggerService.poke()`, pointing the other way. **Unset means refuse, not
open**, as everywhere else. Nothing depends on the poke: an install with neither
secret still sends, one tick later.

## 4. Resend only, and we let it do its job

**v1 is a Resend integration.** Not a transport abstraction with Resend as the
first implementation — one vendor, named in the code, with SMTP deferred to §21.
An interface with one implementation is a guess about the second one, and this
guess would have been wrong in an expensive direction: half of what follows only
exists because Resend does it for us.

**Where the line falls.** Anything about *this message to this person* is ours.
Anything about *how mail leaves the internet* is Resend's, and we read it rather
than rebuild it:

| Resend's | Ours |
| --- | --- |
| The DNS records, and whether each has resolved | Who is in the segment |
| DKIM signing, the return path, TLS | What the email says |
| Open and click measurement | Suppression and consent |
| Bounce and complaint classification | The unsubscribe token and page |
| Delivery retries | The queue, the schedule, the frozen audience |

Three consequences, each of which deletes something the earlier draft was going
to build:

- **We never compose a DNS record.** `domains.create` returns `data.records` —
  MX, the SPF TXT and the DKIM CNAME — and we render them verbatim, poll
  `domains.get` for per-record status, and call `domains.verify`. Hand-writing
  `v=spf1 …` means maintaining a string whose correct value is the vendor's to
  decide, and being wrong about it silently. **Use a subdomain** (`send.acme.com`);
  the records land there and cannot collide with the MX that carries the team's
  own mail.
- **We never serve a tracking pixel.** `openTracking` and `clickTracking` are
  booleans on the Resend domain. Our toggle calls `domains.update`; opens and
  clicks arrive as `email.opened` and `email.clicked` webhooks. That removes
  `/api/m/o/:token`, `/api/m/c/:token`, the HMAC tokens and the link rewriter
  from the build entirely.
- **The click-tracking caveat is real and must be said on screen.** With click
  tracking on, Resend rewrites **every** link in the body, including an in-body
  unsubscribe link. The `List-Unsubscribe` header is not rewritten, so one-click
  still resolves directly. The tracking settings say so rather than leaving
  somebody to discover it in a redirect chain.

**We still own the list.** Resend's Audiences, Contacts, Segments, Topics and
Broadcasts stay unused, for two reasons that survive the narrowing:

1. **The segment is a query over the CRM.** "Visited pricing twice, no reply in
   30 days, deal not closed" is a join across `TrackedEvent`, `EmailMessage` and
   `Deal`. Nothing we could sync to a vendor audience would answer it, and a
   nightly export that half-answers it is worse than none.
2. **One suppression list, and it outlives the contact.** Unsubscribes must hold
   across every drip and blast and after the `Contact` row is deleted. A list
   that lives at the vendor cannot do the last one.

We do mirror what the vendor knows: `email.bounced` and `email.complained`
become `MarketingRecipient.status` (§16).

## 5. One address, one row

Everything the send path needs to know about an address lives in
**`MarketingRecipient`**, one permanent row per normalised address:

- **May we send?** `status` — `SUBSCRIBED`, `UNSUBSCRIBED`, `BOUNCED`,
  `COMPLAINED`. The one check before every send, and it is in
  `@crm/db/marketing`, not in a caller.
- **Why may we send?** `consentBasis`, `consentAt`, `consentSource`. GDPR asks
  who, when and how; this is where the answer is kept.
- **How does one stop?** `token`, a cuid, unique, minted with the row. The
  unsubscribe URL is `/u/<token>` and it never expires — which beats CAN-SPAM's
  30 days and CASL's 60 by not having a clock at all. A token on the *send* row
  would have tied the link's life to a retention sweep, and then the sweep would
  have had to defend a legal minimum it does not know about.
- **How often?** `lastSentAt`, for the frequency cap.

**It is keyed by `normalizeEmail` from `crm/values.ts`** — the same canonicaliser
as contact creation and `SuppressedContact`. One canonicaliser, as everywhere
else.

Three rules that follow, and each has a failure mode behind it:

- **It is not `SuppressedContact`.** That table means *a rep deleted this person,
  do not let the inbox recreate them*. This one means *this person asked us to
  stop marketing at them*. Merging them would make `allowAgain` — which lifts
  suppression when a rep adds the contact back — silently resubscribe somebody
  who unsubscribed. They must not share a table and they must not share a
  helper.
- **Deleting the contact does not delete the row.** `contactId` is
  `onDelete: SetNull`. The address stays unsubscribed forever, which is the whole
  point of a suppression list.
- **Unsubscribe is marketing-only.** It stops blasts and drips. It does
  not touch the mailbox sync, a rep's own reply, or anything transactional.

## 6. The model

Prefixed `Marketing*` throughout. `EmailThread` and `EmailMessage` already mean
*a conversation in a rep's mailbox*; a `MarketingCampaign` sending an
`EmailMessage` would be two unrelated things wearing one name in a schema people
grep.

```prisma
enum MarketingStatus       { SUBSCRIBED UNSUBSCRIBED BOUNCED COMPLAINED }
enum MarketingConsent      { FORM IMPORT MANUAL DOUBLE_OPT_IN }
enum MarketingPartialKind  { HEADER FOOTER }
enum MarketingSegmentKind  { DYNAMIC STATIC }
enum MarketingMemberMode   { INCLUDE EXCLUDE }
enum MarketingCampaignKind { BLAST DRIP }
enum MarketingEntryMode    { MANUAL CONTINUOUS }
enum MarketingCampaignStatus {
  DRAFT PENDING_APPROVAL SCHEDULED SENDING SENT ACTIVE PAUSED DRAINING
  CANCELLED ARCHIVED FAILED
}
enum MarketingExitKind { GOAL RULE SUPPRESSED MANUAL ARCHIVED }
enum MarketingNodeKind { EMAIL WAIT BRANCH SPLIT EXIT }
enum MarketingSendStatus {
  QUEUED SENDING SENT DELIVERED BOUNCED COMPLAINED FAILED SKIPPED
}
enum MarketingEventType {
  SENT DELIVERED OPENED CLICKED REPLIED BOUNCED COMPLAINED UNSUBSCRIBED
  FAILED DELAYED
}
enum MarketingSendOrigin      { CAMPAIGN DRIP DIRECT TEST }
enum MarketingEnrolmentStatus { ACTIVE COMPLETED EXITED PAUSED FAILED }

model MarketingRecipient {
  id      String @id @default(cuid())
  address String @unique
  token   String @unique @default(cuid())

  contactId String?
  contact   Contact? @relation("RecipientContact", fields: [contactId],
                                references: [id], onDelete: SetNull)

  status       MarketingStatus @default(SUBSCRIBED)
  statusReason String?
  statusAt     DateTime?

  consentBasis  MarketingConsent?
  consentAt     DateTime?
  consentSource String?

  lastSentAt DateTime?
  sends      MarketingSend[]
  createdAt  DateTime @default(now())

  @@index([status])
  @@index([contactId])
  @@map("marketingRecipient")
}

model MarketingPartial {
  id        String               @id @default(cuid())
  kind      MarketingPartialKind
  name      String
  document  Json
  isDefault Boolean              @default(false)

  archivedAt DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([kind, isDefault])
  @@map("marketingPartial")
}

model MarketingTemplate {
  id        String  @id @default(cuid())
  name      String
  subject   String
  preheader String?
  document  Json

  headerId String?
  footerId String?

  archivedAt DateTime?
  createdById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("marketingTemplate")
}

model MarketingSegment {
  id          String               @id @default(cuid())
  name        String               @unique
  description String?
  kind        MarketingSegmentKind @default(DYNAMIC)
  definition  Json

  lastCount     Int?
  lastCountedAt DateTime?

  members   MarketingSegmentMember[]
  archivedAt DateTime?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@map("marketingSegment")
}

model MarketingSegmentMember {
  segmentId String
  segment   MarketingSegment @relation(fields: [segmentId], references: [id],
                                        onDelete: Cascade)
  contactId String
  contact   Contact @relation(fields: [contactId], references: [id],
                              onDelete: Cascade)
  mode      MarketingMemberMode @default(INCLUDE)
  addedById String?
  addedAt   DateTime @default(now())

  @@id([segmentId, contactId])
  @@index([contactId])
  @@map("marketingSegmentMember")
}

model MarketingCampaign {
  id     String                  @id @default(cuid())
  name   String
  kind   MarketingCampaignKind   @default(BLAST)
  status MarketingCampaignStatus @default(DRAFT)

  segmentId String?

  entryMode       MarketingEntryMode @default(MANUAL)
  entryDefinition Json?
  exitDefinition  Json?

  reentryCooldownDays Int?
  maxPasses           Int @default(1)

  fromName    String?
  fromAddress String?
  replyTo     String?

  trackOpens  Boolean @default(false)
  trackClicks Boolean @default(false)

  scheduledAt DateTime?
  activatedAt DateTime?
  startedAt   DateTime?
  finishedAt  DateTime?

  approvedById String?
  approvedAt   DateTime?
  createdById  String?

  totalRecipients Int @default(0)
  nodes           MarketingCampaignNode[]
  edges           MarketingCampaignEdge[]
  enrolments      MarketingEnrolment[]
  sends           MarketingSend[]
  attachments     MarketingAttachment[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status, scheduledAt])
  @@index([kind, status])
  @@map("marketingCampaign")
}

model MarketingCampaignNode {
  id         String            @id @default(cuid())
  campaignId String
  campaign   MarketingCampaign @relation(fields: [campaignId],
                                          references: [id], onDelete: Cascade)
  kind  MarketingNodeKind
  label String?

  templateId String?
  subject    String?
  preheader  String?
  document   Json?

  delayHours Int?
  condition  Json?

  x Float @default(0)
  y Float @default(0)

  outgoing MarketingCampaignEdge[] @relation("EdgeFrom")
  incoming MarketingCampaignEdge[] @relation("EdgeTo")
  sends    MarketingSend[]

  @@index([campaignId])
  @@map("marketingCampaignNode")
}

model MarketingCampaignEdge {
  id         String            @id @default(cuid())
  campaignId String
  campaign   MarketingCampaign @relation(fields: [campaignId],
                                          references: [id], onDelete: Cascade)
  fromId String
  from   MarketingCampaignNode @relation("EdgeFrom", fields: [fromId],
                                          references: [id], onDelete: Cascade)
  toId String
  to   MarketingCampaignNode @relation("EdgeTo", fields: [toId],
                                        references: [id], onDelete: Cascade)

  handle String  @default("next")
  label  String?
  weight Int     @default(100)

  @@unique([fromId, handle])
  @@index([campaignId])
  @@map("marketingCampaignEdge")
}

model MarketingSend {
  id String @id @default(cuid())

  campaignId  String?
  campaign    MarketingCampaign? @relation(fields: [campaignId],
                                            references: [id], onDelete: Cascade)
  enrolmentId String?
  nodeId      String?
  node        MarketingCampaignNode? @relation(fields: [nodeId],
                                                references: [id],
                                                onDelete: SetNull)

  recipientId String
  recipient   MarketingRecipient @relation(fields: [recipientId],
                                            references: [id], onDelete: Cascade)
  contactId String?

  origin        MarketingSendOrigin @default(CAMPAIGN)
  pass          Int                 @default(1)
  requestedById String?
  subject       String?
  document      Json?
  replyTo       String?
  attachments   MarketingAttachment[]

  status     MarketingSendStatus @default(QUEUED)
  skipReason String?
  dueAt      DateTime
  attempts   Int      @default(0)
  leasedAt   DateTime?
  sentAt     DateTime?
  providerId String?
  error      String?

  openedAt   DateTime?
  clickedAt  DateTime?
  repliedAt  DateTime?

  events    MarketingEvent[]
  createdAt DateTime @default(now())

  @@unique([nodeId, recipientId, pass])
  @@index([status, dueAt])
  @@index([campaignId, status])
  @@index([recipientId])
  @@index([nodeId, status])
  @@map("marketingSend")
}

model MarketingAttachment {
  id       String @id @default(cuid())
  filename String
  mimeType String
  bytes    Int
  url      String

  campaignId String?
  campaign   MarketingCampaign? @relation(fields: [campaignId],
                                           references: [id], onDelete: Cascade)
  templateId String?
  sendId     String?
  send       MarketingSend? @relation(fields: [sendId], references: [id],
                                       onDelete: Cascade)

  uploadedById String?
  createdAt    DateTime @default(now())

  @@index([campaignId])
  @@index([templateId])
  @@index([sendId])
  @@map("marketingAttachment")
}

model MarketingEvent {
  id     String            @id @default(cuid())
  sendId String
  send   MarketingSend     @relation(fields: [sendId], references: [id],
                                      onDelete: Cascade)
  type   MarketingEventType
  at     DateTime          @default(now())
  url    String?

  @@index([sendId, at])
  @@index([type, at])
  @@map("marketingEvent")
}

model MarketingEnrolment {
  id         String            @id @default(cuid())
  campaignId String
  campaign   MarketingCampaign @relation(fields: [campaignId],
                                          references: [id], onDelete: Cascade)
  contactId   String
  recipientId String

  status        MarketingEnrolmentStatus @default(ACTIVE)
  pass          Int      @default(1)
  currentNodeId String?
  nextDueAt     DateTime?
  exitKind      MarketingExitKind?
  exitReason    String?
  exitedAt      DateTime?
  enrolledAt    DateTime @default(now())

  @@unique([campaignId, contactId, pass])
  @@index([campaignId, status, currentNodeId])
  @@index([campaignId, contactId, exitedAt])
  @@index([status, nextDueAt])
  @@map("marketingEnrolment")
}
```

Six things in there are load-bearing and easy to undo by accident:

- **Every campaign has nodes. A blast is a campaign with exactly one `EMAIL`
  node.** This is the single most consequential line in the model and it was not
  in the first draft. It means content lives on a node and never on a campaign,
  every send points at the node that produced it, and *every number in the
  product is per-node without a special case*. The alternative — a blast that
  keeps its own `subject` and `document`, and a drip that keeps them on steps —
  is two content paths, two stats queries, two renderers to keep honest, and the
  Growth ask is precisely that **every touchpoint** carries its own analytics.
  One node type, one query.
- **`@@unique([nodeId, recipientId, pass])` is the idempotency of everything.**
  Materialising a blast twice cannot double-send, and a drip cannot send the
  same node to the same address twice on the same pass — which also quietly
  handles two `Contact` rows sharing an address, where sending the drip twice is
  exactly what a recipient would call spam. `DIRECT` and `TEST` sends have no
  `nodeId`, and Postgres treats `NULL`s as distinct, so they are unconstrained
  on purpose.

  **`pass` is what makes re-entry possible at all** (§13.8), and it is
  denormalised onto the send from the enrolment on purpose: it is a fact about
  the moment the row was written, like the frozen `document` beside it. A blast
  send is always `pass = 1`. Without this column, the second time somebody walks
  a drip the constraint silently swallows every send and the drip appears to do
  nothing — the worst kind of bug, because it looks like it worked.
- **`document` on the send is a frozen copy**, not a pointer. Same rule as a
  deal's exchange rate in `docs/currency.md`: editing a node tomorrow must not
  change what went out yesterday, and a report that says otherwise is a lie
  about a thing that already happened. For a blast the whole audience freezes at
  schedule (§12). For a drip only the *queued* rows are frozen, because a drip
  runs for months and editing step 5 is the entire point of being able to edit
  it (§13.1).
- **The graph is acyclic, and that is validated on save.** A cycle would let an
  enrolment revisit a node, which `@@unique([nodeId, recipientId])` then blocks
  silently — a drip that stops for a reason nobody can see. Refuse the cycle at
  the save with the edge named, not at 3am in the drain.
- **`leasedAt` + `attempts` make the drain safe to run twice**, claimed with
  `FOR UPDATE SKIP LOCKED` exactly like `claimDue` in `lib/tasks.ts`. Two
  processes are a normal state on Vercel.
- **`MarketingSend` survives its campaign only as far as the cascade** — but
  `MarketingRecipient` never cascades, which is what keeps the unsubscribe link
  alive after retention has swept the send.
- **`origin` is what makes one table serve four things.** A blast send, a drip
  touch, a one-off *"send this to Dana"* (§12) and a test all queue, drain,
  settle, report and unsubscribe through one path. Four tables would have been
  four suppression checks, and the fourth one would have been the one somebody
  forgot. A `DIRECT` send carries its own `subject`, `document` and `replyTo`,
  because it has no node to freeze them from.

Settings live on `AppSetting` beside the tracking columns, which is the house
pattern for one-row configuration: `marketingResendApiKey`,
`marketingResendDomainId`, `marketingSendingDomain`, `marketingFromName`,
`marketingFromAddress`, `marketingReplyTo`, `marketingPostalAddress`,
`marketingSendsPerMinute`, `marketingQuietStart`, `marketingQuietEnd`,
`marketingTimeZone`, `marketingDailyCap`, `marketingOnboardedAt`.

**There is no `marketingTransport` column and no tracking columns**, and both
absences are the point. One vendor needs no discriminator (§4), and
`openTracking` / `clickTracking` live on the Resend domain — a local copy would
be a second source of truth that goes stale the moment somebody changes it in
Resend's dashboard, which is exactly where we tell them to change it.
`marketingResendDomainId` is the handle we read all of that through.

**`marketingReplyTo` is a fallback, not the answer.** The reply-to on any send
defaults to **the address of the member who sent it** — the campaign's creator,
the rep who asked for a one-off, the person who activated the drip. The
`from` stays the verified sending domain, because that is what DKIM signs and
what Resend will accept; the reply lands in the mailbox of the human whose name
is on it, and the mailbox sync then files the answer against the contact with
nobody doing anything. The setting is only what a send falls back to when that
member has no address or has left.

**Any member may send.** No new permission, no owner-only gate. The reply-to
carries the name, `createdById` and `requestedById` carry the record, and a CRM
this size does not need an approval hierarchy on top of that.

**Secrets are stored as the Context key is stored** — a plain column, never read
back out, masked in the UI (`maskKey`), never logged. This is a deliberate
consistency call rather than an oversight: a database that already holds every
email body a rep has ever received is not made safe by encrypting one column,
and half-encrypting is worse than a policy. If we ever encrypt secrets at rest
we do it for `contextDevApiKey`, `marketingResendApiKey` and the SSO client
secret in one change.

## 7. A template is a JSON document, not JSX

Templates are authored as a **block document** — our own small schema, validated
by zod, rendered by React Email components we wrote and reviewed.

Not `.tsx` files in the repo, because then only an engineer can make one. Not
free HTML, because then nothing can lint it, no header can be swapped, and dark
mode is somebody's problem forever. And **decisively**: the agent has to be able
to author a template, an agent that authors JSX is an agent whose output we
would have to execute, and there is no version of that we would ship. A JSON
document is safe to accept from a model, diffable, previewable, and refuseable
with a reason.

```ts
type Document = { version: 1; blocks: Block[] };

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: Inline[]; align?: Align }
  | { type: "text"; text: Inline[]; align?: Align }
  | { type: "button"; label: string; href: string; align?: Align }
  | { type: "image"; src: string; alt: string; width?: number; href?: string }
  | { type: "quote"; text: Inline[] }
  | { type: "divider" }
  | { type: "spacer"; size: "sm" | "md" | "lg" }
  | { type: "columns"; columns: Block[][] };

type Inline = { text: string; bold?: boolean; italic?: boolean; href?: string };
```

Eight blocks. Adding a ninth is a decision, not a convenience — every block is a
thing the renderer, the editor, the linter, the plain-text pass and the agent's
tool description all have to agree about.

The rules the renderer enforces, from the `react-email` skill, so that no author
can get them wrong:

- Tailwind with `pixelBasedPreset`; no `rem`, no media queries, no `dark:`, no
  flexbox, no grid. `columns` renders `Row`/`Column`, never a flex row.
- `Button` always carries `box-border`; every border names its style.
- One `Container`; `Preview` first inside `Body`; `Html lang` set.
- SVG and WEBP are refused at validation, not at render — an author needs the
  refusal while they can still fix it.
- `alt` is required on `image`, and a linked image with an empty `alt` is a lint
  error, because the link then has no accessible name.

**Merge tags are data, never JSX.** `{{contact.firstName|there}}` lives in the
`Inline.text` string, is resolved against a whitelist in
`packages/email/src/merge.ts` *before* the element tree is built, and so never
reaches a component — which is exactly what the react-email skill asks for by a
different route. An unknown tag is a validation error at save, not a literal
`{{whatever}}` in somebody's inbox. Every tag takes a `|fallback`, and one
without a fallback on a nullable field is a lint error: *Hi ,* is the single
most recognisable mark of a badly run list.

## 8. Header, footer, and the two things the compiler adds

`MarketingPartial` rows hold reusable headers and footers, one of each marked
default. A template names a header and a footer, or inherits the defaults. The
onboarding wizard seeds both from what we already know — the workspace name, the
mirrored logo, the postal address.

**The shell is chosen in exactly one place, and a node cannot override it.** A
template picks a header and a footer; a drip node picks a template and then
edits **body copy only**. There is no per-node header, no per-campaign footer,
and no inline shell editing anywhere in the product.

This is the named complaint about HubSpot from the Growth call: it lets somebody
break the header and the footer *per email*, so a twelve-touch drip has twelve
chances to ship a broken logo, and the twelfth is the one nobody previewed. A
capability we do not offer is a bug we cannot ship. When the shell is genuinely
wrong, it is wrong for every email at once, and it is fixed in one row that
every future send picks up.

The trade is real and worth naming: a one-off email that wants no header cannot
have one without a second partial. That is a partial somebody creates once,
deliberately, with a name — not a checkbox on a node that a marketer in a hurry
clicks by accident.

**The shell is visible in the editor, as two locked rows.** *Not editable* and
*not shown* are different things, and the earlier draft accidentally shipped the
second: a block list that started at the heading, with the header and footer
mentioned only in a note underneath. Somebody writing touch 3 could not see what
their email actually opens with.

So the block list is bookended:

```
🔒 Header    Default shell · Comp AI logo
   Heading   Saw you were looking at pricing
   Text      Hi Dana — a couple of looks at pricing
   Button    Book a 20-minute demo
🔒 Footer    Default shell · address + unsubscribe
```

Both rows are muted, carry a lock, and open the partial in Templates rather than
an editor. They make the rule legible in the place somebody would otherwise
break it, and they answer *where did that logo come from* without anybody
sending themselves a test. The full render beside them (§13.5) shows the same
two regions in place, which is the other half of the answer.

**The unsubscribe link and the postal address are not blocks.** The compiler
appends them below the footer, always, on every marketing send. They cannot be
deleted, styled away, or forgotten, because they are not in the document a
person edits. A compliance requirement that depends on an author remembering it
is a compliance requirement we do not meet.

The same compiler emits the headers `List-Unsubscribe: <https://…/u/<token>>`
and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, which Gmail, Yahoo and
Microsoft now require of bulk senders.

## 9. The preview is the send path

`packages/email` exports one function, `renderEmail(document, context)` →
`{ html, text }`. The preview calls it **on the server**, through
`marketing.templates.preview`, and puts the result in an `iframe srcDoc`.

Not a client-side re-implementation, and not an approximation. Two renderers
drift, and the day they drift is the day somebody sends the drift to nine
thousand people. What the preview shows is the bytes the transport will carry,
including merge resolution against a real sample contact.

**The template editor has the co-pilot rail too** (§13.6), and so does the node
sheet on the canvas, which is the same editor. *"Make this shorter and lead with
the customer, not us"* is `write_template`, which already exists, already lints
what it writes, and already returns its errors to the model to fix (§10, §18).
The block list stays: you say the sweeping change and then fix the one line by
hand. Neither half is the real one.

The preview panel gives:

- **Desktop and mobile** width, by resizing the frame — not by a second layout.
- **The plain-text tab**, from `render(..., { plainText: true })`, because that
  is what a real proportion of recipients read and nobody ever looks at it.
- **Test send** to the signed-in rep's own address, which is the only send in
  the product that needs no approval and no suppression check.
- **The lint result** (§10), inline, not behind a button.

## 10. The linter is the product

`lintEmail(document, context)` in `packages/email`, one function, used by the
template screen, the campaign screen and the agent's `write_template` tool. This
is most of what "make it smart" means, and it costs one file:

| Level | Rule |
| --- | --- |
| error | Missing `alt`; linked image with empty `alt`; SVG or WEBP source; unknown merge tag; a `button` with no `href`; heading levels skipped |
| error | Subject empty, or over 150 characters |
| warn | Subject over 50 characters (mobile truncation) |
| warn | Merge tag on a nullable field with no fallback |
| warn | No preheader — the inbox will show the first line of body copy instead |
| warn | Estimated HTML over 102 KB, which is where Gmail clips |
| warn | Text contrast under 4.5:1 against its background |
| warn | Image-only email — more than 60% of blocks are images |
| warn | No link in the body at all, or more than fifteen |
| warn | An attachment on a send to more than fifty recipients — it costs deliverability and forces single sends (§12) |
| error | Attachments over 40 MB in total, which Resend refuses |

Errors block a schedule. Warnings are shown and can be sent past — the ninth
rule is right most of the time and wrong for a one-line announcement, and a
linter that cannot be overruled is a linter people route around.

## 11. A segment is a saved query

**One word: segment.** *Audience*, *list* and *segment* all came up in the
Growth call meaning the same thing, and they are the same thing. The product
says segment everywhere — screen, tool name, agent reply, this document.
`AGENTS.md` asks for one word per meaning and this is the one that would
otherwise grow three.

**Segments live outside the flow and are shared by every flow.** A drip does not
own a segment and does not define one inline; it *references* them, which is
what makes "everybody in Website visitors who is not in Closed won" a rule two
different drips can both use, and what makes editing that rule once fix both.

`definition` is a filter tree over a **whitelist** of facets, compiled to a
Prisma `where` by `@crm/db/marketing/segments.ts`. Compiled in one place because
the API counts it, the blast materialises from it, a drip's entry sweep and exit
sweep evaluate it, **a `BRANCH` node evaluates it** (§13.1) and the agent
previews it — five callers, one compiler, or five subtly different answers to
"who is in this list". That fifth caller is new and it is the reason the
compiler earns its keep: a branch condition is not a new language, it is a
segment applied to one person.

**The fifth caller is also the one that will quietly grow a second compiler**,
because "does this one contact match?" reads like a different question from
"who matches?" and somebody will write a `matchesFilter(contact, filter)` that
walks the tree in TypeScript. It would be faster. It would also drift on the
first facet that touches a relation, and the drift would show up as a branch
sending people down the wrong arm — invisible, because both arms send something.

So the module exports two functions and the second is one line over the first:

```ts
export const compile = (filter: Filter): Prisma.ContactWhereInput => …

export const matches = (db: Db, filter: Filter, ids: string[]) =>
  db.contact.findMany({
    where: { AND: [compile(filter), { id: { in: ids } }] },
    select: { id: true },
  });
```

There is no third export, `matches` has no logic of its own, and the spec
asserts parity on the same fixtures — every facet, both entry points, one
answer. Structure is the defence here; a comment asking people not to do it is
not.

```ts
type Filter =
  | { all: Filter[] }
  | { any: Filter[] }
  | { not: Filter }
  | { facet: Facet };
```

Facets, and every one of them is a `where` fragment, never a fetch-and-filter —
*filter, sort and paginate in Prisma*:

- **Contact** — owner, source, has email, title contains, created within.
- **Company** — industry, country, size band, domain in list.
- **Custom fields** — any live `FieldDefinition`, by key, typed by its
  `FieldType`. The dynamic-fields work already gave us this and a segment
  builder that ignored it would be the second field system.
- **Activity** — `lastActivityAt` within / not within N days.
- **Deals** — has a deal at stage, has no open deal, closed won within.
- **Mailbox** — replied within N days, never replied. This is the one HubSpot
  cannot do without an integration, and we have it for free.
- **Tracking** — visited a path, submitted a form, first-touch campaign.
- **Marketing** — opened or clicked campaign X, sent nothing in N days, in
  drip Y, or currently sitting on node Z.

**The segment builder has the co-pilot rail too** (§13.6). *"People who hit
pricing twice and never replied, minus anyone closed won"* is a filter tree
somebody would otherwise assemble from four dropdowns, and `write_segment`
already exists as a tool. The rule builder stays exactly as it is underneath —
the chat writes the tree, the builder edits it, and the count in the header
updates from the same query either way.

This is the surface where the co-pilot earns the most, because a filter tree is
the hardest thing in the suite to express by pointing and the easiest to say.

### Rules and hands, on the same segment

Membership is **`(the definition matches OR an INCLUDE row exists) AND no
EXCLUDE row exists`**. One expression, both kinds, and it is what lets a rep
open a contact and *add them to a segment* — asked for explicitly on the Growth
call — without anybody first having to know whether that segment is the rules
kind or the hands kind.

- `kind` is now a label for the UI, not a branch in the compiler. A segment with
  no `definition` reads as **static**; one with no members reads as **dynamic**;
  one with both is honest about it and says *412 by rule, 3 added by hand*.
- **A manual add cannot resurrect an unsubscribe.** Membership is not consent —
  §5's check runs at send, after the segment has answered.
- An EXCLUDE row is how a rep says *not this one* about somebody the rule keeps
  catching, and it is the reason removal is a row rather than a hidden edit to
  the definition.

**Editing the rules changes who arrives next, never who already did.** A
dynamic segment is live: a drip on `CONTINUOUS` entry re-reads it every tick, so
tightening the rule today stops tomorrow's enrolments and leaves the people
already walking the flow exactly where they are. This was the Growth ask —
*tweak the rules at any point in time* — and the second half of it is the half
that has to be said out loud, because the alternative reading is that editing a
segment retroactively yanks four hundred people out of step 3.

**Suppression is not a facet.** A segment answers *who are these people*; the
send answers *whom may we email today*. Keeping them apart is what lets the send
screen say "4,102 in the segment, 3,847 will receive this, 255 excluded" and
break the 255 down — 190 unsubscribed, 41 no address, 24 bounced. A segment that
had quietly pre-filtered them would have had nothing to explain.

## 12. A blast freezes its audience

`kind: BLAST` — one email, one segment, one moment. `DRAFT` → `SCHEDULED` →
`SENDING` → `SENT`, with `PENDING_APPROVAL` for anything the agent staged (§18),
and `PAUSED` / `CANCELLED` / `FAILED`. A drip uses the other half of the same
enum — `DRAFT` → `ACTIVE` → `PAUSED` → `ARCHIVED` — and §13 covers it.

**Scheduling materialises.** At the moment a human confirms, the compiler
resolves the single node's template + header + footer into each send's frozen
`document` and `subject`, the segment is evaluated once, and one
`MarketingSend` row per surviving recipient is written with
`dueAt = scheduledAt`. From that instant:

- the audience cannot change under the send — somebody added to the segment
  mid-flight is *not* swept in, and somebody removed is not chased down;
- progress is a `count` on rows rather than an estimate;
- a pause is `UPDATE … WHERE status = 'QUEUED'` and it is instant;
- a crash resumes, because the rows say what has already gone out.

Materialisation runs in a transaction and skips, with a reason recorded on the
row, every recipient who is suppressed, has no address, or has already had their
daily cap. `SKIPPED` rows are kept — "why did Dana not get this" is the second
question anybody asks and an absent row cannot answer it.

**Sending obeys the clock and the cap.** `marketingSendsPerMinute` throttles the
drain (Resend's default is 2 requests a second and batches hold 100, so 300 a
minute is polite and 6,000 is the ceiling before anything is queued at the
vendor). Quiet hours push `dueAt` forward rather than dropping the send. A new
sending domain should be warmed: the wizard says so, and the settings page
carries the schedule from the Resend skill rather than making somebody find it.

### One-off sends

*"Send this to Dana"* is a `MarketingSend` with `origin: DIRECT`, no campaign,
`dueAt` now. It carries its own frozen `subject` and `document` because there is
no campaign row to hold them, and otherwise it is the same row on the same queue
— which means it is suppression-checked, capped, tracked, unsubscribable and
visible in the contact's history without a single line of parallel code.

It is reachable three ways, all landing on `queueDirect()` in
`@crm/db/marketing`: the **Send email** action on a contact or company sheet,
`marketing.sends.create` over tRPC, and the agent's `send_email` tool (§18).
That is what makes *"send an email to Dana using the onboarding template"* work
in chat without the agent knowing anything the UI does not.

A `DIRECT` send is still marketing mail. It gets the footer, the unsubscribe
link and the suppression check. If somebody unsubscribed, the tool says so and
sends nothing — a rep typing the sentence by hand is not a consent event.

### Attachments

Supported, on campaigns, one-off sends and templates (where they are defaults,
copied onto the campaign at compose time and frozen with everything else).

- **Bytes live in Vercel Blob**, through `@crm/db/blob` — the same store as
  mirrored logos and portraits, uploaded through `mirror()`, keyed by content
  hash so the same PDF on forty campaigns is stored once.
- **No `BLOB_READ_WRITE_TOKEN` means no attachments.** A capability removed, not
  an error, and the upload control is absent rather than broken —
  `lib/capabilities.ts`' rule, applied on this side of the wall.
- **A send with attachments cannot batch.** Resend's batch endpoint refuses
  them, so the drain routes those sends one at a time and the throughput drops
  to the per-request rate. This is a real cost and the reason for the fifty
  recipient lint warning: attaching a PDF to a nine-thousand-person campaign
  turns a four-minute send into an hour.
- **40 MB total**, enforced at upload and again at compose, because a campaign
  can accumulate attachments after the first one passed.
- The plain-text pass names the attachments at the end, since a text reader
  gets no other indication they exist.

## 13. Drips — multi-touch, and they branch

`kind: DRIP` is the same campaign row with a graph hanging off it. It is the
feature the Growth call was mostly about, so it gets the most of this document.

A drip is **entry rules**, **a graph of nodes**, and **exit rules**. Enrolment is
one row per contact holding `currentNodeId` and `nextDueAt`. The same drain tick
that sends a blast advances every enrolment.

### 13.1 The graph

Five node kinds and no more. Each one is a thing the engine, the canvas, the
agent's tool description and the analytics panel all have to agree about, so a
sixth is a decision rather than a convenience.

| Node | Holds | Out |
| --- | --- | --- |
| `EMAIL` | A template, plus its **own** `subject` and `document` | one |
| `WAIT` | `delayHours` | one |
| `BRANCH` | `condition` — a filter tree, §11 | **two**: `yes`, `no` |
| `SPLIT` | nothing | **n**, weighted (§13.4) |
| `EXIT` | nothing | none |

Edges carry `handle`, `label` and `weight`. `@@unique([fromId, handle])` — a
branch's `yes` goes to exactly one place. The root is the node with no incoming
edge, there is exactly one, and that is validated with the acyclicity check on
save.

**Two rules about branching on *opened*, because it is the condition everybody
reaches for first and it is the one that lies.**

- **A branch on `opened` when open tracking is off is an error, and
  `validateGraph` refuses it.** Not a warning — with tracking off, no
  `email.opened` webhook ever arrives, the condition is false for everybody
  forever, and the entire yes-arm is dead code that will never send. Somebody
  would build five touches down that arm and discover it in a month. The message
  names the node and offers the two ways out: turn tracking on at the Resend
  domain, or branch on `clicked`.
- **A branch on `opened` when tracking *is* on is a warning that cannot be
  turned off.** Apple Mail Privacy Protection prefetches the pixel (§14), so the
  yes-arm silently collects every Apple Mail recipient whether or not a human
  looked. That is worse than an inflated number on a chart: it *routes people*.
  The branch inspector defaults to `clicked`, labels `opened` as unreliable, and
  says which arm the inflation lands in.

**An `EMAIL` node owns its copy.** It is seeded from a template and then
diverges. This is the "click into each one and tweak a line" from the call, and
it has to be a copy rather than a live pointer, or fixing one sentence in touch
three of the onboarding drip silently rewrites touch three of five other drips.
Templates are starting points and shells (§8); node content is the drip's.

**Editing a live drip is normal, not dangerous.** Queued sends are already
frozen, so an edit lands on everybody who has not reached that node yet and
touches nobody who passed it. Adding a node mid-flight is allowed; deleting one
that enrolments are *currently sitting on* is refused with the count, because
the alternative is silently stranding four hundred people.

### 13.2 Entry and exit are set operations

The most important performance decision in this feature, and the easiest one to
get wrong by writing the obvious code.

The obvious code asks, per enrolment, *should this person leave?* — one query per
person per tick, which at ten thousand enrolments is ten thousand queries a
minute. Instead, **both rules compile to a `where` and run once per campaign**:

- **Entry** — `compile(entryDefinition)` `AND NOT EXISTS (an enrolment for this
  campaign)`. One query returns everybody who should join; they join in bulk.
- **Exit** — `compile(exitDefinition)` intersected with *this campaign's active
  enrolments*. One query returns everybody who should leave; they leave in bulk,
  with `exitReason` and `exitedAt` stamped.

Two queries per drip per tick, whatever the population. The compiler in §11 is
what makes this possible, and it is why a branch condition and an exit rule and
a segment are deliberately the same object.

**Exit is checked continuously, not before each step.** The call was explicit:
somebody can be between touch 4 and touch 5, and a deal moving to Closed Won has
to pull them out *then* — not in nine days when the next email is due. The
earlier draft checked exits before firing a step, which is cheaper and wrong: a
14-day wait means up to 14 days of a customer being in a nurture drip after they
bought. The exit sweep runs every tick over `ACTIVE` enrolments regardless of
`nextDueAt`, and that is what the set operation buys.

Exit rules a drip gets for free, because the CRM already writes the rows:

| Exit | How we know |
| --- | --- |
| **Replied** | An inbound `EmailMessage` from that address after enrolment. The mailbox sync already wrote it |
| **Unsubscribed / bounced** | `MarketingRecipient.status` left `SUBSCRIBED`. Not a rule — always on, never removable |
| **Meeting booked** | A `CalendarAttendee` row for that address on a future event |
| **Deal moved** | A `Deal` for their company entered a named stage — the Closed Won case from the call |
| **Left the segment** | The entry segment no longer matches |
| **Manually removed** | A rep, from the contact sheet |

A drip that keeps emailing somebody who replied is the single most common
complaint about every tool in this category, and we are one join away from never
doing it.

**Entry modes.** `MANUAL` — a rep or the agent enrols. `CONTINUOUS` — the entry
sweep runs each tick and anybody newly matching joins. There is no separate
form-submission trigger, because *submitted form X* is already a facet of the
segment compiler (§11) and a trigger enum would be a second way to say it.

**Enrolment is once by default, and re-entry is a decision somebody makes on
purpose.** §13.8.

### 13.3 The tick

One tick, one order, and the order is the correctness:

1. **Link replies** — inbound `EmailMessage` rows since the last tick stamp
   `repliedAt` on the matching open sends. Done first, so an exit rule in step 2
   sees a reply that arrived thirty seconds ago.
2. **Exit sweep**, per active drip. Bulk.
3. **Entry sweep**, per active `CONTINUOUS` drip. Bulk.
4. **Advance** every enrolment whose `nextDueAt` has passed: evaluate its current
   node, follow the edge, write the next `MarketingSend` or set the next
   `nextDueAt`. A `BRANCH` and a `SPLIT` resolve immediately and keep walking —
   they consume no time, so a branch followed by an email sends now, not next
   tick.
5. **Claim and send**, exactly as §3 already describes.

A `BRANCH` walking on immediately means a chain of them could loop forever
inside one tick — except the graph is acyclic, which is the second reason that
validation exists.

### 13.4 A/B is a split node, and it costs nothing

`SPLIT` sends each enrolment down one of *n* weighted edges. Assignment is
`hash(enrolmentId + nodeId) % 100` against the cumulative weights — deterministic,
so a resumed or retried tick cannot reassign somebody who already got variant A.

That is the whole feature. There is **no variant table, no experiment object and
no extra column on the send**, because the two arms lead to two different
`EMAIL` nodes and every number in the product is already per-node (§13.7).
Comparing arms is comparing two nodes' stats, which the panel does anyway.

It generalises for free, which the subject-line-only version would not have:
a split can test two subjects, two whole emails, two send times, or two
five-touch follow-up paths, and the reporting does not change.

#### Declaring a winner, and what "all future emails" means

Two different questions hide in *make sure future emails use the winner*, and
the split node answers both, separately, because they have different blast
radii.

**1. Future people in this drip.** *Declare winner* on the split sets the
winning edge's weight to 100 and the loser's to 0. From the next tick, everybody
entering takes the winning arm. The node keeps both arms and both histories —
the losing arm is not deleted, because deleting it would orphan the sends that
went down it and break every number that already referenced them.

**People already on the losing arm stay on it.** They are mid-flow, they have
had touch 1 variant B, and yanking them onto the A path would send them a
follow-up to an email they never received. The panel says this in one line when
you declare, with the count. It is the same rule as §11's *editing the rules
changes who arrives next*.

**2. Future other campaigns.** *Promote to template* copies the winning
subject, preheader and body onto the `MarketingTemplate` the node was seeded
from. That is the only mechanism by which a win escapes this drip, and it is
deliberately a second, separate click — an A/B result is evidence about one
audience at one moment, and quietly rewriting a shared template because of it
is how a template ends up nobody's decision.

**When can you tell?** The panel does the arithmetic nobody wants to do by hand
and refuses to overstate it:

| State | Shown |
| --- | --- |
| Under 100 per arm | *Too early — 604 of 200 needed* and no winner button |
| Enough, not separated | *A leads by 3 points. That is inside the noise* |
| Enough, separated | *A wins on reply rate, 3.4% against 2.1%* and the button |

**The test is on reply rate first, click rate second, and open rate never.**
Open rate is Apple-inflated (§14), and a winner declared on opens is a winner
declared on which arm reached more iPhones. If a drip has no replies and no
clicks at all, the panel says there is nothing to declare rather than picking.

**It stays manual.** The button is a person's. Automatic promotion needs a
stopping rule, and a tool that promotes a winner off forty opens is worse than
no tool — §21.

### 13.5 The canvas

`@xyflow/react` (React Flow), wrapped in `/packages/ui` as `flow-canvas` with
node components built from the shadcn primitives already there. The library's
stylesheet is imported **once, in that package**. Nothing in `apps/app` imports
React Flow directly, and no node is styled at the call site — `docs/design.md`
holds, and a third-party canvas is exactly the sort of thing that arrives with
its own blue and its own radii if nobody stops it.

- **The engine reads the same rows the canvas draws.** Nodes and edges are the
  storage, `x`/`y` included. There is no separate layout document to drift.
- **The agent never invents coordinates.** It writes nodes and edges without
  positions, and the server lays them out with `dagre` on save. A human dragging
  a node persists `x`/`y` and the auto-layout leaves it alone from then on.
- **Live counts on the node**, not in a separate report (§13.7).

**Clicking a node opens a wide sheet, and half of it is the rendered email.**
Not a narrow inspector — the point of clicking into a touch is to see what
actually lands in somebody's inbox, and a list of block names is not that. The
sheet is the record-sheet pattern the app already uses, at about 1,000px, over a
canvas that stays visible on the left:

| Where | What |
| --- | --- |
| Header | The node, its kind, and — on a split arm — which variant and its weight |
| Strip | Sent, delivered, opened, clicked, **replied**, unsubscribed, for this node |
| Left, 400px | Subject, preheader, the block list, and the shell notice |
| Right, the rest | **The live render**, desktop / mobile / plain text |

The render is `renderEmail()` on the server, in an `iframe srcDoc`, with merge
tags resolved against a real sample contact — §9's rule, not a second preview
built for the canvas. It shows the header, the footer, the postal address and
the unsubscribe link the compiler appends (§8), which is the only way somebody
sees that the shell is doing its job without sending themselves a test.

The editor half is the same component the template screen uses. **It has no
shell controls**, and the notice beside it says why.

### 13.6 The co-pilot is eve, and it is the whole suite's

A chat rail, collapsible. **It is the agent panel that already exists**, pointed
at a marketing record instead of a contact.

**It is not only the canvas.** A drip, a segment and a template are all things
somebody would rather describe than assemble, and all three already have an
agent tool that writes them (§18). Building the rail once for the canvas and
then a different one for segments later is how a product ends up with two chat
surfaces that disagree about what a conversation is.

| Surface | Say | Then |
| --- | --- | --- |
| **Drip canvas** | *"Four touches over two weeks, branch after the second on whether they opened"* | Click into the node that reads badly |
| **Segment builder** | *"People who hit pricing twice and never replied, minus anyone closed won"* | Drag the rule that is not quite right |
| **Template editor** | *"Make this shorter and lead with the customer, not us"* | Edit the block by hand |

Same agent, same panel, same tools, three record kinds. **Direct manipulation
never goes away** — a marketer who knows exactly what they want must not have to
describe it in a sentence, and the fastest path to *change 2 days to 3* is
always going to be clicking the 2. The chat is for the first draft and the
sweeping change; the canvas, the rule builder and the block list are for the
tenth edit.

*"Create a drip for people who visited pricing but never booked a demo — four
touches over two weeks, and branch after the second on whether they opened it"*
produces the graph, the copy in every node, and the entry and exit rules. The
marketer then clicks into whichever node reads badly and fixes the line.

The canvas is the reason the chat works. The Growth call landed on this exactly:
you want to *say* it, then **see it**, because a branching flow described in
prose is unreviewable and the same flow as twelve boxes is obvious at a glance.

#### Three more record kinds, and that is most of the integration

`apps/app/lib/agent-record.ts` maps a record kind to a header, a field, and the
copy around the thread. Today it holds `contact`, `company` and `deal`. Add
three:

```ts
campaign: { header: "x-crm-campaign", field: "campaignId", … },
segment:  { header: "x-crm-segment",  field: "segmentId",  … },
template: { header: "x-crm-template", field: "templateId", … },
```

`AgentConversation` gains three nullable columns with `onDelete: Cascade`, the
same shape as the three beside them. **Everything in `docs/agent-panel.md` then
applies unchanged and must not be re-solved**: load with `session.snapshot()`
and never by hand; the continuation token — not our reading of the events — is
the authority on whether a message can be sent; `streamIndex: 0` on resume; the
snapshot cached for a minute; `keepMounted` on the tab or Radix aborts the
stream mid-answer; quiet for 90 seconds is over, not working; an unreachable
agent is `offline` with the `AgentEvent` archive behind it, not a locked box.

Every one of those rules was learned from a bug in that panel. A second chat
surface would meet all of them again in order.

#### The composer is `/chat`'s composer

`apps/app/components/agent-builder/agent-composer.tsx` is the one to copy, and
copy is the wrong word — the parts move to `/packages/ui` and both call sites
use them. It already solves the things a marketing rail needs and would
otherwise reinvent badly:

- **`TokenField` with reference chips**, so a prompt names records instead of
  describing them. *"Build a drip for `[Visited pricing, no demo]` using
  `[Announcement]`"* is unambiguous in a way the same sentence in prose is not,
  and it removes the whole class of *which segment did it mean*.
  `ChatChipResource.kind` gains `segment`, `template` and `campaign` beside the
  four it has.
- **`InputGroup` with an `ArrowUp` addon**, the attachment chip, and the
  resource `Popover` — the same control, the same keyboard behaviour, in both
  places.
- **`chat-chips.tsx`'s suggestion chips** for the empty state, which is where a
  marketer who has never used this decides whether it is worth typing into.

The rail is narrower than `/chat`'s full page, so the chips wrap and the
resource popover is anchored rather than inline. That is a width prop, not a
second component.

#### The tools are eve tools, and approval is an eve policy

`write_campaign_graph`, `update_node` and `read_campaign` (§18) are
`defineTool` with a zod `inputSchema`, writing through `@crm/db/marketing` like
every other agent write. What is new here is that **the same tool is harmless on
a draft and consequential on a live drip**, so approval is a policy rather than
a flag:

```ts
approval: async ({ session, toolInput }) => {
  const campaign = await readCampaign(toolInput?.campaignId);
  if (campaign?.status !== "ACTIVE") return "not-applicable";

  const auth = session.auth.current;
  const autonomous =
    auth?.authenticator === "app" && auth.principalType === "runtime";

  return autonomous
    ? { type: "denied", reason: "A live drip is only edited by a person." }
    : "user-approval";
},
```

Three states, and each is the right one:

- **A draft** — no prompt. Nothing has been sent and nothing will be until a
  human activates it. A confirmation here is a click that teaches people to
  click.
- **A live drip, a person asking** — `"user-approval"`. eve parks the run at
  `session.waiting` and the panel renders the request; the edit changes what
  people receive next week and deserves one deliberate yes.
- **A live drip, no human principal** — `{ type: "denied" }`, not a pause.
  A scheduled or dispatched turn has nobody to approve it, so parking would hang
  a run until it expired. Denying with a reason tells the model why and lets it
  do something useful instead. This is §18's principal rule, expressed in the
  place eve actually enforces it.

**`ask_question` rather than guessing.** eve's built-in. *"Four touches over two
weeks"* with no segment named is under-specified, and inventing a segment is
worse than asking; the run parks durably and resumes when the marketer answers.

#### The diff comes off the event stream

The panel already renders the NDJSON stream. Each surface needs one thing more:
on `action.result` for a writing tool, invalidate that surface's query and flash
what the tool reports it touched — **nodes** on the canvas, **rules** in the
segment builder, **blocks** in the template editor. One mechanism, three
highlights.

**The changed ids come from the tool's own return value**, not from re-fetching
and diffing client-side. A diff computed by comparing two fetches races the next
edit and highlights the wrong boxes. The tool knows exactly what it touched; it
says so, and §13.5's "every edit is a diff" is that sentence.

#### Structure in the parent, copy in the children

An eight-node drip is one structural decision and eight pieces of writing, and
those want different shapes:

- **The parent writes the graph** — nodes, edges, entry and exit rules — in one
  `write_campaign_graph` call, so the shape is decided once and validated once.
- **Copy is delegated**, one node per child, through eve's built-in `agent` tool
  with an `outputSchema`. Emitting the batch in one response runs them
  concurrently, and eve returns every result before the parent continues.

eve's own docs require parallel children to have **non-overlapping write
scopes**, and one node each satisfies that exactly. The alternative — one turn
writing eight emails in sequence — is slower and reliably produces eight emails
that sound like each other.

#### The three rules that do not move

- **It writes `DRAFT` and only `DRAFT`.** There is no `activate_campaign` tool
  at all (§18) — not one behind `always()`, because an approval prompt asks a
  person to sign off on something they may not have read, and *no tool* is the
  only version of this that cannot be clicked through.
- **It runs the linter (§10) on every node it writes** and fixes its own errors
  before answering. `validateGraph` (§13.1) likewise returns problems with node
  ids to the model rather than saving. The linter being a function and not a
  screen is what makes both possible, and this is the payoff for that decision.
- **It never sends.** `send_email` is a different tool with a different rule,
  and no path through the canvas reaches it.

**Durability is free and worth naming.** eve sessions are durable and last 30
days. A graph build that takes two minutes survives a page reload, because the
panel reattaches by `sessionId` — the same reason a research thread on a contact
survives one today.

### 13.7 Every touchpoint carries its own numbers

Two questions, both asked directly on the call, both answered by a group-by that
the model already supports.

**"How is each touch performing?"** — `MarketingSend` grouped by `nodeId`:
sent, delivered, opened, clicked, **replied**, bounced, unsubscribed. It sits on
the node in the canvas as a compact strip, so the weak touch is visible without
opening anything. Reply rate is the one no competitor has without an
integration, and we get it from the mailbox sync for the price of a join (§13.3
step 1).

**"How many people are between touch 3 and touch 4?"** — `MarketingEnrolment`
grouped by `currentNodeId` where `status = ACTIVE`. That is the pipeline, and it
draws directly on the edges: each edge carries the count in flight along it,
with `nextDueAt` giving *when* they move. A funnel that is a real query over
real rows, rather than a chart assembled from event counts.

Both numbers carry §14's two caveats wherever an open rate appears. A per-node
open rate is still an Apple-inflated open rate, and a branch **on** open is
inflated in the same direction — see §13.1's two rules about that condition,
which are a lint warning and a hard error respectively.

### 13.8 Re-entry

Somebody who walked a drip in March and matches the segment again in September
is a real person with a real second intent. Refusing them forever is wrong;
letting them back in silently is how one person receives the same twelve emails
twice. So re-entry exists, it is **off**, and turning it on requires saying how
often.

```prisma
reentryCooldownDays Int?          // null = never re-enter. The default.
maxPasses           Int @default(1)
```

Each walk is a **pass**. `MarketingEnrolment` carries `pass`, keyed
`@@unique([campaignId, contactId, pass])`, and the send carries a copy of it so
`@@unique([nodeId, recipientId, pass])` still guarantees one send per touch per
walk (§6).

The entry sweep excludes a contact when **any** of these is true, and the order
is the order of how much they matter:

| Excluded when | Configurable |
| --- | --- |
| They have an `ACTIVE` enrolment on this campaign | **No.** Two concurrent walks is a bug, never a setting |
| Their address is `UNSUBSCRIBED`, `BOUNCED` or `COMPLAINED` | **No.** §5 |
| Their last exit was `exitKind: SUPPRESSED` | **No.** Same reason, from the other side |
| `reentryCooldownDays` is null | Yes — this is the default, and it means *once, ever* |
| They exited less than `reentryCooldownDays` ago | Yes |
| They already have `maxPasses` enrolments | Yes |

Three of those are not settings and will not become settings. A cooldown is a
marketing judgement; sending to somebody who asked you to stop is not.

**`maxPasses` is the one that stops the disaster**, and it is why re-entry is
not just a cooldown. A cooldown alone lets somebody who oscillates in and out of
a segment — which a behavioural segment invites — receive the drip every 30 days
forever, and nobody notices because each individual send is correct. The default
of `1` means the feature is inert until somebody raises it, and raising it asks
for a number rather than a checkbox.

**Exiting because you converted is not the same as exiting because you fell
out.** `MarketingExitKind` records which:

| Kind | Meaning | Re-entry |
| --- | --- | --- |
| `GOAL` | Replied, booked, deal moved — the drip worked | Allowed, but the UI warns: this is somebody who already said yes |
| `RULE` | Left the entry segment, or hit an exit rule | Allowed |
| `SUPPRESSED` | Unsubscribed, bounced, complained | **Never** |
| `MANUAL` | A rep pulled them out | Allowed, and the rep's removal is not a permanent verdict |
| `ARCHIVED` | The campaign stopped underneath them (§13.9) | Allowed |

**Re-entry starts at the root, not where they left.** A second pass is a second
walk, from the top, with the copy as it stands today. Resuming mid-graph would
mean sending touch 4 to somebody whose memory of touches 1–3 is six months old.

**The counter is per pass and the totals are not.** §13.7's per-node numbers sum
every pass, which is what *how did touch 2 perform* means. The pipeline —
enrolments by `currentNodeId` — counts only `ACTIVE` ones, so a person on their
second walk appears once, where they are now.

### 13.9 Pausing, draining, archiving

A drip that has been running for three months has people standing inside it.
Every way of stopping it has to answer *what happens to them*, and the earlier
draft answered none of them.

**Pause** freezes the campaign, not the people. The tick skips it entirely — no
entry, no exit, no advance — and enrolments keep their `currentNodeId` and
`nextDueAt`. Nothing is lost and nothing is sent.

**Resume asks one question, because the clocks went stale.** A drip paused for
three weeks has four hundred enrolments whose `nextDueAt` is in the past, and
the obvious implementation sends all four hundred on the next tick. That is a
spike into a spam folder and a Monday morning nobody enjoys. So resume offers:

- **Restart the clocks** (the default) — `nextDueAt = now + the wait that was
  left`. Everybody resumes their own schedule from today.
- **Send the backlog** — the spike, on purpose, with the count shown first. It
  is occasionally right, for a pause of an hour.

**Draining** is the one the earlier draft was missing, and it is what people
actually want most of the time: **stop letting anybody new in, and let everybody
already inside finish.** `status: DRAINING` runs exits and advances but not the
entry sweep. When the last `ACTIVE` enrolment finishes it archives itself.
Cutting a drip off mid-flow, when the alternative is two more emails over nine
days, is a worse answer than waiting nine days.

**Archive refuses while anybody is `ACTIVE`.** It is not a force flag; it is a
question with two real answers, and the dialog shows the count and where those
people are standing:

- **Let them finish** → `DRAINING`.
- **Stop everybody now** → bulk exit, `exitKind: ARCHIVED`, then `ARCHIVED`.

**Archiving never deletes.** Nodes, edges, enrolments and sends all stay, and
`ARCHIVED` is simply out of the list by default. The numbers a marketer will
want next quarter are the numbers of a drip that stopped, and a `DELETE` here
also takes out the `MarketingSend` rows that a contact's timeline reads from.

## 14. Tracking is Resend's, optional, and off

Open and click tracking are **off by default**, and the toggle is not ours in
any sense but the wording: it writes `openTracking` / `clickTracking` on the
Resend domain through `domains.update`. There is **no pixel route, no click
redirect, no HMAC token and no link rewriter in this codebase**. Opens and
clicks arrive as `email.opened` and `email.clicked` webhooks and become
`MarketingEvent` rows.

Off by default is the same position `docs/tracking.md` takes, for the same
reason: this is a CRM that holds other people's data and the quiet default is
the right one.

Two sentences the UI has to say out loud, because both are discovered painfully
otherwise:

- **Apple Mail Privacy Protection prefetches the open pixel**, so the open rate
  reads high whether or not anybody looked. That sentence sits beside the toggle
  *and* beside the number. A metric shown without it is a metric we are inviting
  somebody to make a decision on.
- **Click tracking rewrites every link in the body**, including an in-body
  unsubscribe link, because the rewriting happens at Resend after our compiler
  has finished. The `List-Unsubscribe` **header** is untouched, so one-click
  opt-out still resolves directly and is never recorded as engagement. We cannot
  exempt the in-body link, and pretending otherwise would be the kind of claim
  somebody checks.

**No IP address is stored on our side**, ever — the events we keep are type,
time and send.

### Deliverability is a number on the screen, not a support ticket

*"How many emails actually got sent"* was asked as a plain question and deserves
a plain answer, separate from engagement. Sending 9,000 and delivering 7,100 is
the single most important fact about a campaign and it is invisible in most
tools until somebody complains.

Every blast, every drip and the Settings page carry the same three:

| | Watch | Act |
| --- | --- | --- |
| **Hard bounce rate** | over 2% | over 5% — sending stops on its own |
| **Spam complaint rate** | over 0.1% | over 0.3%, which is Google's published threshold for filtering a sender |
| **Delivered** | plain count and share of sent | — |

**The 5% bounce rule pauses the campaign automatically**, and this is the one
place the product overrules the marketer. A list that bounces at 5% is a bought
list or a stale export, continuing to send it damages the domain every other
campaign shares, and the damage outlasts the campaign by months. It pauses, it
says why, and a human can resume it having read that sentence.

Reply rate sits beside them, from the mailbox sync (§13.3), because on a drip it
is the number that actually means something and no other tool in this category
has it without an integration.

`MarketingEvent` rows are swept at 90 days by the existing tracking retention
cron — except `BOUNCED`, `COMPLAINED` and `UNSUBSCRIBED`, which are kept, because
CASL wants three years of them and they are the evidence for a suppression.

## 15. Unsubscribe

- **`GET /u/<token>`** — a page on the app, anonymous (add `/u` to `ANONYMOUS`
  in `proxy.ts` beside `/t`). It names the workspace and the address, and offers
  **one button that does it**. No login, no account, no reason required.
- **The page does not unsubscribe on load, and this is a correction to an
  earlier draft.** That draft said the GET should write immediately, on the
  grounds that a confirm step is friction. It is worse than friction: Gmail,
  Outlook and every corporate link scanner fetch the URLs in a message before a
  human sees them, so a GET that writes unsubscribes people who never clicked.
  They then stop getting mail they asked for and nobody finds out. One button is
  not an "are you sure" — it is the difference between a person acting and a
  robot acting.
- **`POST /api/m/u/<token>`** — the one-click endpoint the `List-Unsubscribe`
  header points at. This one *does* write immediately and returns 200 with an
  empty body, which is exactly what RFC 8058 asks for. A POST is safe here
  because scanners do not POST.
- Both paths write `status = UNSUBSCRIBED` before they answer. Not within ten
  days, not on a sweep.
- A preference choice — *pause for 90 days* — sits under the button as a
  secondary action. Offering it is worth a few points of list retention; making
  it the primary action is the dark pattern every guide names, and the law in
  most of these jurisdictions requires the one-click anyway.
- An unknown or malformed token still renders the page and still says
  *You are unsubscribed*. It is not an authentication surface, and a 404 there
  reads as a company evading an opt-out.

## 16. Delivery events

`POST /api/m/webhook/resend`, anonymous, on the API, verified with
`resend.webhooks.verify()` — the SDK is already a dependency here (§3) and
hand-rolling Svix's HMAC when the vendor ships a verifier is how a signature
check comes to be subtly wrong. **The raw body is required**: `req.text()`, not
the parsed object, so this route bypasses the JSON parser exactly as the
collector does. An unverified payload is a 400 and nothing else — never a
"probably fine".

`email.bounced` and `email.complained` set `MarketingRecipient.status` and end
any enrolment; `email.delivered`, `email.opened`, `email.clicked` and
`email.delivery_delayed` write `MarketingEvent` rows. An event for an unknown
`providerId` is dropped and counted, not an error.

## 17. Settings, and the four-step wizard

**The wizard is full screen and one step per screen**, at
`/marketing/setup/<step>`, which is where the rail's Marketing link points until
`marketingOnboardedAt` is stamped (§2). No icon rail and no sidebar — the section
is not usable yet, so its chrome is a promise the page cannot keep. A breadcrumb
rail names the four steps, a progress border fills across the top, and a footer
carries **Back** and **Continue**. **Continue is disabled until the step is
satisfied**, which is what makes the primary action on each screen unambiguous.

Each step posts the same mutation the settings control posts — the rule
workspace onboarding already follows — so there is one write path per setting
and the wizard cannot drift from the page that maintains it. Every step is
resumable and revisitable.

1. **Connect** — one field, the Resend API key, verified with a real
   `GET /domains` before it is saved. `unknown` passes with a warning; `invalid`
   does not pass.
2. **Identity** — from name, from address, reply-to, and the postal address.
   The from address must sit on the sending domain; a mismatch is Resend's most
   common 403 and the error it returns does not say so.
3. **Domain** — `domains.create` is called for a **subdomain**, and the records
   it returns are rendered verbatim with per-record status from `domains.get`
   (§4). Gmail and Yahoo reject unauthenticated bulk mail, so this gates
   sending — but it may be left pending and returned to, because DNS takes
   hours.
4. **Branding** — the header and footer, built from the workspace's own brand
   before anybody is asked a question (§17.1).
5. **Tracking** — the two Resend domain settings, off, with the two sentences
   from §14.
6. **Test** — send one to yourself, then stamp `marketingOnboardedAt`.

Steps 1–3 are the send gate. `assertSendable()` in `@crm/db/marketing` is the
one function that decides, it is called by materialisation and by the drain, and
its failure is a list of what is missing with a link to the step — not
`ServiceUnavailable`.

**Nothing here is an environment variable.** Same argument as SSO: a
self-hoster's marketer cannot redeploy. The only variable this feature leans on
is the existing `APP_URL`, which builds the unsubscribe link — so a missing
origin **refuses the send** rather than mailing a link to nowhere.

### 17.1 The first template is already theirs

The branding step opens with the work done. We already know the workspace's
website — it is required at onboarding and stored canonical — and
`contextDevKey()` already buys us that domain's logo and brand colour. Nobody
should be asked to paste a hex value we can look up.

- **`brandByDomain` on the workspace's own domain**, the same call
  `runBrand` makes for a `Company`. It yields `logos` (light, dark, icon, with
  an opaque-background variant) and `colors[0].hex`, which
  `brand-mapping.ts` already reduces to `logoUrl`, `iconUrl`, `iconTone` and
  `brandColor`.
- **It is the agent's call, not the API's.** Context.dev is an intelligence
  vendor and `docs/api.md`'s first rule holds — this is precisely the boundary
  the Resend exception in §3 does *not* cross. The API writes an `AgentTask`;
  a direct-lane pass resolves the brand and writes the two `MarketingPartial`
  rows. `brand` is already a `DIRECT_KIND` with no session and no model, and
  this is the same shape of work.
- **The logo is mirrored, never linked** — `mirror()` to Blob, as
  `docs/agent.md` requires, because the vendor URL expires. And **email needs a
  raster**: Context often returns SVG, which Outlook and Gmail will not render,
  so the branding pass rejects an SVG-only logo and falls back to the wordmark
  rather than shipping a broken image. This is the one place the existing
  `isOptimizable` rule is not enough — it governs Next's optimizer, not what an
  email client can draw.
- **The brand colour is contrast-checked before it becomes a button.** White on
  `#006B4F` is 7.4:1 and passes; a light brand colour would fail and we darken
  it until it clears 4.5:1, saying on screen that we did. A button nobody can
  read is worse than a grey one.
- **Every one of these is optional.** No Context key, no logo, an SVG-only
  brand, a colour that cannot be fixed — each degrades to a plain, correct
  default and none of them throws. `lib/capabilities.ts`' rule, applied to a
  first impression.

The output is a real header and footer a marketer can immediately edit, and a
starter template that already looks like them — which is the difference between
a marketing suite somebody sets up and one somebody uses.

## 18. The agent's half

Everything a person can do here, the agent can do. Not by a second
implementation and not over HTTP: the tools write the same rows through
`@crm/db/marketing`, and the API's drain sends them. The agent is a *writer* on
this feature, exactly as it is a writer on contact facts.

| Tool | Notes |
| --- | --- |
| `list_segments`, `read_segment` | Definition and current count |
| `write_segment` | The same zod filter tree; an unknown facet is refused with the list of valid ones |
| `preview_segment` | Count plus twenty sample contacts **with their ids** — three records, no dead ends |
| `list_templates`, `read_template` | The document, not HTML |
| `write_template` | Validated and linted; **errors are returned to the model to fix**, which is the whole reason the linter is a function and not a screen |
| `preview_template` | Rendered plain text, so the model can read what it wrote |
| `send_email` | One named contact, one template, optional overrides. Queues a `DIRECT` send and asks the API to drain |
| `create_campaign` | `BLAST` or `DRIP`. Lands in `DRAFT` |
| `write_campaign_graph` | The whole graph in one call — nodes and edges, **no coordinates**, laid out server-side (§13.5). Validated for cycles, for one root, and for a branch with a dangling handle |
| `update_node` | One node's copy, condition or delay. The narrow tool the co-pilot uses for *"make touch three shorter"* |
| `read_campaign` | The graph, plus per-node stats and the enrolment counts from §13.7 — so the model can answer *"which touch is underperforming"* from one call |
| `schedule_campaign` | A blast. `SCHEDULED` when a person asked in the conversation, `PENDING_APPROVAL` otherwise |
| `campaign_stats`, `read_engagement` | Counts, and a contact's own history |
| `enrol_contact` | Into a drip a human has activated |

**There is no `activate_campaign` tool, and the absence is deliberate.** A drip
goes live when a human clicks Activate on a graph they have looked at. Giving
the model the verb would make the review screen advisory, and the review screen
is the entire control on a thing that emails people for the next three months.

### Named recipients go. Queried recipients get a screen.

*"Send an email to Dana using the onboarding template"* must work, and it does:
the rep named the recipient, named the template, and is sitting in the
conversation. There is nothing left to approve — a review screen there is a
second click for a decision already made, and the tool would be theatre.
`send_email` resolves the contact, resolves the template, checks suppression,
queues the send and pokes the drain. The reply says what went where, with the
contact's id.

A **segment** send is different in kind, and not because it is bigger. The
person who asked did not see who is in it. The count, the exclusions and the
first render are facts they need before it is irreversible, and the only place
those exist is the review screen. So `schedule_campaign` from a conversation
opens it; a campaign is never sent by a sentence.

`lib/approval.ts` draws the third line, and it is the important one:

| Who is asking | `send_email` | `schedule_campaign` |
| --- | --- | --- |
| A rep, in a conversation | Sends | Opens the review screen |
| A dispatched task or a scheduled run — **no human principal** | Refuses | Writes `PENDING_APPROVAL` |

An autonomous session may compose, lint and stage anything it likes. It may not
put a message in front of a customer, because nobody read it. That is not a
limit on the agent's usefulness — *"draft a re-engagement campaign for accounts
that went quiet after a demo"* still produces a segment, a template and a staged
campaign overnight, and a human finds it waiting.

Two further rules on `send_email`, both of which will otherwise be discovered by
a customer:

- **A suppressed address is refused with the reason, not skipped quietly.** A
  rep who asked to email somebody who unsubscribed needs to be told that is why
  it did not happen.
- **It is marketing mail like any other** — footer, unsubscribe link, tracking
  if the install has it on, and a row in the contact's timeline. A one-off that
  quietly opted out of the footer would be the hole every rule in §8 exists to
  close.

## 19. Telemetry

New properties on `install_daily`, all counts and booleans, added to
`ALLOWED_PROPERTIES` first or they are dropped:

`cap_email_resend`, `marketing_onboarded`, `marketing_domain_verified`,
`marketing_templates`, `marketing_segments`, `marketing_segments_dynamic`,
`marketing_segments_with_manual_members`, `marketing_campaigns_by_status`,
`marketing_blasts`, `marketing_drips`, `marketing_drip_nodes_max`,
`marketing_drips_with_branch`, `marketing_drips_with_split`,
`marketing_enrolments_by_status`, `marketing_sends`, `marketing_delivered`,
`marketing_bounced`, `marketing_complained`, `marketing_unsubscribed`,
`marketing_opens`, `marketing_clicks`, `marketing_replies`,
`marketing_tracking_opens`, `marketing_tracking_clicks`,
`marketing_brand_autofilled`, `marketing_copilot_graphs`.

Six of those are new with the drip work and each answers a question we will
otherwise argue about. `marketing_drip_nodes_max` says whether anybody builds
flows big enough to need the canvas or whether four boxes is the real ceiling.
`_with_branch` and `_with_split` say whether branching and A/B — the two things
this plan un-deferred — get used at all. `marketing_copilot_graphs` is how many
graphs were written by the co-pilot rather than by hand, which is the only
honest measure of whether the chat is the feature or the decoration.

`marketing_tracking_opens` / `_clicks` are **whether Resend has them on**, read
from the domain — booleans about a setting, never a rate.
`marketing_brand_autofilled` is whether §17.1 found a logo and a colour, which
is the only way to learn whether that pass is worth keeping.

One funnel step: `first_campaign_sent`.

**Never**: a subject line, a segment name, a template name, a recipient address,
a document, a from address, a domain name, a logo URL, a brand colour, or any
key. The existing list in `docs/telemetry.md` gains these rows in the same
change, and the "what is never sent" section gains the marketing entries — that
file is the promise, and a property that ships before its row is a broken one.

## 20. Design

`docs/design.md` holds, and this section adds nothing to the palette. Two notes:

- **The template editor and the canvas are the two new interactions**, and their
  parts — block list, block toolbar, inspector, preview frame, `flow-canvas` and
  its five node components — belong in `/packages/ui`, not in `apps/app`.
  Whatever they need that shadcn does not have is implemented there as a
  variant.
- **React Flow arrives with opinions and they are refused at the door.** Its
  stylesheet is imported once in `/packages/ui`. A canvas that ships the
  library's default blue is a canvas that looks like a different application,
  and it will be the most-photographed screen in the product.

  **This is a real gate, not an intention.** React Flow theming is a fixed set
  of CSS variables (`--xy-edge-stroke`, `--xy-edge-stroke-selected`,
  `--xy-node-border`, `--xy-node-background-color`, `--xy-handle-*`,
  `--xy-controls-button-*`, `--xy-minimap-*` and the rest). Phase 7 maps **every
  one of them** to a token in a single `flow-tokens.css`, and the spec asserts
  that the built stylesheet contains no literal colour outside that file. Read
  `.agents/skills/react-flow` before starting — the variable list is versioned
  and guessing it produces a canvas that is themed everywhere except the one
  state nobody screenshotted.

  Two of them are not cosmetic. `--xy-edge-stroke-selected` and the handle
  colours are how a person sees **which edge they are about to reattach**, and a
  library default that happens to be legible on white is not a decision we made.

- **Email colours are literal hex, in exactly one file, and that is correct.**
  `packages/email` cannot use CSS variables — Outlook and Gmail do not resolve
  them — so a rendered email carries `#006B4F` rather than `var(--color-primary)`.
  The rule that keeps this from becoming drift is that the literals live only in
  `packages/email/src/theme.ts`, generated from the same source as the CSS
  variables, and no block component writes a colour of its own. The design lint
  excludes `packages/email` for this reason and no other.
- **The Overview page is deferred.** The route exists and renders the wizard
  until onboarding is done; after that it renders the last five campaigns and
  nothing else until it is designed. A dashboard invented by an engineer in the
  same PR as the send queue is a dashboard that gets rebuilt.

The campaign screen's own shape is settled, though, because it is a table and a
sheet like every other list in the app: `data-table` for campaigns, the record
sheet for one campaign, tabs for **Content**, **Audience**, **Schedule** and,
after sending, **Results**.

## 21. Deferred, and what would bring it back

| Deferred | Comes back when |
| --- | --- |
| **SMTP** | A self-hoster asks who will not open a Resend account. It is a `send()` behind the drain and roughly a day — but it arrives without delivery, bounce, complaint, open or click reporting, and without the DNS and tracking setup Resend hands us, so half of §4 would need a second, worse path. That is the cost, and it is why one vendor is v1 |
| **Automatic A/B winners** | Somebody runs four splits by hand. Declaring one is built (§13.4); *deciding* one automatically needs a significance test and a stopping rule, and a tool that promotes a winner off 40 opens is worse than no tool |
| **A full path audit per enrolment** | Somebody asks *which* branch a named person took more than twice. `MarketingSend.nodeId` already answers it for every touch that sent an email; only a `BRANCH` a person passed through without receiving anything is invisible |
| **Goals as objects** | Never, probably. A goal is an exit rule with a reason (§13.2), and a second concept for the same query is how a product grows two funnels that disagree |
| Campaign templates with drips built in (the original ask, still deferred) | After the first three drips exist, because the good examples are the ones we watched work |
| Landing pages, forms builder | Never, probably — tracked forms already file a contact |
| Double opt-in flow | The first install that needs Germany |
| Preference centre with topics | Second complaint about frequency |
| Send-time optimisation | It needs engagement history we will not have for months |

---

## Settled, and why, so it is not reopened

- **Sending is in the API, not the agent.** §3. The mailbox pipeline already
  puts mail vendors in Nest; the intelligence rule is about judgement, and a
  transport has none.
- **The agent can send.** §18. It writes the same rows and pokes the same drain.
  A named recipient goes; a segment opens the review screen.
- **Attachments are supported.** §12. Blob for the bytes, single sends instead
  of batch, 40 MB, and a lint warning rather than a ban.
- **Any member may send**, with their own address as the reply-to. §6. No
  `canSendCampaign` permission, no owner-only gate.
- **Resend, and only Resend.** §4. No transport interface, no SMTP in v1, and
  no reimplementation of what the vendor already does — we render the DNS
  records it issues and read the tracking settings it holds.
- **No pixel, no click redirect, no link rewriter.** §14. Those routes were in
  the first draft of this plan and are deleted, because Resend does it at the
  domain and reports it back on a webhook.
- **The first template is built before anybody is asked.** §17.1. Context.dev
  on the workspace's own domain, the logo mirrored, the colour contrast-checked,
  every part of it optional.
- **Nothing is sent from a rep's Gmail.** A drip sent from a personal mailbox
  reads better and is a worse system: a 2,000/day quota, a personal OAuth grant
  carrying marketing volume, and one revoked token silently stopping a campaign.
  The reply-to already puts the human's name on it and brings the answer back to
  their inbox, which is the part that mattered.

### Changed by the Growth call, 11 August 2026

- **Drips branch, and there is a canvas.** §13. This reverses the earlier
  "no branching, a canvas is a quarter" call. The engine is the cost and a
  branching drip needs it regardless; React Flow only draws it.
- **A blast and a drip are one table with a `kind`.** §6. Not two nouns for what
  a marketer calls a campaign, and not two content paths, two stats queries and
  two renderers.
- **A blast is a one-node campaign.** §6. Content lives on nodes, always, so
  every number in the product is per-node with no special case — which is what
  *analytics on every touchpoint* actually requires.
- **A/B is a `SPLIT` node.** §13.4. No experiment object, no variant table, no
  column on the send. It tests whole paths rather than subject lines, and it
  cost one node kind.
- **Exit is swept continuously, not checked before a step.** §13.2. Somebody
  whose deal closes between touch 4 and touch 5 leaves then, not in nine days.
- **Entry and exit are bulk set operations.** §13.2. Two queries per drip per
  tick at any population. Per-enrolment checks would be ten thousand.
- **Segments take manual members and rule members at once.** §11. A rep adds
  somebody from the contact sheet without first knowing which kind it is.
- **The shell cannot be overridden per node.** §8. The named HubSpot complaint;
  a capability we do not offer is a bug we cannot ship.
- **Reply rate is a first-class number.** §13.7. The mailbox sync already has it
  and no competitor in this category does without an integration.
- **Still one word: segment.** §11. Not audience, not list.
- **The co-pilot is eve through the existing agent panel**, on three new
  `AgentRecordKind`s — campaign, segment, template. §13.6. Not a second agent,
  not a second transcript store, not a second set of the bugs
  `docs/agent-panel.md` records, and not one rail for the canvas and a different
  one for segments later.
- **The composer is `/chat`'s composer**, moved to `/packages/ui`. §13.6.
  Reference chips mean a prompt names a segment rather than describing it.
- **Direct manipulation never goes away.** §13.6. The chat is for the first
  draft and the sweeping change; the canvas, the rule builder and the block list
  are for the tenth edit.
- **Approval is an eve policy, not a flag.** §13.6. Draft edits are silent, live
  edits ask a person, and an autonomous turn is denied rather than parked —
  parking a run nobody can answer hangs it until it expires.
- **Re-entry exists, is off, and needs two numbers to turn on.** §13.8.
  A cooldown alone lets an oscillating segment mail somebody forever, so
  `maxPasses` is the setting that actually stops it.
- **A drip can drain.** §13.9. Stop new entries, let the people inside finish.
  Archive refuses while anybody is walking, and resume restarts the clocks
  rather than firing three weeks of backlog at once.
- **A winner is declared by a person, on reply rate, and does not move anybody
  mid-flow.** §13.4. Escaping into a shared template is a second, separate
  click.
