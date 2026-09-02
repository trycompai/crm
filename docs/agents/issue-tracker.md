# Issue Tracker

Issues for this repo live in **Linear**, team **CRM**. Pull requests live on
GitHub. Do not open GitHub Issues: the remotes point at GitHub
(`ripgrim/crm`, `trycompai/crm`) but no issue is tracked there.

Reach Linear through its MCP tools, not the CLI:

| Need | Tool |
| --- | --- |
| Find issues | `list_issues` with `team: "CRM"` |
| Read one, with relations | `get_issue` with `includeRelations: true` |
| Create or update | `save_issue` — omit `id` to create, pass it to update |
| Comments | `list_comments`, `save_comment` |

## Projects are one-week semver releases

Everything hangs off the **`CRM` initiative**. Inside it, each minor version is a
project scoped to **one Monday-to-Friday week**, and the weeks run
back-to-back with no gap:

| Project | Status | Start | Target |
| --- | --- | --- | --- |
| `v0.9.0` | In Progress | Mon 2026-08-31 | **Fri 2026-09-04** |
| `v0.10.0` | Planned | Mon 2026-09-07 | Fri 2026-09-11 |

Minor releases accumulate toward the next major. A minor is a week of work, not
a feature set, so scope is what fits the week — an issue that will not fit moves
to the next minor rather than moving the target date.

**Quality projects run in parallel, numbered rather than versioned.**
`Improve CRM Quality 1` covers the same week as `v0.9.0` and holds work that
belongs to no release. The trailing number increments, so expect
`Improve CRM Quality 2` alongside a later minor.

**A theme is a backlog project until a week pulls it in as a milestone.**
`Sales UX` and `Hubspot Mirroring` each exist twice: as an undated backlog
project holding the long-run intent, and as a milestone inside `v0.9.0` for the
slice landing that week. Put an issue on the *version* project and attach the
milestone; do not file it against the backlog project, or it never reaches a
release.

### Never create the next version project

**Do not create a version project.** The next minor exists only once the current
one has actually shipped and the version has rolled over. At most one planned
minor exists ahead of the one in progress, and creating another is not yours to
do.

**And never advance the version to make room.** Closing a release early, or
bumping the number, so that a feature has somewhere to live is the same mistake
wearing a disguise — the version tracks what shipped, never what you want to
start.

So when an issue does not fit the week in progress:

- Leave it with **no project**. The backlog is the correct place for work with no
  release yet, and it costs nothing to sit there.
- Or attach it to a **backlog theme project** — `Sales UX`, `Hubspot Mirroring` —
  when it belongs to that long-run intent.
- Then say the release is full. Do not solve a scope problem by inventing a
  release.

## Creating an issue

`save_issue` requires `team: "CRM"` and a `title`. Also set:

- **`project`** — the semver project it ships in. `v0.9.0` and `v0.10.0` are the
  release projects; `Improve CRM Quality 1` holds quality work with no release.
- **`priority`** — `1` urgent, `2` high, `3` medium, `4` low.
- **`description`** — the diagnosis, not a summary. An issue here carries the
  reproduction, the `file:line` that causes it, what was ruled out, and the
  proposed fix. `CRM-16` is the shape to copy.
- **`blocks` / `blockedBy` / `relatedTo`** where the dependency is real, so the
  order of work is a fact in the tracker rather than a memory.

## Do not prefix commits or PR titles with the issue id

This repo uses plain conventional commits, and the issue id is **not** part of
the subject:

```
feat(agent): let a run post into the channel it opened
```

**The pull request title is written for you.** `.github/scripts/pr-title.sh`
reads the diff and generates it, then validates the shape:
`^(feat|fix|perf|refactor|docs|revert|deps|chore|test|ci|build|style)(scope)?!?: `
with a lowercase subject and no trailing period. A `CRM-1 feat(…): …` title
fails that check, so `pr-title.yml` writes a replacement from the diff and
retitles the pull request over the top of it. The id is thrown away, which is
why it goes nowhere near the subject. See `AGENTS.md` → Commit Messages & Pull
Requests, and `CONTRIBUTING.md`.

**Link the branch instead.** `gitBranchName` on the issue is the branch name
Linear expects; use it and Linear attaches the work without any id in the
message.

## Two things the MCP cannot do

- **Unarchive.** An archived issue can be read with `includeArchived: true` and
  edited, but only the Linear UI can restore it. `CRM-9` and `CRM-14` are
  archived and need restoring by hand.
- **Reach another workspace.** The MCP is bound to whichever Linear account is
  connected. If `list_teams` does not return `CRM`, the wrong account is
  connected — reconnect it rather than assuming the team is missing.
