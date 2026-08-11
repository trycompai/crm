# Spec: Adopt the BlueCats orchestration contract in the crm fork

## Goal

The crm fork works the way every other BlueCats repo works: `CLAUDE.md` carries the
canonical Part 1 orchestration contract byte-for-byte plus a Repo Profile written for
this codebase, and the `bluecats-sdlc` plugin bootstraps at session start. Upstream's
`AGENTS.md`, `docs/` and `.agents/` remain untouched so future syncs from
`trycompai/crm` stay clean.

## Context

- `bluecats/bluecats-template` `CLAUDE.md` — the canonical Part 1 and the porting
  instructions ("Porting this workflow to another repo").
- `bluecats/bluecats-template` `.claude/settings.json`, `.claude/hooks/session-start.sh`,
  `.claude/specs/README.md` — the artefacts the porting instructions say to copy.
- `AGENTS.md`, `CONTRIBUTING.md`, `docs/setup.md` — the upstream conventions the new
  Repo Profile indexes.

## Scope

- `CLAUDE.md`
- `.claude/settings.json`
- `.claude/hooks/session-start.sh`
- `.claude/specs/README.md`
- `.claude/specs/2026-08-11-adopt-bluecats-orchestration-contract.md`

## Out of scope

- Any edit to `AGENTS.md`, `docs/`, `.agents/` or `.github/` — upstream files stay as
  upstream ships them; overrides live in Part 2 of `CLAUDE.md`.
- Renaming, rebranding or feature changes to the CRM itself.
- Reconciling the fork's branch layout with upstream's `main` → `release` flow.

## Constraints

- Part 1 of `CLAUDE.md` must match the template's Part 1 exactly — the
  `orchestration-sync` skill checks it against the canonical copy.
- `.claude/settings.json` must keep upstream's existing keys (`worktree.bgIsolation`,
  `paper-desktop@paper`) while adding the plugin enablement and hook wiring.
- Biome ignores `.claude/`, so these files are outside the formatter's reach.

## Acceptance criteria

1. `CLAUDE.md` Part 1 is byte-identical to the template's Part 1.
2. Part 2 names this repo's stack, conventions index, domain context, verification
   commands and Tier 2 triggers, and loads upstream's `AGENTS.md` via include.
3. Part 2 states that Median does not apply at BlueCats and that PR titles into
   `main` remain Conventional Commits for release-please.
4. `.claude/hooks/session-start.sh` is byte-identical to the template's copy and
   executable; `.claude/settings.json` wires it for `startup|resume`.
5. No upstream-owned file is modified except `CLAUDE.md` (which previously held only
   an `@AGENTS.md` include, preserved inside Part 2).

## Verification

- `diff` of the extracted Part 1 against the template's Part 1 is empty.
- `diff` of `.claude/hooks/session-start.sh` against the template's copy is empty;
  `bash -n` parses it.
- `bun run lint` passes (no source code touched; confirms nothing else changed).
