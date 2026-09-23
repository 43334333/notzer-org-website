#!/usr/bin/env bash
set -e

echo "=== Staging Backend ==="
git add -f apps-script-backend/Code.gs apps-script-backend/MasterCode.gs
git commit -m "fix(backend): fail closed on accounting schema errors before and after gateway processing"

echo "=== Staging Frontend ==="
git add templates/donation-page/template.html campaigns/kfw87/index.html keren-hk-m-twersky.html keren-shlomo-yechiel.html
git commit -m "fix(frontend): reject invalid non-JSON server responses in logLinkClickMaster"

echo "=== Staging Deploy Script ==="
git add -f apps-script-backend/deploy-gas.ps1
git commit -m "feat(deploy): automate live web app deployment update and verification in deploy-gas.ps1"

echo "=== Git Log (Last 4) ==="
git log -n 4 --oneline
