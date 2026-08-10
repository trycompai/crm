# Fix spec — Slack belongs to the workspace, and the bot should reach its own channels

`v0.2`. Replaces `fix-slack-is-not-an-identity.md`. Read-only investigation
complete; every claim is backed by a named line of code, a Better Auth source
line, or a database query.

This is open source. Nothing here may assume Comp AI's Slack workspace, Comp
AI's domain, or a Comp AI-shaped team. It must work on a fresh self-hosted
install with one admin and an empty database.

---

## Mission

**Two problems, one cause: the CRM treats a Slack workspace bot as if it were a
personal login.**

1. **Connecting fails outright.** Slack is installed through Better Auth's
   *identity linking* flow, which refuses unless the installer's Slack email
   equals their CRM email. The redirect dies with `email_doesn't_match` and no
   connection is written.
2. **Once connected, the bot cannot reach anything.** It has no scope to join a
   channel, and the CRM throws away the list of channels it could join — so a
   human has to `/invite` the bot to every channel by hand, with no indication
   anywhere in the product that this is required.

A Slack install is **one bot, one token, many humans, one workspace**. Model it
that way and both problems disappear.

---

# Part 1 — The connection belongs to the workspace

## The symptom

Signed in as any user whose Slack profile email differs from their CRM email,
Connect Slack redirects to Slack, is approved, and returns to an error page with
`email_doesn't_match`. Nothing is written:

```
account rows where providerId = "slack":  0
```

## Root cause

`packages/auth/src/auth.ts:71`:

```ts
accountLinking: {
  enabled: true,
  trustedProviders: [GOOGLE_PROVIDER_ID, MICROSOFT_PROVIDER_ID, "slack"],
},
```

`allowDifferentEmails` is unset, so it defaults false. Better Auth 1.6.25,
`plugins/generic-oauth/routes.mjs:238`:

```js
if (ctx.context.options.account?.accountLinking?.allowDifferentEmails !== true
    && link.email.toLowerCase() !== userInfo.email.toLowerCase())
  redirectOnError(ctx, resolvedErrorURL, "email_doesn't_match");
```

`link.email` is the CRM user; `userInfo.email` is the Slack profile email our
`getUserInfo` returns from `users.info`.

**`trustedProviders` does not help** — that governs auto-linking at *sign-in*.
**There is no per-provider override**; all three call sites read the same global
flag (`api/routes/account.mjs:180`, `api/routes/callback.mjs:102`,
`plugins/generic-oauth/routes.mjs:238`).

## Why it is a category error

- `auth.ts:117` requests only `scopes`, never `user_scope`. Slack OAuth v2 then
  returns a **bot token** (`xoxb-`) at the top level; a user token would sit
  under `authed_user.access_token`. Better Auth stores `tokens.accessToken`, so
  the row holds a **workspace credential in an identity table**.
- The consumer already knows. `slack-connection.service.ts` looks the connection
  up with **no `userId` filter** (`where: { providerId: "slack", accessToken: { not: null } }`).
  It is already workspace-wide in everything but storage.
- `slackMemberMatch` exists *because* a CRM email is usually not a Slack email.
  The link flow demands the opposite. The product contradicts itself.

## The CRM is a single-workspace install

`packages/db/src/workspace.ts:4` — `export const WORKSPACE_ID = "workspace"`, a
hardcoded singleton referenced in 29 places across the API. There is one
`Organization` row. So "belongs to the workspace" means one installation row for
the whole instance. Do not build multi-tenant plumbing; do not assume it either.

## Work

**1. `SlackInstallation` model.** One active row per install. Fields: `teamId`,
`teamName`, `botUserId`, `accessToken`, `scope`, `installedById` (audit only —
who clicked, not who owns), `installedAt`, `updatedAt`.

`teamName` also removes the placeholder at `slack-connection.service.ts:61`,
which currently returns the literal string `"Slack workspace"`.

**2. Own the OAuth round trip.** An authorize redirect and a callback that
exchanges the code at `https://slack.com/api/oauth.v2.access` and writes the
installation. No identity linking, no email comparison, no `account` row.

Keep `isSlackConfigured` so a missing `SLACK_CLIENT_ID` removes the capability
rather than throwing — `AGENTS.md`, self-hosting rule.

**3. Any workspace admin may connect or disconnect.** They already have access to
everything the bot can see; per-user ownership buys nothing and creates an
orphan when that person leaves. Record who installed it for audit, gate on
admin role, and show the installer's name on the connection page.

**4. Repoint the readers.** `slack-connection.service.ts` and
`apps/agent/agent/lib/slack-people.ts:20` both query `account`. Both move to
`SlackInstallation`. Neither scopes by user today, so behaviour is unchanged.

**5. Update disconnect.** `SlackConnectionService.disconnect()` currently deletes
`account` rows and clears `slackChannel`. Delete the installation row instead,
keeping the same rules: **clear cached channels** (a new app means a new bot
user, a member of nothing) and **keep `slackMemberMatch`** (Slack user ids are
workspace-scoped and survive a reinstall).

**6. Remove `"slack"` from `trustedProviders`** (`auth.ts:73`). It is not an
identity provider.

**7. Migrate.** Move any existing `providerId: "slack"` account rows into the new
table, then delete them. Locally there are currently zero — confirm before
assuming that holds elsewhere.

**Do not** set `account.accountLinking.allowDifferentEmails: true`. It is global
and would loosen Google and Microsoft linking, which *are* identity providers
where email equality guards against attaching someone else's mailbox.

---

# Part 2 — Let the bot reach its own channels

## The symptom

After connecting, agents cannot post anywhere until a human runs `/invite` in
each channel. Nothing in the product says so. A destination the bot has not been
invited to reports as unavailable, which reads as "that channel does not exist".

## Root cause — two independent gaps

**The scope is missing.** `auth.ts:117` requests:

```
channels:history  channels:manage  channels:read  channels:write.invites
chat:write  conversations.connect:write  groups:history  groups:read
groups:write  groups:write.invites  im:write  users:read  users:read.email
```

`conversations.join` requires **`channels:join`**, which is not in that list. The
bot is structurally incapable of adding itself to a channel.

**The inventory is discarded.** `slack-people.ts:139` lists *all* public and
private channels — but `persistSlackChannels` (line 87) keeps only the ones the
bot is already in:

```ts
const available = channels.filter(
  (channel) => channel.is_member && !channel.is_archived,
);
```

Everything joinable is dropped before it reaches the database, so no UI can offer
it. `SlackChannel` has no notion of "exists but not joined", and no
public/private distinction.

## The distinction that has to exist

Today `SlackChannel.available` conflates two different facts. Separate them:

- **Reachable** — the bot is a member. Technical. Changes when the bot joins or
  is removed.
- **Allowed** — the workspace has permitted agents to post there. Policy. Set by
  an admin, and the thing "scope what channels" actually means.

An agent may use a channel only when it is **both**. Keeping them separate is
what lets the UI say *"the bot isn't in #finance"* rather than *"#finance is
unavailable"*, and lets an admin deny a channel the bot happens to be in.

## Work

**1. Add `channels:join` to the scope list.** Note in the connection UI that
existing installs must reconnect to pick up a new scope — Slack does not grant
scopes retroactively.

**2. Persist the whole inventory.** Store every non-archived channel with
`isMember`, `isPrivate`, `memberCount`. Drop the `available` flag in favour of
the two fields above plus an admin-set `allowed`.

**3. Channel access UI** on the Slack connection page: every channel, its state,
and one action each.

- **Public, bot not a member** → "Add the bot", calling `conversations.join`.
- **Public, bot is a member** → "Remove" (verify the exact leave scope against
  Slack's docs before implementing; `conversations.leave` is not covered by
  `channels:join`).
- **Private, bot not a member** → **the bot cannot self-join a private channel.**
  Show the exact instruction: invite `@<botname>` in that channel, then Refresh.
  Do not offer a button that cannot work.
- **Allowed** toggle, independent of membership.

**4. Make failure legible at send time.** When a post fails with
`not_in_channel`, say so and link to this page. Today it surfaces as a generic
unavailable-destination error — see
`.agents/prompts/fix-agent-external-actions.md`.

**5. Refresh must be cheap and obvious.** Channel state changes in Slack, not
here. The existing `refreshPeople` path re-inventories; the channel UI needs the
same, and must not depend on the people-match job having run.

## Definition of done

- Connecting Slack succeeds whatever the installer's Slack email is.
- `allowDifferentEmails` is still unset; Google and Microsoft linking unchanged.
- No `account` row is created for Slack.
- The connection page shows the real workspace name, not "Slack workspace".
- Disconnect removes the installation and cached channels, and keeps matches.
- A fresh install with no `SLACK_CLIENT_ID` disables the feature without
  throwing, and says why.
- An admin can add the bot to a public channel from the CRM, without Slack.
- A private channel states the manual step instead of offering a dead button.
- An admin can deny a channel the bot is in, and agents respect it.
- `not_in_channel` at send time names the channel and links to the fix.
- Typecheck and Biome clean. No code comments. No `Co-Authored-By`.

## Note for whoever picks this up

Slack's install shape — one bot, one token, many humans — is the same shape as
HubSpot, Stripe and Docusign. Whatever table and callback this establishes should
be the pattern for all of them. Only integrations that genuinely are *this
person's account*, like a personal mailbox, belong in Better Auth's `account`.

Related: `.agents/prompts/fix-agent-external-actions.md` (the runner still cannot
post to Slack at all) and `.agents/prompts/fix-builder-conversation-state.md`.
