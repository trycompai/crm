# Connections — rules for AI agents

Covers `/settings/connections` and everything under it: the index, per-connection
pages, the intake endpoint, the add-connection picker, and identity matching.

Read `docs/design.md` first. Read `docs/api.md` before touching `apps/api`, and
`docs/agent.md` before touching `apps/agent`. The Paper file is
`app.paper.design/file/01KZ72S23CM00WXN6S1MP68M03/1-0`, page **crm - grim**.

## The one rule that governs everything here

**A connection is a capability. An automation is an agent.**

A connection page shows what a connection can do, who it is wired to, and which
agents use it. It never owns, authors, or edits an automation. Automations are
built in the agent builder chat by tagging the integration, and they live at
`/agents/:agentId`.

This is already true in code: `builderResource.kind` in
`apps/api/src/conversations/conversations.contracts.ts` is
`["integration", "company", "contact", "deal"]`, and the composer picker in
`apps/app/components/agent-builder/agent-composer.tsx` is labelled "Tag CRM
records and integrations" with ids shaped `google:calendar`, `google:gmail`.
A new integration becomes taggable by extending that enum's id space, not by
building a second authoring surface.

If you find yourself adding a toggle, a trigger builder, or an "Edit automation"
form to a settings page, stop — that work belongs in the builder.

## Removing a connection is an owner or admin decision

A connection is shared. One person disconnecting Slack stops every agent that
posts to it and clears the cached channel list for everybody, so
`SlackConnectionService.disconnect` asks `canManageConnections` (`@crm/auth`)
after `AgentAccessService.assertMember`, and `slack.status` returns `canManage`
so the button is disabled for the same people the service refuses. Being signed
in is not authorisation: `AuthMiddleware` only proves a session exists.

Everything additive — joining a channel, creating one, refreshing people — stays
open to any workspace member, because the agent builder needs it and Slack can
undo it.

## Connecting is refused at the OAuth endpoints, not in the UI

Connecting is the same decision as disconnecting, because `replaceSlackConnection`
deletes every other Slack account row: a second person connecting *replaces* the
workspace's Slack, and every deployed agent then reads from and posts to whichever
Slack they installed. Hiding the button is not enough — `authClient.oauth2.link`
is one POST.

`connectGuard` (`packages/auth/src/connect-guard.ts`) is Better Auth's
`hooks.before`, and it asks the same `canManageConnections` the API does. It
covers all three doors: `/oauth2/link`, `/sign-in/oauth2` (a connection is never
a sign-in method, and that endpoint needs no session) and
`/oauth2/callback/<provider>`. The callback is the one that matters — refusing
there happens **before the code is exchanged**, so a refused attempt writes no
`SlackWorkspaceGrant` user token, no `HubspotConnection` refresh token, and
deletes nothing. Google and Microsoft sign in on different paths and never reach
the guard.

**`GUARDED_CONNECTIONS` is the whole list**, provider id to the three refusal
sentences. A new connection is one entry there, not a second middleware — one
`hooks.before` is all Better Auth takes, and a second guard would replace the
first rather than run beside it.

A workspace with no owner and no admin lets any member connect. There is nobody
left to ask, and a fresh install must not be locked out of its first connection.

## Direction is the organising idea

Every connection declares what it **brings in** and what it **sends**. Use those
two words. Not arrows, not "inbound/outbound", not scope tokens.

`Sends` earns its place by being reassuring when it is empty. HubSpot reads
"Nothing, so nothing here can change HubSpot" — that is the guarantee a migration
needs, stated where someone will look for it. Every scope it asks for is a read
scope, so that line is enforced by the grant and not only by our code.

## Destinations: derived or chosen

When an agent sends something, its destination is one of two kinds. Getting this
distinction wrong is what makes an automation feel like it works by magic.

**Derived** — follows from the record, so never ask. The deal's owner. The
channel that belongs to this deal. Say so explicitly in the UI ("The person who
booked, at the email they booked with. Nothing to choose.") so the absence of a
control reads as deliberate.

**Chosen** — cannot be inferred, so must be asked exactly once. A standing
channel like `#sales`. A naming pattern for channels the agent creates
(`#deal-{company}`). A billing contact.

Chosen destinations are collected **in the builder conversation** with the
Questionnaire, not in a settings form. See "The Questionnaire" below.

## Slack needs two grants, not one

A bot token cannot add itself to a private channel. No Slack scope grants that.
The workspace must also hand over a **user token** (`xoxp-`), which the app then
uses to act as the person who connected Slack.

- **Public channel** — the bot self-joins with `conversations.join`. Bot token only.
- **Private channel** — only a user token can invite the bot. Both tokens.

The bot token lives on `Account`. The user token lives on `SlackWorkspaceGrant`,
keyed by Slack team id, because the grant belongs to the workspace and not to the
person who clicked Connect. `packages/auth/src/slack-grant.ts` writes it, and
`apps/agent/agent/lib/slack-connection.ts` is the only place that reads either.

A missing user grant is a capability that is off, not an error. The connection
page names it, and the private-channel row falls back to asking a human.

**The cached row does not choose the token.** `joinSlackChannel`
(`apps/agent/agent/lib/slack-membership.ts`) reads the channel from Slack with
`conversations.info` before it picks a path. `slackChannel.isPrivate` and
`isMember` are a cache, and a cache is wrong the moment somebody adds the bot in
Slack — or the moment a new column arrives with a default, which classifies every
existing row as public and non-member until the inventory next runs. A bot that
cannot see the channel at all is read as private and not a member, which is the
only safe reading. When Slack and the row disagree the row is corrected and a
`slack-people-match` task is queued, so the connection page stops showing the
stale classification too.

**Nothing else calls Slack to read the channel list.** The agent builder reads
the cached rows and, when they are older than `SLACK.inventory.staleMs`, queues
the same background task rather than waiting on a round trip
(`apps/agent/agent/lib/slack-people.ts`). A builder chat that blocks on Slack is
a builder chat that is as slow as Slack is.

## Permissions are shown in groups, not one line each

Sixteen scopes read as noise. Group them by what they touch — people, channels it
can read, messages it can send, channels it can change — and give each group a
count of how many reach the whole workspace. `SLACK_SCOPE_GROUPS` in
`packages/auth/src/slack-scopes.ts` owns both the grouping and the plain wording.

The catalogue is the single source. `auth.ts` builds its scope request from it and
the page renders from it, so the screen cannot promise something the app never
asked for.

## HubSpot is one account for the whole team, not one per rep

HubSpot scopes an install to the **account** — the portal, `hub_id` — and not to
the person who approves it. HubSpot states it plainly: an access token "does not
reflect the permissions or limitations of what a user can do". So one admin
connects once and every agent reads every deal. Nobody else is asked, and asking
them would be wrong.

Three things follow, and each is a rule:

- **Only a HubSpot Super Admin, or a user with Marketplace Access, can install
  an app.** Your reps cannot connect it however the CRM feels about them, so the
  pre-connect page says so rather than letting them find out at HubSpot.
- **One row, keyed by `portalId`.** `replaceHubspotConnection`
  (`packages/auth/src/hubspot-grant.ts`) deletes every other `Account` row and,
  when the portal actually changes, every cached pipeline with it. A second
  admin connecting a *different* portal replaces the first, exactly as Slack
  does, which is why `connectGuard` covers HubSpot too.
- **Uninstalling in HubSpot revokes the refresh token, and that is the only
  thing that does.** A refresh token does not expire otherwise. The next refresh
  answers `BAD_REFRESH_TOKEN`, `markHubspotRevoked` stamps `revokedAt`, and the
  connection page leads with it. Everything else is a transient error, recorded
  in `lastError` and cleared by the next successful read.

## The token is renewed under a lock, once

An access token lasts 30 minutes. Two workers refreshing the same refresh token
at the same time is a **documented cause of `BAD_REFRESH_TOKEN`** — the account
breaks for everybody, not just for the losing worker.

`hubspotAccessToken` (`apps/agent/agent/lib/hubspot-connection.ts`) takes the
`hubspot-token` advisory lock, **re-reads the row inside it**, and returns the
other worker's token when one landed while it waited. Only then does it call
HubSpot. `withHubspotTokenLock` (`@crm/db/hubspot`) carries its own `maxWait` and
`timeout`, because a network call inside a Prisma interactive transaction
otherwise dies on the five-second default.

## A stage name never decides won or lost

`dealstage` holds a **stage id**, and the id is per pipeline. Only the default
pipeline uses readable ids (`closedwon`, `closedlost`); every custom pipeline
uses numbers like `701459927`. **String matching on the stage is wrong for any
account that made its own pipeline**, which is most of them.

Two sources say the outcome, and both are read:

- The deal's own `hs_is_closed_won` and `hs_is_closed_lost`, which HubSpot sets.
- The stage's `metadata.isClosed` and `metadata.probability` from
  `GET /crm/v3/pipelines/deals` — `probability` 1 is won, 0 is lost.

`outcomeOfStage` (`@crm/db/hubspot`) is the single rule, and `HubspotStage.outcome`
stores its answer so a filter is a query rather than a scan.

**Both metadata fields arrive as strings.** `"false"` is truthy, so a plain
truthiness check marks every open deal closed. `packages/validation/src/hubspot.ts`
coerces them at the read, which is the only place that may.

## The search endpoint stops at 10,000

`POST /crm/v3/objects/deals/search` refuses to page past 10,000 results with a
400. `listHubspotDeals` reports `reachedCeiling` and stops handing out a cursor
rather than walking into that error. Narrow with `modifiedSince` or `pipelineId`;
do not raise the page size and hope.

## Identity matching is connection-level

"Message whoever owns the deal" needs a CRM user *and* a Slack member. Those are
two identities. Match on email, show the result, and let a human fix it.

An unmatched person must be allowed. The automation stops and says so rather than
guessing at a similar name — and the connection page surfaces the count so the
gap is visible before it bites.

## The Questionnaire

The strongest pattern in this work. When the builder cannot derive something, it
asks in chat rather than failing or guessing.

Reuse `packages/ui/src/components/questionnaire.tsx` — `Questionnaire`,
`QuestionnaireItem`, `QuestionnaireTitle`, `QuestionnaireDescription`,
`QuestionnaireChoices`, `QuestionnaireChoice`, `QuestionnaireActions`,
`QuestionnaireSubmit`. It is wired through `agent-clarification-composer.tsx` and
`builderQuestionResponseInput`.

Rules for a question:

- Ask only what cannot be derived. Say which parts you already worked out.
- Title is the question in plain words. Description says why it is being asked
  ("This one is a standing channel, so it is the same every time").
- Choices carry a fact that helps decide — member counts, last activity — not
  decoration.
- Always offer an escape ("Search for another channel").
- Footnote the constraint that shapes the list ("Only channels Slack has been
  added to").
- The submit label restates the answer: "Use #sales", not "Continue".

## Failure is on the surface

Nobody owns these automations day to day, and a broken one currently sits for a
week or two. So every connection surface leads with liveness, not configuration:
"Last call arrived 31 minutes ago", "1 call needs a look", "3 of 4 matched".

An automation you cannot see rot in is one nobody will own.

## Irreversible things are bounded in writing

Anything that messages a customer states its own limits next to the switch:
"It stops the moment Stripe reports the payment, and never messages the same deal
twice in a day." "It runs once per deal." An agent that DMs people about money
needs its guardrails legible to whoever turns it on.

## Layout

Page metrics are tokens. Never a literal.

| Token | Value | Use |
| --- | --- | --- |
| `--spacing-page-top` | 40px | Top bar to first line of content |
| `--spacing-page-bottom` | 40px | Below the last block |
| `--spacing-page-inline` | 24px | Viewport gutters |
| `--spacing-page-gap` | 24px | Between top-level blocks |
| `--spacing-block-inline` | 20px | Inset on every block, **including the page title** |
| `--container-page` | 820px | Content column |
| `--container-page-wide` | 1120px | Two-column or table pages |
| `--container-narrow` | 560px | Empty states, dialogs |
| `--container-sheet` | 640px | Edit sheet over a page |

`--spacing-block-inline` is the one doing real work: a card sits flush at the
column edge and carries 20px of its own padding, so card text lands in the same
lane as the title on a flat page. The two page types stay aligned without
matching each other's chrome.

Short single-decision pages (empty state, pre-connect, match people) centre
vertically. List pages top-align so nothing jumps when a row is added.

## Cards versus flat

Cards are for **discrete, independently-actionable objects** — an agent you can
pause on its own, a connection row with its own Manage button, a choice in a
picker, a Questionnaire.

Flat sections separated by a 1px `--color-dark-border` rule are for **a page
describing one thing** — the intake page, the pre-connect page.

The split is by what the block *is*, not by page. Do not card a section; do not
flatten a list of separately-actionable objects.

## Brand marks

`packages/ui/src/components/brand-logos/` has claude, eve, github, google,
microsoft, nextjs, slack, stripe, vercel. **Stripe is there** — use it.

Missing from the repo and living only in Paper: **ergo** (`ergo logo` `KJJ-0`).
Extract its path data into `brand-logos/*.tsx` shaped like `stripe.tsx` when
building these screens. **hubspot** and **docusign** now exist.

Until a mark exists, `EntityLogo` falls back to an initials monogram on
`bg-muted` — that is correct behaviour, not a placeholder to design around. Only
icon marks are used at these sizes; the wordmarks stay unused.

Docusign is spelled with a lowercase s since its 2024 rebrand. The note-taker is
**Ergo**.
