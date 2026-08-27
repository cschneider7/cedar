#!/usr/bin/env bash
# Bump the release version across every manifest that carries it:
#   package.json / package-lock.json  (via npm)
#   Cargo.toml / Cargo.lock           (the class_management [package] entry)
#
# Usage: scripts/bump-version.sh 0.2.0-beta.2
# Run on a release branch, then commit as "chore(release): v<version>".
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: ${0##*/} <version>   (e.g. ${0##*/} 0.2.0-beta.2)" >&2
  exit 1
fi

version="${1#v}"

if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "error: '$version' is not a valid SemVer version" >&2
  exit 1
fi

cd "$(git rev-parse --show-toplevel)"

# Frontend — npm keeps package.json and package-lock.json in sync.
npm version "$version" --no-git-tag-version --allow-same-version >/dev/null

# Backend — the [package] block is first in Cargo.toml, so the first
# `version = "..."` line is the crate version; deps come later.
perl -pi -e 'if (!$done && s/^version = "[^"]*"/version = "'"$version"'"/) { $done = 1 }' Cargo.toml
perl -0pi -e 's/(name = "class_management"\nversion = ")[^"]*/${1}'"$version"'/' Cargo.lock

echo "Bumped to v$version"
git --no-pager diff --stat
