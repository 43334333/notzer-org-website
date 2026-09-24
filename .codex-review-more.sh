#!/usr/bin/env bash
set -e
printf '%s\n' '--- ignore provenance ---'
git check-ignore -v apps-script-backend/Code.gs apps-script-backend/.clasp-master/Code.gs scratch/example.txt || true
printf '%s\n' '--- security scanner commit ---'
git show --format=fuller --stat 95815b2 | head -n 100
git show --format= --no-ext-diff 95815b2 | head -n 220
printf '%s\n' '--- subsequent backend-related commits ---'
git log --all --oneline --name-only 3fd8261..HEAD -- | grep -E '(^[0-9a-f]{7,} )|Code\.gs|SetupScript|security|scan' | head -n 120 || true
printf '%s\n' '--- current tracked KSY exact references ---'
grep -nE 'APPS_SCRIPT_URL|getTeams|function logLinkClick|logLinkClick\(' keren-shlomo-yechiel.html | head -n 40
