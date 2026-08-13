#!/usr/bin/env bash
set -euo pipefail

python3 - "$@" <<'PY'
import json
import os
import subprocess
import sys
import time
from pathlib import Path


def run(args: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
	result = subprocess.run(
		args,
		check=False,
		stdout=subprocess.PIPE,
		stderr=subprocess.PIPE,
		text=True,
	)
	if check and result.returncode != 0:
		raise subprocess.CalledProcessError(
			result.returncode,
			args,
			output=result.stdout,
			stderr=result.stderr,
		)
	return result


try:
	root = Path(run(["git", "rev-parse", "--show-toplevel"]).stdout.strip())
except subprocess.CalledProcessError as error:
	print(json.dumps({"error": "not_a_git_worktree", "detail": error.stderr.strip()}))
	sys.exit(1)

os.chdir(root)

try:
	subprocess.run(
		["git", "fetch", "--quiet", "origin", "main"],
		cwd=root,
		check=True,
		stdout=subprocess.PIPE,
		stderr=subprocess.PIPE,
		text=True,
	)
except subprocess.CalledProcessError as error:
	print(json.dumps({"error": "git_fetch_failed", "detail": error.stderr.strip()}))
	sys.exit(1)


def git(args: list[str]) -> str:
	return run(["git", *args], check=True).stdout


diff_lines = git(["diff", "--name-status", "origin/main...main"]).splitlines()
modified_files: list[str] = []
new_file_count = 0
deleted_count = 0

for line in diff_lines:
	parts = line.split("\t")
	status = parts[0]
	if status == "M" and len(parts) > 1:
		modified_files.append(parts[1])
	elif status == "A":
		new_file_count += 1
	elif status == "D":
		deleted_count += 1

behind_ahead = git(["rev-list", "--left-right", "--count", "origin/main...main"]).split()
commits_behind_upstream = int(behind_ahead[0])
commits_ahead = int(behind_ahead[1])

merge_bases = git(["merge-base", "--all", "origin/main", "main"]).splitlines()
sync_timestamps = [
	int(git(["show", "-s", "--format=%ct", commit]).strip())
	for commit in merge_bases
]
newest_sync = max(sync_timestamps) if sync_timestamps else int(time.time())
days_since_upstream_sync = max(0, int((time.time() - newest_sync) // 86400))

branch_lines = git([
	"for-each-ref",
	"refs/heads",
	"--format=%(refname:short)|%(committerdate:unix)",
]).splitlines()
branch_timestamps = [
	int(line.rsplit("|", 1)[1])
	for line in branch_lines
	if line and not line.startswith("main|")
]
open_branch_count = len(branch_timestamps)
age_in_days_of_the_oldest_branch = (
	max(0, int((time.time() - min(branch_timestamps)) // 86400))
	if branch_timestamps
	else 0
)

patches_path = root / "docs" / "fork" / "PATCHES.md"
documented_files: set[str] = set()
patches_rows = 0

if patches_path.exists():
	for line in patches_path.read_text().splitlines():
		stripped = line.strip()
		if not stripped.startswith("|") or not stripped.endswith("|"):
			continue
		cells = [cell.strip() for cell in stripped.strip("|").split("|")]
		if len(cells) < 4:
			continue
		first = cells[0].strip("`")
		if first == "file path" or set(first) <= {"-", ":"}:
			continue
		patches_rows += 1
		documented_files.add(first)

undocumented_in_place_edits = [
	path for path in modified_files if path not in documented_files
]

tripwires: list[str] = []
if undocumented_in_place_edits:
	tripwires.append("undocumented_in_place_edits")
if days_since_upstream_sync > 14:
	tripwires.append("upstream_sync_older_than_14_days")
if commits_behind_upstream > 10:
	tripwires.append("more_than_10_commits_behind_upstream")
if open_branch_count > 3:
	tripwires.append("more_than_3_open_branches")

payload = {
	"in_place_edit_count": len(modified_files),
	"new_file_count": new_file_count,
	"deleted_count": deleted_count,
	"commits_behind_upstream": commits_behind_upstream,
	"commits_ahead": commits_ahead,
	"days_since_upstream_sync": days_since_upstream_sync,
	"open_branch_count": open_branch_count,
	"age_in_days_of_the_oldest_branch": age_in_days_of_the_oldest_branch,
	"patches_rows": patches_rows,
	"undocumented_in_place_edits": undocumented_in_place_edits,
	"tripwires": tripwires,
	"reject": bool(tripwires),
}

print(json.dumps(payload, separators=(",", ":"), sort_keys=True))
sys.exit(1 if tripwires else 0)
PY
