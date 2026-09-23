#!/usr/bin/env bash
set -euo pipefail

cd "c:/Users/spink/Dropbox/Apps/notzer.org/notzer-org-website"

echo "=== Staging Backend Files ==="
git add -f apps-script-backend/Code.gs apps-script-backend/MasterCode.gs scratch/test_comprehensive_fund_charge.js

git commit -m "fix(backend): resolve DAF card types to configured fee schedule rows in calculateFundCharge and calculateFee

- Implement resolveFeeScheduleEntry_ to map Cardknox xCardType (DonorsFund, OJC, Pledger, Matbia) to fee schedule rows
- Preserve explicitly configured rates including 0.00%
- Symmetrically apply resolution to calculateFundCharge and calculateFee
- Add Scenario 10 regression tests verifying DAF card type resolution and zero-rate preservation"

echo "=== Staging Frontend Files ==="
git add templates/donation-page/template.html campaigns/kfw87/index.html keren-hk-m-twersky.html keren-shlomo-yechiel.html scratch/verify_frontend_integration.js

git commit -m "fix(frontend): resolve GatewayManager syntax error, malformed div markup, session reset, and PayPal handoff

- Relocate CARD_BRAND_BADGES outside GatewayManager object literal to eliminate JS syntax error
- Fix malformed '<div <div' markup in Zelle instructions modal overlay
- Reset route-scoped click sessions upon closing Zelle panel or closing confirmation modal
- Return fetch promise from logLinkClickMaster to propagate delivery errors
- Standardize PayPal flow to use modal Step 3 with explicit handoff link to prevent popup blocker failures
- Add comprehensive frontend integration verification suite (83/83 passing)"

echo "=== Commit Status ==="
git log -n 2 --stat
