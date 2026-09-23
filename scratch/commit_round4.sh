#!/bin/bash
set -e

echo "=== Structured Atomic Commits Round 4 ==="

# 1. Backend (Kernel / Gating)
echo "Committing Backend changes..."
git add -u apps-script-backend/Code.gs apps-script-backend/MasterCode.gs
git commit -m "fix(backend): fail-closed pre-validation and safe accounting_error reporting for approved charges

- Pre-validate Customers, Pledges, and Transactions schemas fail-closed before card charge
- Re-throw errors in logCustomerMaster and logPledgeMaster
- Capture post-charge accounting errors and return status: 'accounting_error' with refNum
- Maintain 100% byte parity between Code.gs and MasterCode.gs"

# 2. Frontend
echo "Committing Frontend changes..."
git add -u templates/donation-page/template.html campaigns/kfw87/index.html keren-hk-m-twersky.html keren-shlomo-yechiel.html donate/index.html
git commit -m "fix(frontend): lock Donate button on accounting_error to prevent duplicate charges

- Add handler for status === 'accounting_error' and unexpected refNum responses
- Permanently lock Donate button with 'Payment Processed (Contact Support)'
- Display donor advisory against resubmission with reference number"

# 3. Deployment Script
echo "Committing Deployment Script changes..."
git add -u apps-script-backend/deploy-gas.ps1
git commit -m "fix(deploy): enforce strict version increment and production deployment verification

- Query and record prior highest version before version creation
- Require versionNumber > priorVersion and fail closed on any failure
- Strictly verify production deployment binding points to the exact new version"

# 4. Tests
echo "Committing Tests..."
git add -u scratch/test_comprehensive_fund_charge.js scratch/verify_frontend_integration.js
git commit -m "test: add approved-charge failure-path tests and frontend double-charge lockout assertions

- Add Scenarios 1e-1k covering Customer/Pledge schema checks and post-charge failures
- Add assertion suite 9 verifying permanent button lockout across all 5 donation pages
- All 24 backend and 122 frontend assertions GREEN"

echo "=== All Round 4 commits completed successfully ==="
