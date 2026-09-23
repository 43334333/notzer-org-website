#!/bin/bash
set -e

# Commit 1: Frontend donation pages & template
git add \
  templates/donation-page/template.html \
  campaigns/kfw87/index.html \
  keren-hk-m-twersky.html \
  keren-shlomo-yechiel.html \
  donate/index.html \
  donation-success.html

git commit -m "feat(frontend): add daily recurring/installment option, restore right-column CTA layout, and enable Turnstile on main donate page"

# Commit 2: Admin pages & template
git add \
  templates/admin-page/template.html \
  admin/kfw87/index.html \
  admin/keren-hk-m-twersky/index.html \
  admin/ksy/index.html \
  admin/index.html

git commit -m "feat(admin): add daily option to scheduled donation frequency selector"

echo "COMMITS COMPLETED SUCCESSFULLY"
