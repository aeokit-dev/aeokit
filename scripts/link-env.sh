#!/bin/sh

set -eu

repository_root=$(git rev-parse --show-toplevel)
primary_worktree=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
worktree_environment="$repository_root/.env"

if [ -z "$primary_worktree" ]; then
  echo "Could not determine the primary Git worktree."
  exit 1
fi

environment_file="$primary_worktree/.env"

if [ ! -f "$environment_file" ]; then
  echo "The primary worktree environment file does not exist: $environment_file"
  exit 1
fi

if [ "$repository_root" = "$primary_worktree" ]; then
  chmod 600 "$environment_file"
  echo "The primary worktree already owns $environment_file"
  exit 0
fi

if [ -e "$worktree_environment" ] && [ ! -L "$worktree_environment" ]; then
  echo "Refusing to replace the existing non-symlink file: $worktree_environment"
  exit 1
fi

ln -sfn "$environment_file" "$worktree_environment"
chmod 600 "$environment_file"
echo "Linked $worktree_environment -> $environment_file"
