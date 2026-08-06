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

## Design

@docs/design.md
