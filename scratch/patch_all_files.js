const fs = require('fs');
const path = require('path');

const BASE_DIR = path.resolve(__dirname, '..');

function patchFile(relPath, fn) {
    const fullPath = path.resolve(BASE_DIR, relPath);
    const original = fs.readFileSync(fullPath, 'utf8');
    const modified = fn(original);
    if (original === modified) {
        console.warn(`[WARN] No changes made to ${relPath}`);
    } else {
        fs.writeFileSync(fullPath, modified, 'utf8');
        console.log(`[OK] Successfully patched ${relPath}`);
    }
}

// =========================================================================
// 1. templates/donation-page/template.html & campaigns/kfw87/index.html
// =========================================================================
['templates/donation-page/template.html', 'campaigns/kfw87/index.html'].forEach(relPath => {
    patchFile(relPath, content => {
        // A. Add daily to #recurring-frequency
        content = content.replace(
            /(<select class="recurring-select" id="recurring-frequency"[^>]*>[\s\S]*?<option value="">Select frequency\.\.\.<\/option>)/,
            '$1\n                                            <option value="daily">Daily</option>'
        );

        // B. Add daily to #installment-frequency
        content = content.replace(
            /(<select class="recurring-select" id="installment-frequency"[^>]*>)/,
            '$1\n                                            <option value="daily">Daily</option>'
        );

        // C. Update freqLabels in updateInstallmentSummary
        content = content.replace(
            /var freqLabels = \{ weekly: 'weekly', biweekly: 'bi-weekly', monthly: 'monthly', quarterly: 'quarterly', annually: 'annual' \};/,
            "var freqLabels = { daily: 'daily', weekly: 'weekly', biweekly: 'bi-weekly', monthly: 'monthly', quarterly: 'quarterly', annually: 'annual' };"
        );

        // D. Update freqLabels & freqMap in openSchedulePreview
        content = content.replace(
            /var freqLabels = \{ weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annual' \};/,
            "var freqLabels = { daily: 'Daily', weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annual' };"
        );
        content = content.replace(
            /var freqMap = \{ weekly:\{d:7,m:0,y:0\}, biweekly:\{d:14,m:0,y:0\}, monthly:\{d:0,m:1,y:0\}, quarterly:\{d:0,m:3,y:0\}, annually:\{d:0,m:0,y:1\} \};/,
            "var freqMap = { daily:{d:1,m:0,y:0}, weekly:{d:7,m:0,y:0}, biweekly:{d:14,m:0,y:0}, monthly:{d:0,m:1,y:0}, quarterly:{d:0,m:3,y:0}, annually:{d:0,m:0,y:1} };"
        );

        // E. Re-nest right column CTA & Other Ways
        // Remove closing </div>\n </div>\n\n <!-- Full-width bottom section -->
        const targetOldDivs = `                            \n                        </div>\n                    </div>\n\n                    <!-- Full-width bottom section -->`;
        if (content.includes(targetOldDivs)) {
            content = content.replace(targetOldDivs, '');
            // Now close the two divs before </form>
            content = content.replace(
                /(\s*<\/div>\s*<\/div>\s*<\/div>\s*)<\/form>/,
                '$1                        </div>\n                    </div>\n                </form>'
            );
        } else {
            console.error(`Could not find targetOldDivs in ${relPath}`);
        }

        return content;
    });
});

// =========================================================================
// 2. keren-hk-m-twersky.html
// =========================================================================
patchFile('keren-hk-m-twersky.html', content => {
    // A. Add daily to #recurring-frequency
    content = content.replace(
        /(<select class="recurring-select" id="recurring-frequency"[^>]*>)/,
        '$1\n                                            <option value="daily">Daily</option>'
    );

    // B. Add daily to #installment-frequency
    content = content.replace(
        /(<select class="recurring-select" id="installment-frequency"[^>]*>)/,
        '$1\n                                            <option value="daily">Daily</option>'
    );

    // C. Update freqLabels in updateInstallmentSummary
    content = content.replace(
        /var freqLabels = \{ weekly: 'weekly', biweekly: 'bi-weekly', monthly: 'monthly', quarterly: 'quarterly', annually: 'annual' \};/,
        "var freqLabels = { daily: 'daily', weekly: 'weekly', biweekly: 'bi-weekly', monthly: 'monthly', quarterly: 'quarterly', annually: 'annual' };"
    );

    // D. Update freqLabels & freqMap in openSchedulePreview
    content = content.replace(
        /var freqLabels = \{ weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annual' \};/,
        "var freqLabels = { daily: 'Daily', weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annual' };"
    );
    content = content.replace(
        /var freqMap = \{ weekly:\{d:7,m:0,y:0\}, biweekly:\{d:14,m:0,y:0\}, monthly:\{d:0,m:1,y:0\}, quarterly:\{d:0,m:3,y:0\}, annually:\{d:0,m:0,y:1\} \};/,
        "var freqMap = { daily:{d:1,m:0,y:0}, weekly:{d:7,m:0,y:0}, biweekly:{d:14,m:0,y:0}, monthly:{d:0,m:1,y:0}, quarterly:{d:0,m:3,y:0}, annually:{d:0,m:0,y:1} };"
    );

    // E. Re-nest right column CTA & Other Ways
    const targetOldDivs = `                            \n                        </div>\n                    </div>\n\n                    <!-- Full-width bottom section -->`;
    if (content.includes(targetOldDivs)) {
        content = content.replace(targetOldDivs, '');
        content = content.replace(
            /(\s*<\/div>\s*<\/div>\s*<\/div>\s*)<\/form>/,
            '$1                        </div>\n                    </div>\n                </form>'
        );
    } else {
        console.error(`Could not find targetOldDivs in keren-hk-m-twersky.html`);
    }

    return content;
});

// =========================================================================
// 3. keren-shlomo-yechiel.html
// =========================================================================
patchFile('keren-shlomo-yechiel.html', content => {
    // A. Add daily to #recurring-frequency
    content = content.replace(
        /(<select class="recurring-select" id="recurring-frequency"[^>]*>)/,
        '$1\n                                            <option value="daily">Daily</option>'
    );

    // B. Add daily to #installment-frequency
    content = content.replace(
        /(<select class="recurring-select" id="installment-frequency"[^>]*>)/,
        '$1\n                                            <option value="daily">Daily</option>'
    );

    // C. Update freqLabels in updateInstallmentSummary
    content = content.replace(
        /var freqLabels = \{ weekly: 'weekly', biweekly: 'bi-weekly', monthly: 'monthly', quarterly: 'quarterly', annually: 'annual' \};/,
        "var freqLabels = { daily: 'daily', weekly: 'weekly', biweekly: 'bi-weekly', monthly: 'monthly', quarterly: 'quarterly', annually: 'annual' };"
    );

    // D. Update freqLabels & freqMap in openSchedulePreview
    content = content.replace(
        /var freqLabels = \{ weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annual' \};/,
        "var freqLabels = { daily: 'Daily', weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annual' };"
    );
    content = content.replace(
        /var freqMap = \{ weekly:\{d:7,m:0,y:0\}, biweekly:\{d:14,m:0,y:0\}, monthly:\{d:0,m:1,y:0\}, quarterly:\{d:0,m:3,y:0\}, annually:\{d:0,m:0,y:1\} \};/,
        "var freqMap = { daily:{d:1,m:0,y:0}, weekly:{d:7,m:0,y:0}, biweekly:{d:14,m:0,y:0}, monthly:{d:0,m:1,y:0}, quarterly:{d:0,m:3,y:0}, annually:{d:0,m:0,y:1} };"
    );

    // E. Re-nest right column CTA & Other Ways
    // Note: in KSY there was also a comment:
    // <!-- ════════════════════════════════════════\n Other Ways to Give (Zelle, PayPal & DAF)\n ════════════════════════════════════════ -->\n \n </div>\n </div>\n\n <!-- Full-width bottom section -->
    const targetOldDivsKSY = `                            <!-- ════════════════════════════════════════\n                                 Other Ways to Give (Zelle, PayPal & DAF)\n                                 ════════════════════════════════════════ -->\n                            \n                        </div>\n                    </div>\n\n                    <!-- Full-width bottom section -->`;
    if (content.includes(targetOldDivsKSY)) {
        content = content.replace(targetOldDivsKSY, '');
        content = content.replace(
            /(\s*<\/div>\s*<\/div>\s*<\/div>\s*)<\/form>/,
            '$1                        </div>\n                    </div>\n                </form>'
        );
    } else {
        console.error(`Could not find targetOldDivsKSY in keren-shlomo-yechiel.html`);
    }

    return content;
});

// =========================================================================
// 4. donate/index.html
// =========================================================================
patchFile('donate/index.html', content => {
    // A. Add daily to #recurring-frequency
    content = content.replace(
        /(<select class="recurring-select" id="recurring-frequency"[^>]*>[\s\S]*?<option value="">Select frequency\.\.\.<\/option>)/,
        '$1\n                                                <option value="daily">Daily</option>'
    );

    // B. Add daily to #installment-frequency
    content = content.replace(
        /(<select class="recurring-select" id="installment-frequency"[^>]*>)/,
        '$1\n                                                <option value="daily">Daily</option>'
    );

    // C. Update freqLabels in updateInstallmentSummary
    content = content.replace(
        /var freqLabels = \{ weekly: 'weekly', biweekly: 'bi-weekly', monthly: 'monthly', quarterly: 'quarterly', annually: 'annual' \};/,
        "var freqLabels = { daily: 'daily', weekly: 'weekly', biweekly: 'bi-weekly', monthly: 'monthly', quarterly: 'quarterly', annually: 'annual' };"
    );

    // D. Fix Turnstile widget data-sitekey
    content = content.replace(
        /<div class="cf-turnstile" id="turnstile-container" data-sitekey="\{\{TURNSTILE_SITE_KEY\}\}" data-callback="onTurnstileSuccess" data-theme="dark"><\/div>/,
        '<div class="cf-turnstile" id="turnstile-container" data-sitekey="0x4AAAAAADjo7NvJjpCgWLcN" data-callback="onTurnstileSuccess" data-theme="dark"></div>'
    );

    // E. Populate DONATE_CONFIG production values
    const oldConfig = `    const DONATE_CONFIG = {
        masterScriptUrl: '{{MASTER_APPS_SCRIPT_URL}}',
        defaultPrimaryGateway: '{{DEFAULT_PRIMARY_GATEWAY}}',
        defaultCardknoxIfieldsKey: '{{DEFAULT_CARDKNOX_IFIELDS_KEY}}',
        defaultUsaepayPublicKey: '{{DEFAULT_USAEPAY_PUBLIC_KEY}}',
        turnstileSiteKey: '{{TURNSTILE_SITE_KEY}}',
        orgName: 'Notzer Chesed',
        orgEin: '11-3049033',
    };`;

    const newConfig = `    const DONATE_CONFIG = {
        masterScriptUrl: 'https://script.google.com/macros/s/AKfycbzngv-LEqoOercDK5MfRtB8BpEFhH3sdnq16lyxzq2LN_8W0lUQpa-oUZB4CfGYE28y3g/exec',
        defaultPrimaryGateway: 'cardknox',
        defaultCardknoxIfieldsKey: 'ifields_gizbernotzerchesed1088151670bf4b6c925',
        defaultUsaepayPublicKey: '',
        turnstileSiteKey: '0x4AAAAAADjo7NvJjpCgWLcN',
        orgName: 'Notzer Chesed',
        orgEin: '11-3049033',
    };`;

    if (content.includes(oldConfig)) {
        content = content.replace(oldConfig, newConfig);
    } else {
        console.error('Could not find oldConfig in donate/index.html');
    }

    return content;
});

// =========================================================================
// 5. donation-success.html
// =========================================================================
patchFile('donation-success.html', content => {
    // A. Update labels
    content = content.replace(
        /var labels = \{ weekly: 'Weekly', biweekly: 'Every 2 Weeks', monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annually' \};/,
        "var labels = { daily: 'Daily', weekly: 'Weekly', biweekly: 'Every 2 Weeks', monthly: 'Monthly', quarterly: 'Quarterly', annually: 'Annually' };"
    );

    // B. Update freqMap
    content = content.replace(
        /var freqMap = \{ weekly:\{d:7,m:0,y:0\}, biweekly:\{d:14,m:0,y:0\}, monthly:\{d:0,m:1,y:0\}, quarterly:\{d:0,m:3,y:0\}, annually:\{d:0,m:0,y:1\} \};/,
        "var freqMap = { daily:{d:1,m:0,y:0}, weekly:{d:7,m:0,y:0}, biweekly:{d:14,m:0,y:0}, monthly:{d:0,m:1,y:0}, quarterly:{d:0,m:3,y:0}, annually:{d:0,m:0,y:1} };"
    );

    return content;
});

// =========================================================================
// 6. Admin templates & pages
// =========================================================================
[
    'templates/admin-page/template.html',
    'admin/kfw87/index.html',
    'admin/keren-hk-m-twersky/index.html',
    'admin/ksy/index.html'
].forEach(relPath => {
    patchFile(relPath, content => {
        return content.replace(
            /(<select id="frequency" name="frequency"[^>]*>[\s\S]*?<option value="" disabled selected>Select frequency…<\/option>)/,
            '$1\n                                    <option value="daily">Daily</option>'
        );
    });
});

patchFile('admin/index.html', content => {
    return content.replace(
        /(<select id="donFrequency">[\s\S]*?<option value="" disabled selected>Select frequency…<\/option>)/,
        '$1<option value="daily">Daily</option>'
    );
});

console.log('--- ALL PATCHES PROCESSED ---');
