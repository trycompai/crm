#!/bin/bash
# Canonical bluecats-sdlc session bootstrap — copy verbatim to an adopting repo's
# .claude/hooks/session-start.sh. See bootstrap/README.md for the settings.json wiring
# and the session-configuration precondition. A repo that already uses that filename for
# something else may name it whatever it likes (QMS Cloud uses plugin-bootstrap.sh): the
# script resolves its own path at runtime, so its recovery message always names the file
# it was actually run from.
#
# What installs the plugin: this hook. `enabledPlugins` is not an installer — it marks a
# plugin enabled once installed, and every path that loads a plugin requires a per-user
# install-and-trust step first, because plugins carry executable code. So the managed
# `extraKnownMarketplaces` + `enabledPlugins` declaration is necessary but not sufficient;
# the `claude plugin install` below is what actually puts the agents and skills on disk.
# The hook also reports plainly whether the plugin is present, so a missing plugin
# surfaces at startup rather than as a "skill does not exist" error mid-task.
#
# Two preconditions, and both bite in practice:
#
#   1. The repo must be the session's project root, which means it must be the session's
#      only source. A session created with two sources roots at their common parent, the
#      repo's .claude/settings.json is never read as project settings, and neither the
#      declaration nor this hook takes effect.
#
#   2. `bluecats/claude-plugins` must be in the session's GitHub scope, or the marketplace
#      clone has no credentials and fails with "could not read Username". A cloud session
#      is scoped to its sources, so a correctly configured single-source session is scoped
#      to the adopting repo alone — and therefore cannot reach the marketplace. Attaching
#      claude-plugins as a second source grants the scope but breaks precondition 1, so it
#      is not the fix. Claude must grant the scope from inside the running session with
#      the `add_repo` tool, which mints credentials only — the repo can appear on the
#      session record, but the project root fixed at launch does not move.
#
# Never exits non-zero. A bootstrap failure must degrade to a loud warning in the
# session, never a failed session start.

set -uo pipefail

MARKETPLACE="bluecats"
MARKETPLACE_REPO="bluecats/claude-plugins"
PLUGIN="bluecats-sdlc@bluecats"
MISSING="the implementer and drift-reviewer agents and the release-brief, release-notes, release-notes-screenshots, project-registry, git-commit-conventions, orchestration-sync and security-assessment skills"

# Local workstations manage their own plugins.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Resolve this script's own absolute path. The recovery message below is read by a model in
# a fresh session and must be runnable verbatim, so it has to name the file the hook was
# actually invoked as — not a hard-coded filename that is wrong in any repo which names the
# hook something else. Correct for absolute and relative invocation and for any working
# directory; falls back to the raw invocation path if the directory cannot be resolved.
HOOK_SOURCE="${BASH_SOURCE[0]:-$0}"
HOOK_DIR=$(cd -- "$(dirname -- "$HOOK_SOURCE")" >/dev/null 2>&1 && pwd)
if [ -n "$HOOK_DIR" ]; then
  HOOK_PATH="$HOOK_DIR/$(basename -- "$HOOK_SOURCE")"
else
  HOOK_PATH="$HOOK_SOURCE"
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "bluecats-sdlc bootstrap: the claude CLI is not on PATH, so $MISSING are unavailable this session."
  exit 0
fi

# Refresh the marketplace cache if it is already registered, otherwise register it.
MARKETPLACE_REACHED=yes
claude plugin marketplace update "$MARKETPLACE" >/dev/null 2>&1 \
  || claude plugin marketplace add "$MARKETPLACE_REPO" >/dev/null 2>&1 \
  || MARKETPLACE_REACHED=no

# Idempotent: succeeds quietly when the plugin is already installed.
claude plugin install "$PLUGIN" >/dev/null 2>&1 || true

if claude plugin list 2>/dev/null | grep -q "$PLUGIN"; then
  echo "bluecats-sdlc bootstrap: $PLUGIN present."
elif [ "$MARKETPLACE_REACHED" = no ]; then
  # Overwhelmingly the common failure: the session has no credentials for the marketplace
  # repo. Recoverable from inside the session, so tell Claude how rather than just failing.
  echo "bluecats-sdlc bootstrap: FAILED — could not reach marketplace $MARKETPLACE_REPO, so $PLUGIN is not installed and $MISSING are unavailable."
  echo "bluecats-sdlc bootstrap: this is almost always missing GitHub scope, not a settings fault — the managed marketplace declaration is fine, but a cloud session is scoped to its sources and cannot clone $MARKETPLACE_REPO without credentials."
  echo "bluecats-sdlc bootstrap: to recover, call the add_repo tool for $MARKETPLACE_REPO (this grants scope; the repo may appear on the session record but the project root does not move), then re-run this hook with: CLAUDE_CODE_REMOTE=true bash \"$HOOK_PATH\""
  echo "bluecats-sdlc bootstrap: do not reconstruct the agents or skills by hand, and do not add $MARKETPLACE_REPO as a second source."
else
  echo "bluecats-sdlc bootstrap: FAILED — the marketplace is registered but $PLUGIN did not install, so $MISSING are unavailable this session. Do not reconstruct their processes by hand; report the failure. Check that this repo is the session's only source and that 'claude plugin install $PLUGIN' runs cleanly."
fi

exit 0
