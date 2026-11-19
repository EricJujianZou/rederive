#!/usr/bin/env bash
# Summarize a repo's git history so the agent can find its key design decisions.
# Usage: history.sh <repo path> [scope path inside the repo]
# Output is capped so it fits in context on repos with tens of thousands of commits.
set -u  # no -e or pipefail: head closing a pipe early is expected here

repo="${1:-.}"
scope="${2:-}"
here="$(cd "$(dirname "$0")" && pwd)"
cd "$repo"
# Same cleanup as structure.py: relative to the repo, no ./ in front, no / at the end, "." means no scope.
case "$scope" in /*) scope="$(python3 -I -c 'import os, sys; print(os.path.relpath(sys.argv[1]))' "$scope")" ;; esac
scope="${scope#./}"
while [ "${scope%/}" != "$scope" ]; do scope="${scope%/}"; done
[ "$scope" = "." ] && scope=""

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "NOT_A_GIT_REPO: no history to read. Build the map from the code structure below."
  echo
  python3 -I "$here/structure.py" . "$scope"
  rc=$?
  [ -n "$scope" ] && exit $rc
  exit 0
fi

# With a scope, every git command below only looks at that path.
P=()
if [ -n "$scope" ]; then
  export GIT_LITERAL_PATHSPECS=1  # a folder like app/[id] is a path, not a glob
  if [ -z "$(git ls-files -- "$scope" | head -1)" ]; then
    echo "SCOPE_NOT_FOUND: $scope"
    exit 1
  fi
  P=(-- "$scope")
fi

# Paths relative to the scope, so the layout and doc patterns work as they do at the root.
strip() { awk -v p="$scope/" 'p != "/" && index($0, p) == 1 { $0 = substr($0, length(p) + 1) } { print }'; }
unstrip() { awk -v p="$scope/" -v f="$scope" 'p != "/" && $0 != f { $0 = p $0 } { print }'; }

# Lockfiles, build output and vendored code drown out the real changes.
noise='(^|/)(node_modules|vendor|dist|build|\.next|target|third_party)/|(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|go\.sum|\.min\.(js|css)|\.map|\.snap|\.svg|\.png|\.jpg|\.lock)$'

total=$(git rev-list --count HEAD ${P[@]+"${P[@]}"})
first=$(git log --reverse --format='%ad' --date=short ${P[@]+"${P[@]}"} | head -1)
last=$(git log -1 --format='%ad' --date=short ${P[@]+"${P[@]}"})
authors=$(git shortlog -sn HEAD ${P[@]+"${P[@]}"} | wc -l | tr -d ' ')
head_sha=$(git rev-parse --short HEAD)

echo "## Repo"
echo "commits: $total | first: $first | last: $last | authors: $authors | HEAD: $head_sha${scope:+ | scope: $scope}"
[ "$(git rev-parse --is-shallow-repository)" = "true" ] && echo "WARNING: shallow clone, early history is missing. Run: git fetch --unshallow"

# Files touched per commit, ignoring generated files. Counting files needs only the commit
# trees, so it stays fast on a clone made with --filter=blob:none; counting lines would
# download every old version of every file.
sizes=$(git log --no-merges --format='@%h %ad %s' --date=short --name-only ${P[@]+"${P[@]}"} \
  | awk -v noise="${noise//\\/\\\\}" 'BEGIN { tests = "(^|/)(tests?|__tests__|spec)/|(^|/)test_|[._](test|spec)\\.[a-z]+$" }
      /^@/ { if (sha != "") print n "\t" sha; sha = substr($0, 2); n = 0; next }
      NF > 0 && $0 !~ noise && $0 !~ tests { n++ }
      END { if (sha != "") print n "\t" sha }' \
  | sort -rn)

echo
echo "## First 15 commits"
git log --reverse --format='%h %ad %s' --date=short ${P[@]+"${P[@]}"} | head -15

echo
echo "## Commits whose message names a design change (newest 40)"
git log --format='%h %ad %s' --date=short -i -E \
  --grep='introduc|refactor|rewrit|replac|migrat|switch(ed)? (to|from)|redesign|architect|instead of|move (to|from)|extract|split|remove|drop|deprecat|perf|cache|async|concurren|schema|protocol|v[0-9]+\.0' ${P[@]+"${P[@]}"} \
  | head -40

echo
echo "## Largest commits by files touched, ignoring tests and generated files (top 15)"
printf '%s\n' "$sizes" | head -15

echo
echo "## Most changed files (top 20)"
git log --no-merges --format= --name-only ${P[@]+"${P[@]}"} \
  | grep -v -E "$noise" | grep -v '^$' \
  | sort | uniq -c | sort -rn | head -20

echo
echo "## Design docs present"
git ls-files ${P[@]+"${P[@]}"} | strip | grep -i -E '(^|/)(architecture|design|adr|rfc|decisions?|internals|contributing|hacking)[^/]*(\.md|\.txt|\.rst|/)|^readme' | unstrip | head -20

echo
echo "## Top-level layout"
git ls-files ${P[@]+"${P[@]}"} | strip | grep -v -E "$noise" | awk -F/ 'NF > 1 { print $1 "/" } NF == 1 { print $1 }' | sort | uniq -c | sort -rn | head -25

echo
echo "# Code structure"
python3 -I "$here/structure.py" . "$scope"
