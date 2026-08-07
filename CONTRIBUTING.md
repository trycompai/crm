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

**A `pre-push` hook runs them for you**, so a push that would fail CI fails on your machine
instead, where the feedback is in seconds rather than minutes. `bun install` wires it up — the
hooks live in `.githooks/` and `prepare` points `core.hooksPath` at them, so there is nothing to
install and no hook manager in the dependency tree. Turbo caches, so a second push that changed
nothing relevant is nearly free.

It needs the Postgres from `docker compose up -d`, because the API and telemetry tests are real
integration tests. When you need to push past it — a WIP branch, a docker-less machine, a red test
you are deliberately pushing to ask about — `git push --no-verify` skips it, and `CRM_SKIP_HOOKS=1`
skips it for a whole shell.

A few things that trip people up:

- **The tRPC router type is generated, and committed.** If the app can't see a procedure you just
  added, run `bun run --filter=api trpc:generate` and commit `apps/api/src/generated/server.ts`
  alongside the router change. `bun run dev` keeps it in watch mode.
- **Schema changes need a migration**, not `db:push`. `bun run db:migrate` creates one.
- **New environment variables need a home.** Add them to `.env.example` and, if the API reads them,
  to `apps/api/src/config/env.validation.ts`. A variable that only exists in someone's shell is a
  variable that breaks the next person's clone.

## Shipping a change

**Start from `main`, which is not the default branch.** `release` is the default so that a plain
clone runs the last tagged release; the only things that ever merge into it are the two release
pull requests below. Run `git switch main && git pull` before you branch. If you open a pull request
by hand, pass `--base main`; one opened against `release` is retargeted to `main` automatically, so
this costs you a comment rather than a rebase.

Push a branch and the rest is mechanical. There are exactly three things you click, and every one
of them is a pull request — neither `main` nor `release` accepts a direct push.

```
push a branch ──▶ PR opens by itself, titled from the diff
                        │
                  CI runs, and the title follows the diff as you push
                        │
                  ◀── click 1: squash into main
                        │
        two pull requests open, and stay open, together
          `chore(release): 0.2.0` ──▶ main
          `release: promote main` ──▶ release
                        │
        ◀── click 2: the release PR — tag, notes, CHANGELOG.md
                        │
        ◀── click 3: the promotion PR — `release` moves up
```

**Pushing any branch that isn't `main` or `release` opens a pull request into `main`.** You do not
create it, and re-pushing does not create a second one. If you close it on purpose it stays closed.
It opens ready for review rather than as a draft, because there is no longer anything you have to do
to it before it is reviewable — convert it to a draft yourself if you want the checks to leave you
alone while you work.

**The pull request title is the release note.** The repo squashes, so the title becomes the commit
subject on `main`, and that subject is the line somebody reads in the changelog six months from now.
It has to be a [Conventional Commit](https://www.conventionalcommits.org/) — `feat(api): …`,
`fix(db): …`.

**You do not write it.** `.github/scripts/pr-title.sh` reads the diff and writes one when the PR
opens, then rewrites it on every push, so a title written for your first commit does not survive to
describe twenty. It knows which titles are its own — it records the last one it wrote in an HTML
comment at the bottom of the PR body. **Retitle the PR yourself and it stops**: the marker no longer
matches, the automation leaves the title alone from then on, and the `PR title` check is all that is
left, guarding your wording rather than nagging you for it.

The script reaches a model over the `ANTHROPIC_API_KEY` secret, and without it falls back to the
changed paths and the branch name — a valid title, and a duller one. Set the secret if you want the
changelog to read well; nothing breaks if you don't.

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

Nothing is released by merging to `main`, and nothing is pushed to `release` by hand. Both branches
only ever move through a pull request, and shipping is two of them.

Both open as soon as something lands on `main`, and both stay open and up to date until you use
them — so the version you are about to cut is readable *before* you decide to ship it.

**The release pull request — `chore(release): 0.2.0`, into `main`.**
[release-please](https://github.com/googleapis/release-please) accumulates every releasable commit
into this one. Merging it writes `CHANGELOG.md`, bumps the version, tags `v0.2.0` and publishes the
GitHub Release. The notes are reviewable before they are public, and a stack of merges is one
release rather than five.

**The promotion pull request — `release: promote main`, into `release`.** Its body is the list of
commits `release` does not have yet, so it is a standing answer to "what is waiting to ship".
**Merge it with a merge commit, not a squash** — `release` only permits that method, because a
squash would give `release` a commit of its own and the tags on `main` would stop being ancestors
of what you shipped.

**Merge the release one first.** Then the tag sits on a commit the promotion carries over, and
`release` gets the code and its version together. The other order still works — it just ships
untagged code and leaves the bump for the next promotion.

Three consequences worth knowing:

- **A release PR with nothing in it is not a bug.** A run of `chore:` and `test:` commits bumps
  nothing, so no PR appears. That is the type doing its job.
- **Neither automated PR runs CI.** A PR opened by `GITHUB_TOKEN` cannot trigger workflows — that is
  GitHub's own loop guard, not something to work around. The promotion PR does not care, because
  `release` has no required checks and the code was already green on `main`. The release PR targets
  `main`, which does have them, so **an admin merges it past the missing checks** — safe, because it
  only ever touches `CHANGELOG.md`, the root `version` and the manifest, none of which CI can judge.
- **`AUTOMATION_TOKEN` removes that click.** A PAT or GitHub App token in that secret makes the
  automated PRs trigger CI like any other; every workflow already prefers it and falls back to
  `GITHUB_TOKEN`. A branch you push yourself never needed it — your own push triggers CI and the
  auto-opened PR inherits the result.

`main` is expected to be green when it is promoted, and the thing that guarantees that is **branch
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
