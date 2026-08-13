# Strict rules — review before starting any work

**Read the doc for the area you are touching before you touch it.** The table
below is the whole index. These are plain paths, not imports: they are not in your
context until you read them, and the rules in them are not optional.

| Working on | Read first |
| --- | --- |
| Anything in `apps/api` — tRPC, auth, logging, sync, deletes, caching | `docs/api.md` |
| `apps/agent` — the eve research agent, tools, tasks, dispatch | `docs/agent.md` |
| `.env`, configuration, which variables exist and why | `docs/environment.md` |
| UI in `apps/app` or `packages/ui` | `docs/design.md` (below) |
| Deal amounts, totals, charts, exchange rates | `docs/currency.md` |
| The record sheet's Agent tab | `docs/agent-panel.md` |
| `/settings/connections`, integrations, the intake endpoint | `docs/connections.md` |
| The tracking script, the collector, form submissions | `docs/tracking.md` |
| Campaigns, drips, templates, segments, sending, unsubscribes | `docs/marketing.md` |
| Running it locally, Google Cloud, DB commands, secrets | `docs/setup.md` |
| Anything that sends a telemetry event, or a new property on one | `docs/telemetry.md` |
| `.github/workflows`, versions, changelog, how a change reaches `release` | `CONTRIBUTING.md` |

Also check `.agents/skills/` for a relevant skill before starting — better-auth,
prisma, nestjs-trpc, eve, shadcn, nuqs and others have one. Tell the user which
rules and skills you read.

## Always true

- **Never add code comments.** Not to new code, not to code you edit.
- **No coauthoring commits.** No `Co-Authored-By` trailer, ever.
- **Intelligence lives in `apps/agent`, never in the API.** No vendor client, no
  enrichment, no scoring, no identity matching in Nest — it writes an `AgentTask`
  row and lets the agent decide. See `docs/api.md`.
- **One `.env`, at the repo root.** `.env.example` is its documentation: add every
  new variable there with a note on what it does, and declare it in
  `apps/api/src/config/env.validation.ts` if the API reads it. Never add a
  per-package `.env`.
- **Anything a self-hoster might not have is optional and must never throw.** A
  missing key removes a capability. `apps/agent/agent/lib/capabilities.ts` is the
  pattern.
- **`/packages/ui` is the single source of truth for UI.** Shared shadcn
  components only; a new variant is implemented there, not overridden at the call
  site.
- **eve's own docs ship in `apps/agent/node_modules/eve/docs`** and match the
  installed version. Read the relevant guide before writing eve code rather than
  working from memory — guessing typechecks, builds, and then behaves differently.

## Report every issue. Use ASD-STE100

Do not bury a known problem inside a paragraph. A problem inside prose is a
problem nobody reads. Report **every** issue, including ones you caused, in a
list at the end of your reply.

Write every message, every report and every issue in **ASD-STE100**
(Simplified Technical English):

- One idea per sentence. Maximum 20 words.
- Active voice. Present tense. No conditionals.
- One word for one meaning. Do not use synonyms for variety.
- Say the effect, not only the cause.
- No hedging: never "may", "might", "possibly", "somewhat".

Use exactly this shape:

```
## Issues

1. BROKEN — Slack is not connected. Agents that post to Slack fail.
   Fix: connect Slack in Settings → Connections.
2. RISK — A run longer than 5 minutes is cancelled. Work is lost.
   Fix: not done. Needs a separate execution lease.
3. NOT DONE — The manual run button shows on event-only agents.
```

Rules for the list:

- One line for the problem. One line for the fix.
- Start each with **BROKEN**, **RISK**, **NOT DONE**, or **UNKNOWN**.
- **BROKEN** is failing now. **RISK** fails later. **NOT DONE** is unbuilt.
  **UNKNOWN** is not investigated.
- If you introduced it, write **I caused this** on the fix line.
- Zero issues? Write `## Issues` then `None.`

**Don't** — bury it in prose:

> The fix works well. One honest limit: abandoning a sweep unblocks the queue but
> doesn't cancel the underlying hung promise, so it leaks until restart.

**Do** — put it in the list:

> 1. RISK — An abandoned sweep leaks its promise. Memory grows until restart.
>    Fix: not done. Needs cancellation in `receive()`. I caused this.

## A server page computes. A client component renders.

A client component must never import a server package. `@crm/auth` and `@crm/db`
are server packages: their barrels reach Prisma, which reaches `pg`, which
reaches `dns`. The bundler follows that chain into the browser and the build
fails with `Module not found: Can't resolve 'dns'`.

The import trace is the whole error. Read it from the bottom: the last line is
the page, the line above is the client component that leaked, and the top is the
Node module that cannot exist in a browser.

**Don't** — a client component reaching for a server package:

```tsx
"use client";
import { describeSlackScopes, SLACK_SCOPE_GROUPS } from "@crm/auth";

export function SlackScopeGroups({ scopes }: { scopes: string[] }) {
  const groups = SLACK_SCOPE_GROUPS.map(...)
}
```

**Do** — the page does the work and hands over plain data:

```tsx
// page.tsx — server
import { describeSlackScopes, SLACK_SCOPE_GROUPS } from "@crm/auth";

const groups = groupScopes(status.scopes);
return <SlackScopeGroups groups={groups} />;
```

```tsx
// slack-scope-groups.tsx — client
"use client";

export type ScopeGroup = { id: string; label: string; scopes: ScopeLine[] };

export function SlackScopeGroups({ groups }: { groups: ScopeGroup[] }) { … }
```

Rules that follow:

- The client component owns its own prop types. It does not re-export a server
  type to get them.
- Anything interactive — an accordion, a dialog, a search field — is a client
  component that receives finished data. It never derives it.
- A `"use client"` file may import from `@crm/ui`, the tRPC client, and React.
  Anything else needs checking.
- The server page is where `await` and secrets live. The client file has neither.

## Constants belong in one file per area, not beside their first use

A number that someone will want to tune goes in a named config module for its
area. It does not go at the top of whichever file happened to need it first.
Somebody changing a timeout must not have to know which file to open.

**Don't** — one constant per file, found only by grep:

```ts
// dispatch.ts
const DRAIN_TIMEOUT_MS = 4 * 60_000;
// crm.ts
const STALE_QUEUE_MS = 5 * 60_000;
// tasks.ts
const LEASE_MS = 10 * 60_000;
```

**Do** — one object, grouped by concern, imported where used:

```ts
// dispatch-config.ts
export const DISPATCH = {
  sweep: { timeoutMs: 4 * MINUTE_MS, staleQueueMs: 5 * MINUTE_MS },
  task: { leaseMs: 10 * MINUTE_MS },
} as const;
```

`apps/agent/agent/lib/dispatch-config.ts` is the pattern. Rules:

- Group by concern, not by file that uses it.
- Derive units from one base (`MINUTE_MS`). Never write `4 * 60_000` twice.
- `as const`, so the values are literal types.
- No magic numbers inline. If it is tunable, it belongs in the config.
- One convention across the codebase. Do not invent a local style for one file.

## Parse at the boundary, never pass `Record<string, unknown>` around

Untyped data — a Prisma `Json` column, a webhook body, an API response — is
parsed into a **domain type at the moment it enters the process**, with Zod, in a
module that owns that shape. Every consumer downstream receives the parsed type
and nothing else. `Record<string, unknown>`, `unknown` casts and one-off
`recordOf()` helpers are how a shape becomes unknowable and a typo becomes a
runtime bug two files away.

**Don't** — reach into raw JSON, re-deriving the shape at each call site:

```ts
function manifestActions(value: unknown) {
  const actions = recordOf(value).actions;
  return Array.isArray(actions) ? actions.map(recordOf) : [];
}

const slack = manifestActions(version.manifest).find(
  (action) => action.type === "slack.message.post",
);
const id = (slack?.destination as Record<string, unknown>)?.id;
```

Nothing here is checked. `destination` may be missing, `id` may be a number, and
the compiler cannot help. Rename a field and every one of these silently returns
`undefined`.

**Do** — one schema, parsed once, at the read:

```ts
export const agentManifestAction = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(AGENT_ACTION_TYPES.SLACK_MESSAGE_POST),
    provider: z.literal("slack"),
    summary: z.string(),
    destination: z.object({
      kind: z.enum(["channel", "user"]),
      resolution: z.literal("chosen"),
      id: z.string().trim().min(1).max(120),
      label: z.string().trim().min(1).max(120),
    }),
  }),
]);

export type AgentManifest = z.infer<typeof agentManifest>;

export function parseAgentManifest(value: unknown): AgentManifest { … }
```

```ts
const manifest = parseAgentManifest(version.manifest);
const slack = manifest.actions.find(
  (action) => action.type === "slack.message.post",
);
const id = slack?.destination.id;
```

`apps/agent/agent/lib/agent-manifest.ts` is the pattern. Rules that follow from
it:

- The schema describes what is **actually stored**, not the loosest thing that
  parses. If a test fixture fails the schema, fix the fixture — a fixture that
  omits required fields is testing data that cannot exist.
- Parse failure is a real error with a real message. Do not swallow it into an
  empty array, because "unreadable manifest" and "no actions" are different
  problems and only one of them is the user's fault.
- Derive types with `z.infer`. Never hand-write an interface beside a schema;
  they drift.

## Design

@docs/design.md

## Median Tasks

Median can use a project-local workspace binding. If this repository has
`.median/config.json`, run `mdn` commands from inside this repository so the
correct Median workspace profile is selected. The local config stores only a
profile name; API keys stay in your user config.

To bind this repository to a workspace:

```
mdn setup --local
```

Before starting work, check your assigned tasks:

```
mdn tasks --agent <your-agent-name>
```

When picking up a task:

```
mdn status <TASK-CODE> in_progress --agent <your-agent-name>
```

When completing a task:

```
mdn status <TASK-CODE> ready --agent <your-agent-name>
```

To create a new task:

```
mdn create --title "Description" --status todo --priority medium --agent <your-agent-name>
```

## Commit Messages & Pull Requests

Always include the Median task ID in commit messages and PR titles so tasks get marked automatically.

```
git commit -m "MDN-42 fix: resolve auth token expiry"
```

For pull requests, include the task ID in the title:

```
MDN-42 fix: resolve auth token expiry
```
