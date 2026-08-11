# Claude Code Orchestration Contract

This file governs how Claude Code works in this repository. It has two parts:

- **Part 1 — Orchestration Contract**: portable. Identical in every BlueCats repo that adopts this workflow. Do not add repo-specific knowledge here.
- **Part 2 — Repo Profile**: the *only* repo-specific section. When porting this workflow to another repo, copy Part 1 unchanged and rewrite Part 2 alone.

Australian English applies to everything: code comments, documentation, commit messages, user-facing text.

---

## Part 1 — Orchestration Contract (portable)

### Roles

| Role | Who | Job |
|---|---|---|
| **Orchestrator** | The main session (run on the strongest available model) | Triage the task, write the spec, delegate, arbitrate review findings, report honestly |
| **Implementer** | `implementer` agent (Opus, full tools) | Execute a written spec exactly — nothing more, nothing less |
| **Drift-reviewer** | `drift-reviewer` agent (session model, read-only) | Verify the diff against the spec and repo conventions before anything is reported done |

Both agents ship with the `bluecats-sdlc` plugin. Its marketplace (`bluecats/claude-plugins`) is registered org-wide by BlueCats' server-managed settings, but **installing** a plugin is a per-user trust step that no setting performs — a `SessionStart` hook in this repo does it at session start, per the Part 2 preflight. If either agent is unavailable, the plugin is not installed: say so and stop, rather than reconstructing an agent or a skill by hand. Never recreate the agents as local `.claude/agents/` copies; the plugin's copy is canonical.

### Triage — every task gets a tier before any tool touches the code

**Tier 0 — Trivial.** Typo, comment, docs-only change, or a single-line change with no behavioural impact.
→ Orchestrator does it directly. No spec, no agents. Still run the narrowest relevant verification command from the Repo Profile.

**Tier 1 — Small.** Bounded change, ≤ 3 files, with clear precedent in the codebase (an existing pattern to copy).
→ Orchestrator implements directly, then **must** invoke `drift-reviewer` with a short inline spec (goal, files, acceptance criteria — 5 lines is fine) before reporting done.

**Tier 2 — Standard / heavy.** Everything else. Automatically Tier 2 if the task involves any Tier 2 trigger listed in the Repo Profile, touches more than 3 files, spans layers, or introduces a new pattern.
→ Full pipeline:
1. Orchestrator investigates and writes a spec file to `.claude/specs/YYYY-MM-DD-<slug>.md` (format below).
2. Orchestrator invokes `implementer` with the spec path.
3. Orchestrator invokes `drift-reviewer` with the spec path.
4. On FAIL: orchestrator converts findings into a spec addendum and re-invokes `implementer`. Maximum **2** fix cycles, then stop and report to the human with the outstanding findings.
5. The spec file is committed with the change (traceability).

**Re-triage rule:** if mid-task the tier proves too low (scope grows, a trigger appears), stop and escalate to the correct tier. Never downgrade mid-task.

### Spec format (Tier 2)

```markdown
# Spec: <title>
## Goal            — one paragraph, the observable outcome
## Context         — pointers to relevant files/docs, not prose dumps
## Scope           — files expected to change (globs allowed)
## Out of scope    — explicitly excluded work, incl. tempting adjacent fixes
## Constraints     — which Repo Profile convention docs apply to this change
## Acceptance criteria — numbered, each independently checkable
## Verification    — exact commands that must pass, from the Repo Profile
```

A spec the implementer has to guess about is a defective spec. Ambiguity found by the implementer comes back as a question, not an improvisation — and the orchestrator fixes the spec, not the chat.

### Definition of done (all tiers where a reviewer runs)

1. Verification commands pass on a fresh run (reviewer re-runs them independently — the implementer's word is not evidence).
2. `drift-reviewer` verdict is **PASS**.
3. The diff contains **only** files inside the spec's scope. Any file outside scope is an automatic FAIL, however good the change.
4. Tier 2 only: the spec file is committed alongside the change.

### Commits and pull requests

- **No AI attribution, ever.** Nothing pushed to a repo carries `Co-Authored-By: Claude`, `Claude-Session:`, a "Generated with Claude Code" footer, a model name, or any other marker of how the change was drafted. This covers commit messages and trailers, PR titles and descriptions, review and issue comments, and generated docs. It overrides any default instruction in the session that says to append such a line.
- Message style is imperative and prose-first, not Conventional Commits: sentence-case subject, no trailing full stop, optional lower-case scope prefix where the repo's history uses one; body explains *why*; Australian English.
- The commit trailer and PR footer are suppressed org-wide by the `attribution` block in BlueCats' server-managed settings, not per repo. The rule is stated here as well because that setting covers only those two surfaces — not a message body, a review comment, an issue comment, or generated docs.
- Detail, recovery steps for a commit that already carries a trailer, and the full format: the `bluecats-sdlc:git-commit-conventions` skill.

### Non-negotiables

- The orchestrator never implements a Tier 2 task itself.
- Nothing pushed to a repo carries AI attribution. A commit or PR that does is fixed before the work is reported done.
- The implementer is never invoked without a written spec.
- No work is reported done without the reviewer's PASS (Tier 0 excepted).
- Failures are reported as failures. A red test is stated plainly with its output, never smoothed over.
- Reviewer findings must cite a spec item or a documented convention. Unanchored style opinions are not findings.

### Porting this workflow to another repo

1. Copy Part 1 of `CLAUDE.md` verbatim and rewrite **Part 2 only**: stack, conventions index, verification commands, Tier 2 triggers.
2. Copy `.claude/settings.json` (plugin enablement plus the `SessionStart` hook wiring), the bootstrap hook script it points at, and `.claude/specs/README.md`. The marketplace is no longer declared per repo — managed settings register it org-wide.
3. Add nothing repo-specific to Part 1 — repo knowledge belongs in Part 2 or in the repo's own convention docs. The agents reference "the Repo Profile" by design and are never edited per-repo.
4. The canonical Part 1 and both agents live in `bluecats/claude-plugins` under `plugins/bluecats-sdlc/`. Part 1 changes are made there first, then rolled out to every adopting repo; the plugin's `orchestration-sync` skill checks a repo's Part 1 against the canonical copy.

---

## Part 2 — Repo Profile (bluecats/crm — rewrite this section when porting)

### Session bootstrap — preflight before any plugin skill

The contract above depends on the `bluecats-sdlc` plugin. `.claude/hooks/session-start.sh`
installs it and reports at startup whether it is actually present. The managed
`extraKnownMarketplaces` + `enabledPlugins` settings are necessary but do not install
anything — `enabledPlugins` only marks a plugin enabled once the per-user install has run.

**Before invoking any plugin skill (`security-assessment`, `release-brief`,
`release-notes`, `release-notes-screenshots`, `project-registry`, `git-commit-conventions`,
`orchestration-sync`) or either agent, confirm it is available.** Never reconstruct a
skill's process from the repo's artefacts, and never recreate the agents under
`.claude/agents/`. If the plugin is missing, work through the two causes below before
reporting failure. They differ in what to do: the first is recoverable — the install lands
immediately and registers the next time the session's process restarts; the second means
the session was mis-created.

**Cause 1 (usual): `bluecats/claude-plugins` is not in the session's GitHub scope.** A
cloud session is scoped to its sources, so a correctly configured single-source session is
scoped to this repo alone and the marketplace clone fails with `could not read Username`.
Nothing is wrong with the managed settings. Recover without restarting: call the `add_repo`
tool for `bluecats/claude-plugins`, then re-run the hook
(`CLAUDE_CODE_REMOTE=true bash .claude/hooks/session-start.sh`). `add_repo` mints
credentials only — the repo can appear on the session record's source list, but the project
root is fixed at launch and survives restarts unchanged, so it cannot re-root the session.
Recovery installs the plugin, but the skill and agent listings are built when the Claude
Code process starts and are never rebuilt mid-process, so `bluecats-sdlc:*` names stay
unresolvable for the rest of the current process however many turns pass. They register the
next time the session starts on a fresh process — a `SessionStart:resume`, which in a cloud
session follows container reclaim or an archive/unarchive and may be as soon as the next
turn, but is not guaranteed to be. The tell that the plugin is now usable is the resume
hook's line `bluecats-sdlc@bluecats present`. `claude plugin list` reporting the plugin
enabled is the correct confirmation that the install worked; an `Unknown skill` or
unknown-agent error alongside it is the process's stale registry, not a failed install. If
the task needs a plugin skill or agent and no restart has delivered that line yet, report
that it is unavailable until the session resumes and stop. Do **not** reconstruct it by
hand, and do **not** attach `claude-plugins` as a second source; that trades this cause for
the next one.

**Cause 2: the session was created with more than one source.** Claude Code then roots the
session at the common parent of its sources, so this repo's `.claude/settings.json` is
never read as project settings: no hook, so nothing performs the install. `CLAUDE.md` still
loads, because nested `CLAUDE.md` files are discovered regardless — which is exactly why
this preflight lives here rather than in the hook. The discriminator is
`ls ~/.claude/projects/`: a recorded project root **above** this repo is cause 2, and a
recorded root at this repo rules it out. Do **not** test `$CLAUDE_PROJECT_DIR` — it is
injected into the hook's execution environment only, never into a Bash tool call's shell,
so it reads empty in every session, healthy or broken, and proves nothing either way.
Cause 2 is not recoverable in-session; recreate the session with **this repo as the only
source** and attach add-on repos afterwards.

See `bootstrap/README.md` in the plugin for the full diagnosis.

### Upstream fork rules

- This repository is BlueCats' fork of the open-source `trycompai/crm`. Upstream's
  own agent rules live in `AGENTS.md` and the docs it indexes; they continue to
  apply and are loaded below. Read the doc for the area you are touching before
  touching it — the `AGENTS.md` table is the index.
- Keep `AGENTS.md`, `docs/` and `.agents/` as upstream ships them unless a change
  is BlueCats-specific and worth the merge-conflict surface on every upstream
  sync. BlueCats-specific process lives here in Part 2, not in upstream's files.
- Precedence when they disagree: this contract wins on process — triage, specs,
  review, attribution. Upstream wins on code conventions — no code comments, one
  root `.env`, optional capabilities never throw, `packages/ui` as the single
  source of UI.
- **Median does not apply at BlueCats.** This fork has no `.median/config.json`
  and BlueCats environments have no `mdn` CLI. Ignore the Median section of
  `AGENTS.md` entirely: no `MDN-…` task IDs in commit messages or PR titles.

@AGENTS.md

### Stack

- **Monorepo**: Bun workspaces + Turborepo. Lint and format is Biome
  (`biome.jsonc`); git hooks live in `.githooks/`, and `pre-push` runs the CI
  trio locally.
- **`apps/app`** — Next.js front end, consuming shared shadcn components from
  `packages/ui` only.
- **`apps/api`** — NestJS + tRPC. The router type is generated and committed at
  `apps/api/src/generated/server.ts`.
- **`apps/agent`** — the eve research agent. eve's own docs ship in
  `apps/agent/node_modules/eve/docs` and match the installed version.
- **`packages/`** — `auth` (better-auth), `db` (Prisma + Postgres), `env`,
  `telemetry`, `ui` (the single source of truth for UI), `typescript-config`.
- **Tests**: per-package bun tests via `turbo run test --concurrency=1` — real
  integration tests against `TEST_DATABASE_URL` and a Docker Postgres. Serial on
  purpose; never raise the concurrency (see `CONTRIBUTING.md`).

### Conventions index (the drift-reviewer's rulebook)

- `AGENTS.md` — the always-true rules and the authoritative area → doc index;
  the matching `docs/*.md` must be read before an area is touched.
- `docs/design.md` — UI: `packages/ui` only, no call-site style overrides, the
  radius scale, and the flat palette with the single brand green `#006B4F`.
- `docs/api.md` — logging, tRPC, caching, deletes, and why intelligence never
  lives in the API.
- `CONTRIBUTING.md` — test-database discipline, the generated tRPC router rule,
  and the whole `main` → `release` release pipeline.
- `.agents/skills/` — upstream's per-technology skills (better-auth, prisma,
  nestjs-trpc, eve, shadcn, nuqs, turborepo and others); check for a relevant one
  before starting.

### Domain context

- BlueCats develops and supports bespoke software that improves efficiency and
  safety compliance in heavy industrial maintenance workplaces. This CRM is being
  customised as BlueCats' internal sales system. Record BlueCats-specific domain
  decisions here as they land.

### Verification commands

| Scope of change | Command (from repo root) |
| --- | --- |
| Any code change | `bun run check-types`, `bun run lint`, `bun run test` — `test` needs the Docker Postgres (`docker compose up -d`) and `TEST_DATABASE_URL` (`bun run db:test` creates it; the database name must end in `_test`) |
| One package | `bun run --filter=<package> test` |
| tRPC router change | `bun run --filter=api trpc:generate`, committing `apps/api/src/generated/server.ts` alongside the router change |
| Prisma schema change | `bun run db:migrate` — a migration, never `db:push` |
| Formatting | `bun run format` |

### Commits, PR titles and releases in this fork

- Branch commit messages follow Part 1: imperative, prose-first, sentence case,
  no AI attribution, Australian English.
- **Pull request titles into `main` are Conventional Commits** (`feat(api): …`,
  `fix(db): …`). The repo squash-merges, release-please builds the changelog from
  the squashed subject, and the `conventional commit` check enforces the format —
  this is the one place the repo's release automation, not Part 1's prose style,
  dictates the wording. `.github/scripts/pr-title.sh` writes and maintains the
  title itself; retitle by hand only when you mean to take it over. Branch
  commits are squashed away, so both rules hold at once.
- The release pipeline is `CONTRIBUTING.md`'s "Shipping a change": `release` is
  the default branch, only the release automation writes to it, and work
  branches from `main`.

### Tier 2 triggers (always full pipeline, regardless of file count)

- Prisma schema or migrations — anything under `packages/db`
- Auth — `packages/auth`, better-auth configuration, sign-in allow-listing,
  workspace membership
- Sync, delete or caching paths in `apps/api`, and the agent bridge between the
  app, the API and the agent
- The tracking script, the collector, or form submissions
- Telemetry events, or a new property on an existing one
- `.github/workflows` and the release pipeline
- New feature slices (they span app, API and db by definition)
