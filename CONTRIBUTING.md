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

## Shipping a change

Push a branch and the rest is mechanical. There are exactly two things you click.

```
push a branch ──▶ draft PR opens by itself
                        │
                  you title it, mark it ready, CI runs
                        │
                  ◀── click 1: squash into main
                        │
                  release PR opens or updates itself
                        │
                  ◀── click 2: merge it
                        │
        tag + GitHub Release + CHANGELOG.md, and `release` moves up
```

**Pushing any branch that isn't `main` or `release` opens a draft pull request into `main`.** You do
not create it, and re-pushing does not create a second one. If you close it on purpose it stays
closed. The title is guessed from your first commit subject, which is usually wrong — fixing it is
the one thing the automation cannot do for you.

**The pull request title is the release note.** The repo squashes, so the title becomes the commit
subject on `main`, and that subject is the line somebody reads in the changelog six months from now.
Write it for them, not for the diff. It has to be a
[Conventional Commit](https://www.conventionalcommits.org/) — `feat(api): …`, `fix(db): …` — and the
`PR title` check enforces that the moment the PR leaves draft. Drafts are deliberately exempt, so an
auto-opened PR does not sit there red while you are still working.

The type decides both the version bump and the heading it appears under:

| Title | Bump | Appears under |
| --- | --- | --- |
| `feat(app): …` | minor | Features |
| `fix(db): …` | patch | Fixes |
| `perf:`, `refactor:`, `docs:`, `revert:` | patch | their own heading |
| `feat(db)!: …` | major | Features, flagged as breaking |
| `chore:`, `ci:`, `test:`, `build:`, `style:` | none | nothing — deliberately invisible |

The `!` is how you declare a break. A `BREAKING CHANGE:` footer in the body will not work here,
because the squashed commit body is left empty on purpose — the title is the whole record.

## Releases

Nothing is released by merging to `main`. Merging opens or updates a single
`chore(release): 0.2.0` pull request from [release-please](https://github.com/googleapis/release-please)
that accumulates the changelog and bumps the version; **merging that PR** is what tags `v0.2.0`,
publishes the GitHub Release, and writes `CHANGELOG.md`. So the notes are reviewable before they are
public, and a stack of merges is one release rather than five.

Once the tag exists, the `release` branch is fast-forwarded onto it automatically. `release` is
therefore never anything but the last released commit, which is what makes it safe to point a
production deploy at. There is no second pull request to merge — the release PR was the gate.

Three consequences worth knowing:

- **A release PR with nothing in it is not a bug.** A run of `chore:` and `test:` commits bumps
  nothing, so no PR appears. That is the type doing its job.
- **The release PR does not run CI.** A PR opened by `GITHUB_TOKEN` cannot trigger workflows — that
  is GitHub's own loop guard, not something to work around. It is safe because the PR only ever
  touches `CHANGELOG.md`, the root `version`, and the release manifest, and because CI runs again on
  `main` after it lands. The same guard is why an auto-opened draft PR shows no checks until you
  push to it or mark it ready.
- **An `AUTOMATION_TOKEN` secret removes that caveat.** A PAT or GitHub App token makes both the
  release PR and the auto-opened PR trigger CI like any other. Every workflow already prefers it and
  falls back to `GITHUB_TOKEN`, so it is an upgrade rather than a requirement.

`main` is expected to be green when a tag is cut, and the thing that guarantees that is **branch
protection requiring the `check-types, lint, test` and `conventional commit` checks** — not the
release workflow, which cannot wait on a run in another workflow.

### When it jams

The Release workflow reports success even when it has done nothing, so the symptom of a jam is
silence: merges land, no release PR appears. Read the log rather than the status. Two failures have
actually happened here:

- **`There are untagged, merged release PRs outstanding - aborting`.** A release PR was merged but
  never tagged, and release-please refuses to move past it — every later run aborts on the same PR,
  which is how this repo sat from `v1.0.0` in August with no tags at all. Fix it by hand: create the
  tag and GitHub Release at the release PR's merge commit, then swap that PR's
  `autorelease: pending` label for `autorelease: tagged`. The next run picks up where it left off.
  The usual cause is a release PR whose title does not match `pull-request-title-pattern`, because
  the version is parsed back out of that title — so do not edit the pattern with a release PR open.
- **`commit could not be parsed`, in bulk.** Non-conventional subjects reached `main`. They are not
  errors, they are silently missing changelog lines. The squash-only merge policy and the
  `conventional commit` check exist to stop this; if you see it again, one of the two has been
  turned off.

`workflow_dispatch` is enabled on the workflow, so you can re-run it against `main` from the Actions
tab once you have fixed the cause, instead of pushing an empty commit.

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
