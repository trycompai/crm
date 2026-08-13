# Marketing — read before touching campaigns, templates, segments or sending

The design record and the reasoning are in
[`docs/plan/marketing-suite.md`](./plan/marketing-suite.md). This file is the
short list of rules that hold, and what breaks when they do not.

## A blast is a campaign with exactly one node

There is one campaign table with a `kind`. Content lives on
`MarketingCampaignNode`, never on the campaign — so a blast has a single `EMAIL`
node and every number in the product is a group-by on `nodeId` with no special
case. Creating a campaign writes its first node in the same transaction, and no
code downstream handles a campaign with no nodes.

**`@@unique([nodeId, recipientId, pass])` is the idempotency of everything.**
`pass` is what lets somebody walk a drip a second time; without it the second
walk silently sends nothing, which looks exactly like success.

## A campaign takes many segments, and an exclusion always wins

`MarketingCampaignSegment` is the join, with a `mode` of `INCLUDE` or `EXCLUDE`.
There is no `segmentId` column on the campaign, because two ways to say who gets
an email is one way too many.

**`campaignAudienceWhere()` in `@crm/db/marketing/audience.ts` is the only
answer.** It is `OR(includes) AND NOT OR(excludes)`, and the blast, the drip
entry sweep and the count on the screen all call it. Write a second one and a
marketer sees a number the send does not agree with.

A campaign with no included segment sends to nobody. `materialise` and
`sweepEntries` both return `0` rather than guessing, and `activate` refuses a
`CONTINUOUS` drip that has neither a segment nor an `entryDefinition` — a live
drip that enrols nobody looks identical to a working one.

## One compiler, and it must stay one

`@crm/db/marketing/segments.ts` exports **two functions and no more**.
`matches()` is one line over `compile()`. Five things ask "who is in this list" —
the count, the blast, the entry sweep, the exit sweep and a `BRANCH` node — and
they must not get five answers.

**Do not write a per-contact tree walker.** It will be faster and it will drift
on the first facet that touches a relation, and the drift shows up as a branch
sending people down the wrong arm, which nothing alerts on because both arms
send something.

**An install starts with four segments.** `ensureDefaultSegments` writes All
contacts, Added in the last 30 days, Quiet for 60 days and No open deal. It runs
on the seed and again when somebody finishes marketing setup — before
`onboardedAt` is written, and a failure fails the finish rather than redirecting
a rep into a workspace with no lists. While four live defaults exist it does
nothing, so a rep who renames one keeps the rename and no copy appears. Below
four it repairs each name: a deleted default comes back, a rep's own segment
holding a default's name becomes that default, and a missing one is created —
so a partial first run heals on the next. An archived segment holding a
default's name comes back as that default, because `name` is unique and no
second row can hold it. The create is an upsert on `name`, so two finishes at
once cannot make one of them fail on the unique index and skip `onboardedAt`. Every one of them carries
`contact.hasEmail`, because a contact with no address is queued and skipped.

## Entry and exit are set operations

Two queries per drip per tick, whatever the population. `sweepEntries` and
`sweepExits` compile to one `where` and update in bulk. A per-enrolment check is
ten thousand queries a minute at ten thousand enrolments, and the spec asserts
the query count for that reason.

**Exit sweeps every tick, not before each step.** Somebody whose deal closes
between touch 4 and touch 5 leaves then, not in nine days.

## The shell is not the author's

The compiler appends the postal address and the unsubscribe link, and emits
`List-Unsubscribe` and `List-Unsubscribe-Post`. They are not blocks and no tool,
screen or agent can remove them. A template picks a header and footer; a node
picks a template and edits **body copy only**.

`renderEmail()` is called on the server for the preview and for the transport.
There is no second renderer, and there must not be — the day they drift is the
day somebody sends the drift to nine thousand people.

## The preview shows the email at its real width

`EmailPreview` in `@crm/ui/components/email-preview` is the only preview. The
composers, the template editor, the shell editor and the standalone preview page
all use it, so the device toggle and the frame stay the same everywhere.

The frame is the device width — `EMAIL_WIDTH` from `@crm/email/theme` for
desktop, 390 for mobile. **Never give the frame a percentage width.** The
preview answers "what does this email look like at this width", and a frame
that tracks the pane answers a different question at every pane size.

The email itself is fluid: the container is `width:100%` capped at
`EMAIL_WIDTH`, an MSO conditional table holds Outlook's Word engine at the same
fixed width, every image carries `max-width:100%` and every text block breaks
long words. `overflow.spec.ts` in `packages/email` renders the adversarial
shapes — pasted URLs, wide logos, oversized images — and fails on the first
fixed width past `EMAIL_WIDTH`.

An editor column beside the preview is `overflow-x-hidden`. One wide child used
to shear the whole column sideways and clip every label.

## Connecting Resend is OAuth first, a pasted key second

`ResendOauthService` registers this workspace with Resend at runtime — RFC 7591
dynamic registration, no client id in `.env` — then runs PKCE S256 as a public
client. **There is no Resend app to provision and no new environment variable**,
which is what keeps a self-hoster able to connect at all.

The endpoints come from Resend's discovery document
(`https://api.resend.com/.well-known/oauth-authorization-server`) and are frozen
in `RESEND_OAUTH` in `@crm/db/marketing`. Do not hand-write one somewhere else.

`redirect_uri` is built from **`API_URL`**, never `APP_URL`, matching
`ssoCallbackBase()` and the rule in `docs/environment.md`. The callback is a Nest
controller at `/api/marketing/resend/callback`, which the app's `/api/*` proxy
already forwards, so there is no Next route to keep in step. Moving `API_URL`
invalidates the registered client — reconnect after.

**The API key path stays.** `resendConnection()` answers `"oauth" | "key" | null`
and `ResendService.client()` prefers the token, refreshing it a minute before it
expires. An access token lives 15 minutes; only the refresh token matters.

**A refused refresh is read, not swallowed.** `invalid_grant`, `invalid_client`
and `unauthorized_client` mean the grant is gone at Resend, so the tokens are
cleared and `resendConnection()` drops to the API key or to `null` — a screen
that says "connected" while every send fails is worse than one that says
nothing. Any other status keeps the tokens, because Resend being down for a
minute is not a disconnect. The token write retries once, and a second failure
is logged at `error` naming what a person has to do.

## Resend's answer beats ours

If Resend has an endpoint for it, read theirs: DNS records, verification status,
open and click tracking. **Never compose a DNS record** and never serve a
tracking pixel. There is no `/api/m/o/`, no click redirect and no link rewriter
in this codebase, and adding one is a mistake rather than a feature.

**We never onboard a domain to Resend.** The settings page and the wizard list
the domains Resend already holds and let a person pick a verified one. There is
no create-domain call and no DNS record rendered anywhere, because Resend's
dashboard does that job and does it better. Open and click tracking are two
switches that write straight to Resend's domain.

`marketingResendDomainId` is the handle. Tracking state is not mirrored into a
column, because a local copy goes stale the moment somebody changes it in
Resend's dashboard — which is where we tell them to change it.

## Two numbers lie, and the UI has to say so

- **Open rate is inflated.** Apple Mail Privacy Protection fetches the pixel
  before a human looks. Say it wherever an open rate appears, and never judge an
  A/B winner on opens.
- **A `BRANCH` on opened routes people, not just charts.** `validateGraph`
  refuses it outright when open tracking is off — that arm can never fire, so it
  is dead code — and warns when it is on.

## The unsubscribe page does not unsubscribe on load

Link scanners fetch every URL in a message before a human sees it. `GET /u/:token`
shows one button; the button writes. `POST /api/m/u/:token` — the
`List-Unsubscribe` target — writes immediately and returns an empty 200, because
scanners do not POST.

`MarketingRecipient` never cascades from a contact delete. The address stays
unsubscribed forever, which is the whole point.

## Sending lives in the API, and that is not a rule bending

`docs/api.md` names mail as the second documented exception to *no vendor client
in Nest*, beside the exchange-rate fetcher. A mail provider carries a message
somebody already wrote; a data vendor forms an opinion about somebody. What
would breach the rule is putting composition, segment reasoning or
"who should get this" in Nest — and none of that is there.

## The header and footer are generated, then edited

`runMarketingBrand` writes both the first time marketing is connected. When
Context.dev returns a raster logo for the workspace domain it is mirrored to
our own blob and becomes an image block linking to the site; when it does not,
the header is a wordmark. An SVG or a WebP is refused, because Outlook will not
draw either.

After that a person owns them. They are rows in Templates, they open the same
editor a template does, and the co-pilot has `read_shell` and `write_shell`.
`write_shell` always asks a person first and is denied to an unattended run: it
reaches every email anybody has already written. It accepts only the two
defaults — outgoing mail wears nothing else, so a write to any other row would
change nothing anybody receives and is refused rather than reported as done.

## A refused write says which field

`documentProblems()` reports the Zod path and message for every issue, and the
block union is discriminated on `type` so the report names the failing branch
rather than "Invalid input". `write_template`, `write_campaign_graph` and
`write_shell` return those problems alongside `BLOCK_SHAPES`, the whole
vocabulary, so one corrected call is the expectation.

The shape is unguessable — every `text` field is an array of runs, not a
string — so it is written down in the `writing-an-email` skill and every write
tool names that skill in its first sentence. An agent that probes the linter
ten times is a documentation failure, not a model failure.

## The agent writes rows, never bytes

Fourteen tools in `apps/agent/agent/tools/`, all through `@crm/db/marketing`.
`update_node` changes one node in place — use it for *"make touch three
shorter"* rather than rewriting a graph and losing every hand-placed position.
Selecting an email step on the canvas mounts the co-pilot beside its sheet, and
the session's preamble names that node. The conversation files under the
campaign **and** carries `campaignNodeId`, so the campaign rail lists only
campaign-level threads and each step keeps its own. Closing the step returns
the rail to the campaign's threads; `?thread=` resets on every node scope
change. Edits land on the step the rep is looking at.
`schedule_campaign` moves a draft to `PENDING_APPROVAL` with a note; it appears
under **Waiting for you** on the Marketing overview and a person clicks Approve.
That is the whole of the unattended lane: an overnight run stages, a human
sends.
None holds a transport. `write_template` and `write_campaign_graph` **refuse and
hand the problems back** rather than saving — that loop is why the linter and
the validator are functions rather than screens.

**There is no `activate_campaign` tool, and there must not be.** An approval
prompt can be clicked through; a missing tool cannot. A campaign goes live when
a person clicks Activate on a graph they have looked at.

Approval is an eve policy, not a flag: a draft edit is silent, a live-drip edit
asks a person, and an autonomous principal is **denied with a reason** rather
than parked in a run nobody can answer.

## A send freezes what it was going to say

`subject`, `preheader`, `document`, `fromName` and `replyTo` are copied onto
`MarketingSend` when it is queued, not read back from the node when it goes.
Editing touch three tomorrow must not change the email that was queued today.

`fromName` and `replyTo` are per campaign and fall back to the workspace. **The
from-address is never per campaign** — it has to sit inside the verified Resend
domain, and a second address is a deliverability problem wearing a feature's
clothes.

## A send reaches the timeline, and never bumps the clock

`MarketingActivityService.file()` writes one `Activity` per **successful** send,
so a rep opening a contact sees the marketing email beside the sales one. A
queued or skipped send writes nothing.

**It must never call `ActivityStampService.touch`.** `lastActivityAt` feeds the
`activity.within` and `activity.notWithin` facets, and one of the four default
segments is *Quiet for 60 days*. An email we sent is not the contact being
active, and bumping the clock would let a nurture drip keep somebody out of the
very segment that feeds it. `marketing-activity.integration.spec.ts` asserts it.

The author is the contact's owner, falling back to any user, matching
`tracking-filing.service.ts`. Every row carries
`meta: { automated: true, source: "marketing" }`.

## Quiet hours hold, the cap skips

`deferQuiet` pushes every due `CAMPAIGN` and `DRIP` send to the next open hour.
It never touches a `TEST` or a `DIRECT` send: a person is waiting on both, and a
test that silently does nothing at 3am is a broken first run.

`skipOverCap` counts what a recipient has already had in the last 24 hours and
marks the rest `SKIPPED` with `skipReason: "daily-cap"`. It runs after the claim,
so one place covers a blast and a drip touch alike.

**The cap reads the origin, for the same reason the quiet hours do.** Only
`CAMPAIGN` and `DRIP` are counted. A marketer testing an email twenty times must
not have the twenty-first vanish into `daily-cap`, and `ClaimedSend.origin`
exists so the skip can tell the difference.

Both read `marketingQuietStart`, `marketingQuietEnd`, `marketingTimeZone` and
`marketingDailyCap`, and all four are editable on the settings page. A setting
that is stored, shown and ignored is worse than one that is absent.

## The drain, in order

Replies, exits, entries, advance, send. Replies land first so an exit rule can
see one that arrived thirty seconds ago. It runs in-process every 30 seconds and
on `POST /internal/marketing/drain` for serverless, which takes `CRON_SECRET`
**or** `AGENT_BRIDGE_SECRET` and refuses when neither is set.

`claimDueSends` binds the clock as a parameter rather than using `now()`.
`dueAt` is a naive timestamp, so `now()` compares against the session timezone
and claims nothing — that bug is why the specs exist.

## A campaign can pause itself

Over 5% hard bounces or 0.3% complaints, past fifty sends, `pauseUnhealthy`
stops it and writes why. This is the one place the product overrules the
marketer, because the damage lands on the domain every other campaign shares and
outlasts the campaign causing it.

## Telemetry

Counts and booleans. Never a subject, a segment name, a rule, a recipient, a
domain or a key — and never an open or click **rate**, only totals.
`docs/telemetry.md` has the table, and a property that ships before its row
there is a broken promise.
