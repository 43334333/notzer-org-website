const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE_DIR = path.resolve(__dirname, '..');

console.log('====================================================');
console.log('RUNNING COMPREHENSIVE DAILY FREQUENCY & LAYOUT VERIFICATION');
console.log('====================================================\n');

let passCount = 0;
function check(condition, desc) {
    assert(condition, desc);
    passCount++;
    console.log(`✅ PASS: ${desc}`);
}

// 1. Campaign Donation Pages
const campaignFiles = [
    'templates/donation-page/template.html',
    'campaigns/kfw87/index.html',
    'keren-hk-m-twersky.html',
    'keren-shlomo-yechiel.html'
];

campaignFiles.forEach(relPath => {
    const fullPath = path.resolve(BASE_DIR, relPath);
    const content = fs.readFileSync(fullPath, 'utf8');

    // Recurring frequency select has daily
    const recSelectMatch = content.match(/<select[^>]*id="recurring-frequency"[^>]*>([\s\S]*?)<\/select>/);
    check(recSelectMatch && recSelectMatch[1].includes('value="daily"'), `[${relPath}] #recurring-frequency contains value="daily"`);

    // Installment frequency select has daily
    const instSelectMatch = content.match(/<select[^>]*id="installment-frequency"[^>]*>([\s\S]*?)<\/select>/);
    check(instSelectMatch && instSelectMatch[1].includes('value="daily"'), `[${relPath}] #installment-frequency contains value="daily"`);

    // freqLabels in updateInstallmentSummary has daily: 'daily'
    check(content.includes("daily: 'daily'"), `[${relPath}] updateInstallmentSummary freqLabels includes daily: 'daily'`);

    // freqLabels in openSchedulePreview has daily: 'Daily'
    check(content.includes("daily: 'Daily'"), `[${relPath}] openSchedulePreview freqLabels includes daily: 'Daily'`);

    // freqMap in openSchedulePreview has daily: { d: 1, m: 0, y: 0 }
    check(content.includes("daily:{d:1,m:0,y:0}"), `[${relPath}] openSchedulePreview freqMap includes daily:{d:1,m:0,y:0}`);

    // Layout check: #donate-btn and #other-ways-section are inside donation-col and form-columns before form closes
    const formStartIdx = content.indexOf('<form id="donation-form"');
    const formEndIdx = content.indexOf('</form>', formStartIdx);
    check(formStartIdx !== -1 && formEndIdx !== -1, `[${relPath}] <form id="donation-form"> exists and closes`);

    const formContent = content.slice(formStartIdx, formEndIdx);
    const donateBtnIdx = formContent.indexOf('id="donate-btn"');
    const otherWaysIdx = formContent.indexOf('id="other-ways-section"');
    check(donateBtnIdx !== -1, `[${relPath}] id="donate-btn" is inside the form`);
    check(otherWaysIdx !== -1, `[${relPath}] id="other-ways-section" is inside the form`);
    check(donateBtnIdx < otherWaysIdx, `[${relPath}] id="donate-btn" precedes id="other-ways-section"`);

    // Verify closing tags right before </form> close donation-col and donation-columns
    const closingDivsBeforeForm = formContent.slice(otherWaysIdx).match(/<\/div>\s*<\/div>\s*$/);
    check(closingDivsBeforeForm !== null, `[${relPath}] donation-col and donation-columns close AFTER other-ways-section before </form>`);
});

// 2. Main Donate Page (donate/index.html)
const donateContent = fs.readFileSync(path.resolve(BASE_DIR, 'donate/index.html'), 'utf8');

const donateRecMatch = donateContent.match(/<select[^>]*id="recurring-frequency"[^>]*>([\s\S]*?)<\/select>/);
check(donateRecMatch && donateRecMatch[1].includes('value="daily"'), `[donate/index.html] #recurring-frequency contains value="daily"`);

const donateInstMatch = donateContent.match(/<select[^>]*id="installment-frequency"[^>]*>([\s\S]*?)<\/select>/);
check(donateInstMatch && donateInstMatch[1].includes('value="daily"'), `[donate/index.html] #installment-frequency contains value="daily"`);

check(donateContent.includes("daily: 'daily'"), `[donate/index.html] updateInstallmentSummary freqLabels includes daily: 'daily'`);

// Check Turnstile on donate/index.html
check(donateContent.includes('data-sitekey="0x4AAAAAADjo7NvJjpCgWLcN"'), `[donate/index.html] cf-turnstile widget has valid data-sitekey`);
check(donateContent.includes("turnstileSiteKey: '0x4AAAAAADjo7NvJjpCgWLcN'"), `[donate/index.html] DONATE_CONFIG has production turnstileSiteKey`);
check(!donateContent.includes('{{TURNSTILE_SITE_KEY}}'), `[donate/index.html] No unrendered {{TURNSTILE_SITE_KEY}} placeholder`);
check(!donateContent.includes('{{MASTER_APPS_SCRIPT_URL}}'), `[donate/index.html] No unrendered {{MASTER_APPS_SCRIPT_URL}} placeholder`);
check(!donateContent.includes('{{DEFAULT_CARDKNOX_IFIELDS_KEY}}'), `[donate/index.html] No unrendered {{DEFAULT_CARDKNOX_IFIELDS_KEY}} placeholder`);

// 3. Donation Success Page
const successContent = fs.readFileSync(path.resolve(BASE_DIR, 'donation-success.html'), 'utf8');
check(successContent.includes("daily: 'Daily'"), `[donation-success.html] labels map includes daily: 'Daily'`);
check(successContent.includes("daily:{d:1,m:0,y:0}"), `[donation-success.html] freqMap includes daily:{d:1,m:0,y:0}`);

// 4. Admin Pages & Templates
const adminFiles = [
    'templates/admin-page/template.html',
    'admin/kfw87/index.html',
    'admin/keren-hk-m-twersky/index.html',
    'admin/ksy/index.html'
];
adminFiles.forEach(relPath => {
    const content = fs.readFileSync(path.resolve(BASE_DIR, relPath), 'utf8');
    const freqMatch = content.match(/<select[^>]*id="frequency"[^>]*>([\s\S]*?)<\/select>/);
    check(freqMatch && freqMatch[1].includes('value="daily"'), `[${relPath}] #frequency contains value="daily"`);
});

const adminIndexContent = fs.readFileSync(path.resolve(BASE_DIR, 'admin/index.html'), 'utf8');
const adminDonFreqMatch = adminIndexContent.match(/<select[^>]*id="donFrequency"[^>]*>([\s\S]*?)<\/select>/);
check(adminDonFreqMatch && adminDonFreqMatch[1].includes('value="daily"'), `[admin/index.html] #donFrequency contains value="daily"`);

console.log(`\n====================================================`);
console.log(`ALL VERIFICATIONS PASSED: ${passCount}/${passCount} tests GREEN!`);
console.log(`====================================================\n`);
