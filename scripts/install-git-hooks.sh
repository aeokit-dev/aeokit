#!/bin/sh

set -eu

repository_root=$(git rev-parse --show-toplevel)
configured_hooks_path=$(git config --local --get core.hooksPath || true)
source_hook="$repository_root/.githooks/post-checkout"

if [ -n "$configured_hooks_path" ]; then
  echo "Refusing to install alongside the existing Git hooks path: $configured_hooks_path" >&2
  exit 1
fi

installed_hook=$(git rev-parse --git-path hooks/post-checkout)

if [ -e "$installed_hook" ] || [ -L "$installed_hook" ]; then
  if cmp -s "$source_hook" "$installed_hook"; then
    chmod 755 "$installed_hook"
    echo "Git post-checkout hook is already installed: $installed_hook"
    exit 0
  fi

  if grep -q '^# aeokit-managed-env-link-hook$' "$installed_hook"; then
    cp "$source_hook" "$installed_hook"
    chmod 755 "$installed_hook"
    echo "Updated Git post-checkout hook: $installed_hook"
    exit 0
  fi

  echo "Refusing to replace the existing Git hook: $installed_hook" >&2
  exit 1
fi

cp "$source_hook" "$installed_hook"
chmod 755 "$installed_hook"
echo "Installed Git post-checkout hook: $installed_hook"
