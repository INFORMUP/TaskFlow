#!/usr/bin/env bash
# Install TaskFlow workflow skills into the global Claude Code commands
# directory under the `taskflow:` namespace.
#
# After running, the workflow skills are invokable from any repo as:
#   /taskflow:create-task
#   /taskflow:design
#   /taskflow:implement
#   /taskflow:validate
#   /taskflow:address-review
#   /taskflow:transition
#   /taskflow:fast-track
#   /taskflow:walk
#
# Skills are symlinked (not copied) so edits in this repo go live immediately.
# Re-run safely; existing symlinks are refreshed, existing non-symlink files
# are reported and skipped.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$REPO_ROOT/.claude/commands"
DEST_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/commands/taskflow"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "error: $SRC_DIR not found — run this from a TaskFlow checkout" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"

shopt -s nullglob
installed=0
skipped=0
for src in "$SRC_DIR"/*.md; do
  name="$(basename "$src")"
  dest="$DEST_DIR/$name"

  if [[ -L "$dest" ]]; then
    ln -sfn "$src" "$dest"
    echo "refreshed  /taskflow:${name%.md}"
    installed=$((installed + 1))
  elif [[ -e "$dest" ]]; then
    echo "skipped    /taskflow:${name%.md} (not a symlink — remove manually to replace)" >&2
    skipped=$((skipped + 1))
  else
    ln -s "$src" "$dest"
    echo "installed  /taskflow:${name%.md}"
    installed=$((installed + 1))
  fi
done

echo
echo "Done: $installed installed/refreshed, $skipped skipped."
echo "Source: $SRC_DIR"
echo "Target: $DEST_DIR"
