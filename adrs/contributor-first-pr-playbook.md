# Contributor first PR playbook

I want to propose a tiny playbook for first-time contributors, because the current docs are good but still easy to misread when you are new to this repo. The confusion is not about tooling basics, it is about repo-specific boundaries: where intelligence is allowed to live, which UI layer owns styles, and what kind of PR maintainers can review quickly.

The case that made me notice this: a contributor can follow standard GitHub flow perfectly and still open a PR that gets slowed down by avoidable feedback like scope is too wide, this belongs in the agent not API, or this style belongs in packages/ui not the app. None of that is obvious from generic open source habits, and first-time contributors should not have to discover it only after review.

What I would add is a short first-PR checklist focused on this repository:
- Choose a small, single-purpose change.
- Lead with why in the PR description.
- Keep intelligence in apps/agent, not apps/api.
- Treat packages/ui as the only source of UI components and style variants.
- Use the root environment model only; no per-package env files.
- Run bun run check-types, bun run lint, and bun run test before pushing.
- Use a conventional commit subject that reads well in changelog history.

I would also include a recommended first PR shape: one docs or ADR improvement, or one narrow bug fix with tests, rather than a redesign. This aligns with how this repo is reviewed and keeps merge risk low for a first contribution.

What this could break is very small: if this playbook drifts from other docs, it becomes duplicate policy text. To avoid that, the playbook should point contributors to [CONTRIBUTING](../CONTRIBUTING.md), [Design rules](../docs/design.md), [API rules](../docs/api.md), [Agent rules](../docs/agent.md), and [Environment rules](../docs/environment.md) as source of truth and stay intentionally short.

If this direction sounds right, the follow-up is to either keep this ADR as guidance, or promote it into a short section in CONTRIBUTING after maintainer review.