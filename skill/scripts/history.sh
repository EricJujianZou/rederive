#!/usr/bin/env bash
# Summarize a repo's git history so the agent can find its key design decisions.
# Usage: history.sh <repo path>
# Output is capped so it fits in context on repos with tens of thousands of commits.
set -u  # no -e or pipefail: head closing a pipe early is expected here

repo="${1:-.}"
cd "$repo"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "NOT_A_GIT_REPO: no history to read. Build the map from the code alone."
  exit 0
fi

# Lockfiles, build output and vendored code drown out the real changes.
noise='(^|/)(node_modules|vendor|dist|build|\.next|target|third_party)/|(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|go\.sum|\.min\.(js|css)|\.map|\.snap|\.svg|\.png|\.jpg|\.lock)$'

total=$(git rev-list --count HEAD)
first=$(git log --reverse --format='%ad' --date=short | head -1)
last=$(git log -1 --format='%ad' --date=short)
authors=$(git shortlog -sn HEAD | wc -l | tr -d ' ')
head_sha=$(git rev-parse --short HEAD)

echo "## Repo"
echo "commits: $total | first: $first | last: $last | authors: $authors | HEAD: $head_sha"
[ "$(git rev-parse --is-shallow-repository)" = "true" ] && echo "WARNING: shallow clone, early history is missing. Run: git fetch --unshallow"
if [ "$total" -lt 5 ]; then
  echo "WARNING: fewer than 5 commits (likely squashed). Build the map mostly from the code."
fi

echo
echo "## First 15 commits"
git log --reverse --format='%h %ad %s' --date=short | head -15

echo
echo "## Commits whose message names a design change (newest 40)"
git log --format='%h %ad %s' --date=short -i -E \
  --grep='introduc|refactor|rewrit|replac|migrat|switch(ed)? (to|from)|redesign|architect|instead of|move (to|from)|extract|split|remove|drop|deprecat|perf|cache|async|concurren|schema|protocol|v[0-9]+\.0' \
  | head -40

echo
echo "## Largest commits by lines added, ignoring generated files (top 15)"
git log --no-merges --format='@%h %ad %s' --date=short --numstat \
  | NOISE="$noise" awk 'BEGIN { noise = ENVIRON["NOISE"] }
      /^@/ { if (sha != "") print add "\t" sha; sha = substr($0, 2); add = 0; next }
      NF == 3 && $1 ~ /^[0-9]+$/ && $3 !~ noise { add += $1 }
      END { if (sha != "") print add "\t" sha }' \
  | sort -rn | head -15

echo
echo "## Most changed files (top 20)"
git log --no-merges --format= --name-only \
  | grep -v -E "$noise" | grep -v '^$' \
  | sort | uniq -c | sort -rn | head -20

echo
echo "## Design docs present"
git ls-files | grep -i -E '(^|/)(architecture|design|adr|rfc|decisions?|internals|contributing|hacking)[^/]*(\.md|\.txt|\.rst|/)|^readme' | head -20

echo
echo "## Top-level layout"
git ls-files | grep -v -E "$noise" | awk -F/ 'NF > 1 { print $1 "/" } NF == 1 { print $1 }' | sort | uniq -c | sort -rn | head -25
