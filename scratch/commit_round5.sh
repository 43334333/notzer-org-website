#!/bin/bash
set -e

echo "=== Structured Atomic Commits Round 5 ==="

# 1. Backend (Kernel / Gating)
echo "Committing Backend changes..."
git add -u apps-script-backend/Code.gs apps-script-backend/MasterCode.gs
git commit -m "fix(backend): fail-closed Fee_Config pre-validation and safe fee calculation error handling

- Pre-validate Fee_Config sheet and fee schedule fail-closed before card charge
- Prevent loadFeeSchedule_ from silently caching credit-card-only fallback on read error
- Wrap post-charge calculateFee in try-catch pushing to accountingErrors
- Maintain 100% byte parity between Code.gs and MasterCode.gs"

# 2. Tests
echo "Committing Tests..."
git add -u scratch/test_comprehensive_fund_charge.js
git commit -m "test: add regression tests for fail-closed Fee_Config validation and fee read failure

- Add Scenario 1l testing ensureFeeConfigSheet_ header and row validation
- Add Scenario 1m testing pre-charge fail-closed abort on Fee_Config read failure
- Add Scenario 1n testing calculateFee/calculateFundCharge throwing without cache poisoning
- Add Scenario 1o testing post-charge fee failure returning accounting_error preventing \$0 fee"

echo "=== All Round 5 commits completed successfully ==="
