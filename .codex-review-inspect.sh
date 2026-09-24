#!/usr/bin/env bash
set -e
printf '%s\n' '--- relevant tracked files ---'
git ls-files | grep -E '(^|/)(Code\.gs|keren-shlomo-yechiel\.html)$|^(apps-script-backend|scratch)(/|$)' | head -n 100 || true
printf '%s\n' '--- remediation commit stats ---'
git show --stat --oneline --no-renames 3fd8261 | head -n 80
git show --stat --oneline --no-renames b75bed4 | head -n 80
printf '%s\n' '--- remediation diffs selected ---'
git show --format=fuller --no-ext-diff --no-renames 3fd8261 -- '*.gs' '*.html' '.gitignore' | head -n 240
git show --format=fuller --no-ext-diff --no-renames b75bed4 -- '*.gs' '*.html' | head -n 240
