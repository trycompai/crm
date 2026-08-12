#!/usr/bin/env bash

set -euo pipefail

TYPES='feat|fix|perf|refactor|docs|revert|deps|chore|test|ci|build|style'
MODEL='claude-opus-5'
DIFF_BYTES=40000

check() {
	local title=${1-} subject
	printf '%s' "$title" | grep -Eq "^($TYPES)(\([^)]+\))?!?: .+" || return 1
	subject=${title#*: }
	printf '%s' "$subject" | grep -Eq '^[A-Z][a-z]' && return 1
	case "$subject" in *.) return 1 ;; esac
	return 0
}

bump_of() {
	local title=${1-} head type
	head=${title%%:*}
	case "$head" in *'!') printf '3'; return ;; esac
	type=${head%%(*}
	case "$type" in
	feat) printf '2' ;;
	fix | perf | revert) printf '1' ;;
	*) printf '0' ;;
	esac
}

floor_of() {
	local base=$1 head=$2 subject best=0 bump
	if git log "$base..$head" --no-merges --format=%B | grep -q '^BREAKING[ -]CHANGE'; then
		printf '3'
		return
	fi
	while IFS= read -r subject; do
		bump=$(bump_of "$subject")
		[ "$bump" -gt "$best" ] && best=$bump
	done < <(git log "$base..$head" --no-merges --format=%s)
	printf '%s' "$best"
}

retype() {
	local title=$1 want=$2 head scope rest
	rest=${title#*: }
	head=${title%%:*}
	scope=''
	case "$head" in *'('*')'*) scope=$(printf '%s' "$head" | sed -e 's/^[^(]*(//' -e 's/).*$//') ;; esac

	case "$want" in
	3) head='feat!' ;;
	2) head='feat' ;;
	*) printf '%s' "$title"; return ;;
	esac

	if [ -n "$scope" ]; then
		case "$want" in
		3) printf 'feat(%s)!: %s' "$scope" "$rest" ;;
		*) printf 'feat(%s): %s' "$scope" "$rest" ;;
		esac
	else
		printf '%s: %s' "$head" "$rest"
	fi
}

sufficient() {
	local base=$1 head=$2 title=$3
	[ "$(bump_of "$title")" -ge "$(floor_of "$base" "$head")" ]
}

scope_for() {
	local files=$1 scopes
	scopes=$(printf '%s\n' "$files" | sed -n \
		-e 's#^apps/\([^/]*\)/.*#\1#p' \
		-e 's#^packages/\([^/]*\)/.*#\1#p' \
		-e 's#^docs/.*#docs#p' \
		-e 's#^\.github/.*#ci#p' |
		sort -u)
	if [ "$(printf '%s\n' "$scopes" | grep -c .)" = "1" ]; then
		printf '%s' "$scopes"
	fi
}

type_for() {
	local files=$1
	if ! grep -qvE '(^|/)(docs/|README|CONTRIBUTING|AGENTS|.*\.md$)' <<<"$files"; then
		printf 'docs'
	elif ! grep -qv '^\.github/' <<<"$files"; then
		printf 'ci'
	elif ! grep -qvE '(^|/)(test|tests|__tests__)/|\.spec\.|\.test\.' <<<"$files"; then
		printf 'test'
	elif ! grep -qvE '(^|/)(package\.json|bun\.lock|package-lock\.json)$' <<<"$files"; then
		printf 'chore'
	else
		printf 'feat'
	fi
}

subject_from_branch() {
	local subject
	subject=$(printf '%s' "${1-}" | sed -e 's#^[^/]*/##' -e 's/[-_]/ /g' -e 's/\.$//' -e 's/[[:space:]]*$//')
	printf '%s' "$subject" | grep -Eq '^[A-Z][a-z]' &&
		subject=$(printf '%s' "$subject" | sed -e 's/^\(.\)/\l\1/')
	printf '%s' "$subject"
}

model_title() {
	local base=$1 head=$2 scopes=$3 evidence body response title
	command -v jq >/dev/null 2>&1 || return 1

	evidence=$(
		printf 'Commit subjects:\n%s\n\n' "$(git log "$base..$head" --no-merges --reverse --format='- %s')"
		printf 'Files changed:\n%s\n\n' "$(git diff --stat "$base..$head")"
		printf 'Diff:\n%s\n' "$(git diff "$base..$head" | head -c "$DIFF_BYTES")"
	)

	body=$(jq -n \
		--arg model "$MODEL" \
		--arg system "You write the Conventional Commit title for a pull request that will be squashed onto main, so the title is the commit subject and the line a person reads in the changelog months from now. Write it for that reader: what the change does for them, not which files moved.

Format: type(scope): subject
Types: feat (new capability, minor bump), fix, perf, refactor, docs, revert (patch), chore, test, ci, build, style (no release). Add ! before the colon only for a breaking change.
Scopes, one only, omitted when the change spans several: $scopes.
Subject: lowercase imperative, no trailing full stop, under 60 characters, no ticket numbers and no file paths.

Reply with the title on one line and nothing else." \
		--arg user "$evidence" \
		'{model: $model,
		  max_tokens: 4000,
		  system: $system,
		  output_config: {effort: "low"},
		  messages: [{role: "user", content: $user}]}')

	response=$(curl -fsS --max-time 120 https://api.anthropic.com/v1/messages \
		-H "x-api-key: $ANTHROPIC_API_KEY" \
		-H 'anthropic-version: 2023-06-01' \
		-H 'content-type: application/json' \
		-d "$body") || return 1

	[ "$(printf '%s' "$response" | jq -r '.stop_reason // ""')" = "refusal" ] && return 1

	title=$(printf '%s' "$response" |
		jq -r '[.content[] | select(.type == "text") | .text] | join("")' |
		grep -v '^[[:space:]]*$' | head -1 |
		sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^`//' -e 's/`$//')

	check "$title" || return 1
	printf '%s' "$title"
}

generate() {
	local base=$1 head=$2 branch=${3-} floor
	floor=$(floor_of "$base" "$head")

	retype "$(propose "$base" "$head" "$branch")" "$floor"
	printf '\n'
}

propose() {
	local base=$1 head=$2 branch=${3-} files scope subject conventional title

	files=$(git diff --name-only "$base..$head")
	scope=$(scope_for "$files")

	if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
		local allowed
		allowed=$( (printf '%s\n' "$files" | sed -n -e 's#^apps/\([^/]*\)/.*#\1#p' -e 's#^packages/\([^/]*\)/.*#\1#p'
			printf 'docs\nci\ndeps\n') | sort -u | paste -sd ',' - | sed 's/,/, /g')
		if title=$(model_title "$base" "$head" "$allowed"); then
			printf '%s\n' "$title"
			return 0
		fi
		echo "The model did not return a usable title — falling back to the branch name." >&2
	fi

	conventional=$(
		while IFS= read -r subject; do
			if check "$subject"; then
				printf '%s' "$subject"
				break
			fi
		done < <(git log "$base..$head" --no-merges --reverse --format=%s)
	)
	if [ -n "$conventional" ]; then
		printf '%s\n' "$conventional"
		return 0
	fi

	subject=$(subject_from_branch "$branch")
	[ -n "$subject" ] || subject="update ${files%%$'\n'*}"
	if [ -n "$scope" ]; then
		printf '%s(%s): %s\n' "$(type_for "$files")" "$scope" "$subject"
	else
		printf '%s: %s\n' "$(type_for "$files")" "$subject"
	fi
}

case "${1-}" in
check) check "${2-}" ;;
generate) generate "${2:?base ref}" "${3:?head ref}" "${4-}" ;;
sufficient) sufficient "${2:?base ref}" "${3:?head ref}" "${4-}" ;;
*)
	echo "usage: pr-title.sh check <title> | pr-title.sh generate <base> <head> [branch] | pr-title.sh sufficient <base> <head> <title>" >&2
	exit 2
	;;
esac
