#!/usr/bin/env bash
set -euo pipefail

cd "c:/Users/spink/Dropbox/Apps/notzer.org/notzer-org-website"

echo "=== Staging Backend Files ==="
git add -f apps-script-backend/Code.gs apps-script-backend/MasterCode.gs scratch/test_comprehensive_fund_charge.js

git commit -m "fix(backend): prioritize DAF brand fee schedule resolution over generic matches

- Evaluate DAF brand mapping rules in resolveFeeScheduleEntry_ before direct exact match
- Ensure configured 'DAF - Matbia' takes precedence over generic 'Matbia' row when both exist
- Add regression test coverage in Scenario 10 for 'DAF - Matbia' precedence and 'Matbia' fallback"

echo "=== Staging Frontend Files ==="
git add templates/donation-page/template.html campaigns/kfw87/index.html keren-hk-m-twersky.html keren-shlomo-yechiel.html scratch/verify_frontend_integration.js

git commit -m "fix(frontend): surface click logging errors to donors and align PayPal clipboard status flow

- Add visible #modal-paypal-error container inside PayPal overlay step
- Add visible #modal-zelle-error container inside Zelle overlay step
- Add visible #zelle-error-display container inside in-page Zelle panel
- Handle promise rejection across all Zelle and PayPal click paths with donor-facing notes
- Set PayPal status text to start with neutral 'Preparing campaign memo...' and update only after clipboard resolution
- Expand frontend integration verification suite to 103/103 assertions GREEN"

echo "=== Commit Status ==="
git log -n 2 --stat
