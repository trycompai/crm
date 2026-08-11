# What Comp's own repos do with Slack

Read from `trycompai/comp-slack-worker` and `trycompai/customer-success-agent`.
This records the parts worth copying and the parts worth avoiding, so nobody has
to clone them again to answer the same question.

## The finding that matters: a bot cannot add itself, a user token can

A bot token cannot join a private channel. No scope grants it. Comp solves this
everywhere by holding a **second token** — a user token (`xoxp-`) from the person
who installed the app — and acting as that person.

`comp-slack-worker/src/endpoints/share.ts` is the clearest example:

```ts
const channel = await createOrFindPrivateChannelAsUser(userToken, channelName);
await inviteBotAsUser(userToken, channel.id, botUserId);
```

It creates the channel as the user, then invites the bot as the user. The bot
never joins anything by itself. `customer-success-agent` does the same at scale
in `scripts/bulk-join-channels.ts`, using `admin.conversations.invite` with an
`xoxp-` token to put the bot into every `cs-*` channel.

The rule that follows:

- **Public channel** — the bot self-joins with `conversations.join`. One token.
- **Private channel** — only a user token can add the bot. Two tokens.

So "which channel does this agent live in" is answerable in the UI for public
channels today, and for private channels only once a user token is stored.

## Tokens

| Token | Prefix | Who it acts as | Used for |
| --- | --- | --- | --- |
| Bot | `xoxb-` | The app | Posting, reading, self-joining public channels |
| User | `xoxp-` | The installer | Creating channels, inviting the bot, admin search |

Comp keeps both in environment variables and asserts the prefix at the boundary:

```ts
if (!userToken?.startsWith("xoxp-")) throw new Error("SLACK_USER_TOKEN (xoxp-) is required.");
if (!botToken?.startsWith("xoxb-")) throw new Error("SLACK_BOT_TOKEN (xoxb-) is required.");
```

## Idempotency is done by name, then by row

Channel creation is idempotent by name. `createChannel` catches `name_taken` and
falls back to `findChannelByName`, and `slack_create_channel` returns
`alreadyExisted: true` rather than failing.

Webhooks are idempotent by a unique row. `webhooks/hubspot.ts` inserts a
`webhookEvent` keyed on the provider's `eventId` and treats a unique-constraint
violation as "already handled":

```ts
try {
  await db.webhookEvent.create({ data: { source: "hubspot", externalId, ... } });
} catch (error) {
  if (error instanceof Error && error.message.includes("Unique constraint")) continue;
  throw error;
}
```

Matching the string `"Unique constraint"` is fragile. `lockIdempotencyKey` in
`@crm/db/idempotency` is **not** a replacement for it. The two do different
jobs, and only one of them survives a commit.

`lockIdempotencyKey` takes a `pg_advisory_xact_lock` on a hash of the key. That
lock lives exactly as long as the transaction: Postgres releases it at commit or
rollback and keeps no record that it was ever held. So it serialises two
deliveries of the same key that arrive *at the same time*, and it does nothing
at all about one that arrives a second later. Used on its own it is not
deduplication, it is a queue of one.

The persisted unique row is what makes a handler idempotent, and it is still
required. Use both together: take the lock first so the racing delivery waits
rather than colliding, then read or insert the row inside that same transaction
and let the unique constraint refuse the duplicate. `queueEventAgentRuns`
(`apps/agent/agent/lib/custom-agent-dispatch.ts`) is the pattern — it calls
`lockIdempotencyKey`, then upserts `agentRun` on its unique `idempotencyKey`.

What is worth taking from Comp's version is the shape, not the string match:
catch the violation from the constraint, and treat it as *already handled*
rather than as an error. Prisma reports it as `P2002`, so check the error code
and never the message text.

## Signature verification

`webhooks/slack/verify-signature.ts` is worth copying almost verbatim. It checks
the timestamp is under five minutes old *before* comparing, and builds the base
string as `v0:${timestamp}:${rawBody}` over the **raw** body, not a re-serialised
one.

It compares with `!==` rather than a timing-safe compare. Ours uses
`timingSafeEqual` and should stay that way.

## Every Slack call is wrapped

`withRetry` wraps each call in `packages/slack-client`. The bulk script also
honours `Retry-After` on `ratelimited` and sleeps 1.5s between writes. Any loop
we write over channels needs the same, or Slack will throttle the whole sweep.

## Rich content is a Canvas, not a chart

There is no automated chart generation. `packages/ui/src/components/chart.tsx`
is shadcn's chart in the web dashboard and never reaches Slack. For anything
richer than a message they create a **channel canvas** from a template:

```ts
await client.apiCall("conversations.canvases.create", {
  channel_id: channelId,
  title: "🔴 Comp AI Onboarding",
  document_content: { type: "markdown", markdown: documentContent },
});
```

## Conventions we should not copy

- `catch (e) { if (!String(e.message).includes("name_taken")) throw e }` — error
  identity by substring.
- `result.channel as { id: string; name: string }` — casts instead of parsing.
  This is exactly what our parse-at-the-boundary rule forbids.
- Hard-coded ids in source: `CS_USER_GROUP_IDS`, `"U09E98N6F5J"`. These belong in
  configuration.
- Placeholder rows written on webhook receipt (`pending@placeholder.com`,
  `Pending - Deal ${dealId}`). Real records get polluted with fake ones.

## Conventions worth copying

- One package per vendor (`slack-client`, `hubspot-client`, `unthread-client`),
  each exporting narrow verbs rather than a client blob.
- Tools are thin. `slack_create_channel` validates, calls one function, logs.
- Structured logging with a context object on every call.
