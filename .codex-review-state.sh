#!/usr/bin/env bash
set -e
printf '%s\n' '--- status ---'
git status --short --branch | head -n 30
printf '%s\n' '--- recent commits ---'
git log -n 15 --date=short --pretty=format:'%h %ad %s' | head -n 30
printf '\n%s\n' '--- instruction files ---'
find .. -name AGENTS.md -o -name AGENTS.override.md | head -n 30
