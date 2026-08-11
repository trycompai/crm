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

**The suite runs against `TEST_DATABASE_URL`, never `DATABASE_URL`, and refuses to start without
it.** `bun run db:test` creates the database and migrates it; the name has to end in `_test`.
These tests write and delete real rows, and the hook above runs them on every push — so without
that split, one `git push` reaches whatever database your `.env` happens to name, which for a
self-hoster is production. That is not hypothetical: a run that was interrupted between deleting
the workspace's members and putting them back left the developer locked out of their own
workspace, with the app reporting only "Only an owner or an admin can change this".

**A test may not delete a row it did not create.** Snapshot-and-restore is not a substitute: it
only holds if the process reaches the end, and a crashed run leaves the hole. Where a spec needs
state it cannot own — `ensureWorkspaceMembership` only backfills an owner into an *empty*
workspace — it asserts the precondition and fails, rather than clearing whatever is in the way.

**`test` runs one package at a time (`turbo run test --concurrency=1`), and that is not an
oversight.** `apps/api`, `apps/agent`, `packages/auth` and `packages/telemetry` all have real
integration tests and they all point at the *same* database, so running them at once lets one
package's fixtures land inside another package's assertions. The specs mutate global singletons —
the workspace `organization` row, `AppSetting`'s reporting currency, the exchange-rate table — and
none of that is namespaced per package. Left parallel it failed roughly three runs in four, on a
different test each time, which reads as "flaky tests" and trains everyone to hit re-run. Serial
costs about ten seconds. **Do not raise the concurrency without giving each package its own
database.**

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
        one pull request opens, and stays open and current
          `chore(main): release 0.2.0` ──▶ main
                        │
        ◀── click 2: tag, notes, CHANGELOG.md — and the tagged
            commit lands on `release` on its own, so it is live
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

**Shipping is one pull request.** `chore(main): release 0.2.0`, into `main`, opened and kept up to
date by [release-please](https://github.com/googleapis/release-please) as soon as something
releasable lands. It accumulates every releasable commit, so a stack of merges is one release
rather than five, and the notes are readable *before* you decide to ship them.

Merging it writes `CHANGELOG.md`, bumps the version, tags `v0.2.0`, publishes the GitHub Release
— and then the workflow opens a `release: v0.2.0` pull request from `main` into `release` and
merges it, which is what a deploy and a plain clone both point at. **Nothing else to merge, and no
order to remember**: that pull request opens and closes inside the same run, and you see it only in
the branch's history.

**It has to be a pull request, not a push.** `release` carries a ruleset that requires one, and the
only bypass is the admin role — which `GITHUB_TOKEN` does not have. The step used to call the REST
`merges` API, which writes a merge commit straight to the branch, so the ruleset refused it: every
tag from `v1.6.1` to `v1.8.0` was cut on `main`, published, and never shipped, while production sat
on the last pull request that had reached `release` by hand. The failure was quiet in the worst way
— the release itself looked perfect, and only the Vercel dashboard's commit line said otherwise.

It used to be two pull requests, the release one and a `release: promote main`, with a warning on
the promotion telling you to merge the other one first. Get that order wrong and you shipped
untagged code and left the version behind for the next promotion. There is no reason a human should
hold that rule in their head: the tag and the code have to travel together, so the automation does
it in one step. **`release` is only ever written by that step** — the tag it carries is by
construction an ancestor of what you shipped.

Three consequences worth knowing:

- **A release PR with nothing in it is not a bug.** A run of `chore:` and `test:` commits bumps
  nothing, so no PR appears. That is the type doing its job. It also means those commits **do not
  reach production until the next release carries them** — `release` now moves only when a tag is
  cut. If something has to ship, give it a type that releases: a `fix:` is the floor. Anything that
  genuinely changes nothing for a user is not urgent, and anything urgent is not a `chore:`.
- **The release PR does not run CI.** A PR opened by `GITHUB_TOKEN` cannot trigger workflows — that
  is GitHub's own loop guard, not something to work around. It targets `main`, which has required
  checks, so **an admin merges it past the missing ones** — safe, because it only ever touches
  `CHANGELOG.md`, the root `version` and the manifest, none of which CI can judge.
- **`AUTOMATION_TOKEN` removes that click.** A PAT or GitHub App token in that secret makes the
  automated PRs trigger CI like any other; every workflow already prefers it and falls back to
  `GITHUB_TOKEN`. A branch you push yourself never needed it — your own push triggers CI and the
  auto-opened PR inherits the result.

`main` is expected to be green when it is promoted, and the thing that guarantees that is **branch
protection requiring the `check-types, lint, test` and `conventional commit` checks** — not the
release workflow, which cannot wait on a run in another workflow.

### When it jams

A jam used to be silent — the workflow reported success while doing nothing, and the symptom was
merges landing with no release PR behind them. **The workflow now fails when a merged release PR
carries `autorelease: pending`**, which is the state every jam ends in, so the Actions tab tells you
within a minute of the merge that shipped it. Read the log rather than the status anyway. Three
failures have actually happened here:

- **`There are untagged, merged release PRs outstanding - aborting`.** A release PR was merged but
  never tagged, and release-please refuses to move past it — every later run aborts on the same PR,
  which is how this repo sat from `v1.0.0` in August with no tags at all. Fix it by hand: create the
  tag and GitHub Release at the release PR's merge commit, then swap that PR's
  `autorelease: pending` label for `autorelease: tagged`. The next run picks up where it left off.
  The cause was `separate-pull-requests: false` with one package: the Merge plugin renamed the
  release branch from `release-please--branches--main--components--crm` to
  `release-please--branches--main`, and the tagging step reads the component back out of that branch
  name and compares it against the package name. `undefined` never equalled `crm`, so nothing was
  ever tagged automatically — `v1.0.0` through `v1.3.0` were all cut by hand. **A second package
  will bring the Merge plugin back**, and with it this bug: give the packages components in the tag,
  or check that a merged release PR still gets `autorelease: tagged`.
- **The guard failing on the release it just cut.** Every release run failed — `v1.4.0`, `v1.5.0`
  and `v1.5.1` were all tagged correctly, and the run that tagged each one then reported it as
  stuck. `gh pr list --label` reads the **search index, which is eventually consistent**, and
  release-please swaps `autorelease: pending` for `autorelease: tagged` about a second before the
  guard runs; the index still held the old label. A guard that cries wolf on every release is worse
  than no guard, because the one real jam is indistinguishable from the noise. The search is now
  only a prefilter: each candidate's labels are re-read through `gh api .../issues/N/labels`, which
  is strongly consistent, and only a pull request that is still genuinely `pending` fails the run.
  **Any label check written against `gh pr list --search`/`--label` needs the same treatment.**
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
