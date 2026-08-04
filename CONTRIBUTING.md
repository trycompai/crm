# Contributing

We'd like to try something a little different with this repo.

Given that coding agents write most underlying code now, we'd prefer contributions in the form of
_human-written_ text. Run your idea by us the same way you would a coworker — informally, over
Slack. If we're aligned on the change, we're happy to burn our tokens on the implementation.

Please don't have AI expand a one-paragraph idea into a formal proposal. The paragraph was the
useful part.

Submit changes as a PR adding a `.txt` or `.md` file to the [`adrs/`](./adrs/) folder.

If you'd rather just send the code, that's fine too — but lead with why, and keep the diff small
enough that a person can hold it in their head.

PS: Report security vulnerabilities privately — see [`SECURITY.md`](./SECURITY.md), not a public
issue.

---

## Running it

Everything you need is in the [README](./README.md#quick-start). Short version:

```sh
cp .env.example .env      # fill in ALLOWED_SIGN_IN and the two Google values
bun install
docker compose up -d
bun run db:deploy && bun run db:seed
bun run dev
```

## Before you push

```sh
bun run check-types
bun run lint
bun run test
```

All three run on CI, and `bun run format` fixes most of what `lint` complains about.

A few things that trip people up:

- **The tRPC router type is generated, and committed.** If the app can't see a procedure you just
  added, run `bun run --filter=api trpc:generate` and commit `apps/api/src/generated/server.ts`
  alongside the router change. `bun run dev` keeps it in watch mode.
- **Schema changes need a migration**, not `db:push`. `bun run db:migrate` creates one.
- **New environment variables need a home.** Add them to `.env.example` and, if the API reads them,
  to `apps/api/src/config/env.validation.ts`. A variable that only exists in someone's shell is a
  variable that breaks the next person's clone.

## Releases

Releases are cut by [release-please](https://github.com/googleapis/release-please), so **your commit
subject is the release note**. Write it for somebody reading the changelog six months from now, not
for the diff.

Subjects follow [Conventional Commits](https://www.conventionalcommits.org/), which the history
already does — `feat(api):`, `fix(db):`, `refactor(agent):`. The type decides both the version bump
and the heading it appears under:

| Subject | Bump | Appears under |
| --- | --- | --- |
| `feat(app): …` | minor | Features |
| `fix(db): …` | patch | Fixes |
| `perf:`, `refactor:`, `docs:`, `revert:` | patch | their own heading |
| `chore:`, `ci:`, `test:`, `build:`, `style:` | none | nothing — deliberately invisible |

Nothing is released by the merge itself. Merging to `main` opens or updates a single
`chore(release): 0.2.0` pull request that accumulates the changelog and bumps the version; **merging
that PR** is what tags `v0.2.0` and publishes the GitHub Release. So the notes are reviewable before
they are public, and a stack of merges is one release rather than five.

Two consequences worth knowing:

- **A release PR with nothing in it is not a bug.** A run of `chore:` and `test:` commits bumps
  nothing, so no PR appears. That is the type doing its job.
- **The release PR does not run CI.** A PR opened by `GITHUB_TOKEN` cannot trigger workflows — that
  is GitHub's own loop guard, not something to work around. It is safe because the PR only ever
  touches `CHANGELOG.md`, the root `version`, and the release manifest, and because CI runs again on
  `main` after it lands. Setting a `RELEASE_PLEASE_TOKEN` secret (a PAT or a GitHub App token) makes
  the PR run CI like any other; the workflow already prefers it and falls back to `GITHUB_TOKEN`, so
  it is an upgrade rather than a requirement.

`main` is expected to be green when a tag is cut, and the thing that guarantees that is **branch
protection requiring the `check-types, lint, test` check** — not the release workflow, which cannot
wait on a run in another workflow.

## House style

The repo has opinions, and they're written down where the work happens rather than in a style
guide:

- [`AGENTS.md`](./AGENTS.md) — the rules that apply to everything, and where the others live.
- [`docs/design.md`](./docs/design.md) — UI. Short version: `packages/ui` is the only place
  components come from, and you don't override its styles at the call site.
- [`docs/api.md`](./docs/api.md) — logging, tRPC, caching, and why intelligence never lives in the
  API.

Two that are worth stating here because they explain most review comments:

**Comments say why, not what.** The code already says what it does. A comment earns its place by
recording the thing that isn't in the diff — the bug that made this necessary, the obvious approach
that turned out wrong, the constraint that looks arbitrary until you know.

**Nothing about a person is guessed.** This is a CRM: a confidently wrong fact about a real customer
is worse than a blank field, because nobody can tell it's wrong. Code that fills a gap with a
plausible value is a bug here even when it's convenient.

## Reporting a bug

Include what you expected, what happened, and enough to reproduce it. If it involves the agent, the
session transcript is worth more than a description of it — but read it first and redact anything
that belongs to a real customer.
