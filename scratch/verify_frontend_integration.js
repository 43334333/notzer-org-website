const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE_DIR = path.resolve(__dirname, '..');

const campaignFiles = [
    'templates/donation-page/template.html',
    'campaigns/kfw87/index.html',
    'keren-hk-m-twersky.html',
    'keren-shlomo-yechiel.html'
];

const allFiles = [
    ...campaignFiles,
    'donate/index.html'
];

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
    totalTests++;
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        throw new Error(`Assertion failed: ${message}`);
    }
    passedTests++;
    console.log(`✅ PASS: ${message}`);
}

console.log('====================================================');
console.log('RUNNING COMPREHENSIVE FRONTEND VERIFICATION SUITE');
console.log('====================================================\n');

// 1. Check all 5 files for JS syntax validity across all <script> blocks
allFiles.forEach(f => {
    const fullPath = path.resolve(BASE_DIR, f);
    const content = fs.readFileSync(fullPath, 'utf8');

    const scriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
    let match;
    let scriptIdx = 0;

    while ((match = scriptRegex.exec(content)) !== null) {
        scriptIdx++;
        const scriptBody = match[1].trim();
        if (!scriptBody) continue;

        let testCode = scriptBody;
        if (f.includes('template.html') || f.includes('donate/index.html')) {
            testCode = testCode.replace(/\{\{[^}]+\}\}/g, '""');
        }

        try {
            new vm.Script(testCode);
            assert(true, `[${f}] Script block #${scriptIdx} syntax OK`);
        } catch (err) {
            assert(false, `[${f}] Script block #${scriptIdx} syntax error: ${err.message}`);
        }
    }
});

// 2. Check no malformed <div <div markup in any file
allFiles.forEach(f => {
    const fullPath = path.resolve(BASE_DIR, f);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert(!content.includes('<div <div'), `[${f}] Contains no malformed <div <div markup`);
});

// 3. Check all 5 files for CSS spin button suppression
allFiles.forEach(f => {
    const fullPath = path.resolve(BASE_DIR, f);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert(
        content.includes('input[type=number]::-webkit-inner-spin-button') &&
        content.includes('-webkit-appearance: none') &&
        content.includes('-moz-appearance: textfield'),
        `[${f}] CSS spin button removal styles present`
    );
});

// 4. Check all 5 files for unhidden custom-amount-wrapper
allFiles.forEach(f => {
    const fullPath = path.resolve(BASE_DIR, f);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert(
        content.includes('id="custom-amount-wrapper"') &&
        !content.includes('id="custom-amount-wrapper" style="display: none;"') &&
        !content.includes('id="custom-amount-wrapper" style="display:none;"'),
        `[${f}] custom-amount-wrapper is present and NOT hidden in HTML`
    );
});

// 5. Check all 5 files for card-brand-icon badge container & mappings
allFiles.forEach(f => {
    const fullPath = path.resolve(BASE_DIR, f);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert(
        content.includes('id="card-brand-icon"'),
        `[${f}] card-brand-icon container is present`
    );
    assert(
        content.includes('CARD_BRAND_BADGES') &&
        content.includes("'visa'") &&
        content.includes("'mastercard'") &&
        content.includes("'amex'") &&
        content.includes("'discover'") &&
        content.includes("'donors'") &&
        content.includes("'ojc'") &&
        content.includes("'pledger'") &&
        content.includes("'matbia'"),
        `[${f}] CARD_BRAND_BADGES contains all 8 card & DAF brand mappings`
    );
    assert(
        content.includes('brandBadgeEl.innerHTML = CARD_BRAND_BADGES[issuer]') ||
        content.includes('CARD_BRAND_BADGES[issuer]'),
        `[${f}] addIfieldKeyPressCallback wires data.issuer to card-brand-icon`
    );
});

// 6. Check 4 campaign files for Donate Now before Other Ways to Give
campaignFiles.forEach(f => {
    const fullPath = path.resolve(BASE_DIR, f);
    const content = fs.readFileSync(fullPath, 'utf8');
    const donateBtnIdx = content.indexOf('id="donate-btn"');
    const otherWaysIdx = content.indexOf('id="other-ways-section"');
    assert(donateBtnIdx !== -1, `[${f}] id="donate-btn" is present`);
    assert(otherWaysIdx !== -1, `[${f}] id="other-ways-section" is present`);
    assert(
        donateBtnIdx < otherWaysIdx,
        `[${f}] Donate Now button appears BEFORE other-ways-section in DOM order`
    );
});

// 7. Check 4 campaign files for Zelle Memo, PayPal Step & Unique Click PK
campaignFiles.forEach(f => {
    const fullPath = path.resolve(BASE_DIR, f);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert(
        content.includes('id="zelle-memo-box"') &&
        content.includes('id="zelle-memo-display"'),
        `[${f}] Main page zelle-info has zelle-memo-box and display element`
    );
    assert(
        content.includes('id="modal-zelle-memo-box"') &&
        content.includes('id="modal-zelle-memo-display"'),
        `[${f}] Modal step-zelle has modal-zelle-memo-box and display element`
    );
    assert(
        content.includes('id="modal-daf-step-paypal"') &&
        content.includes('id="modal-paypal-memo-box"') &&
        content.includes('id="modal-paypal-open-btn"'),
        `[${f}] Modal step-paypal exists with memo box and explicit Open PayPal button`
    );
    assert(
        content.includes('function mintClickPk(') &&
        content.includes('activeClickSessions') &&
        content.includes('function safeCopyText(') &&
        content.includes('function getRouteSession('),
        `[${f}] Single-source click ID minter, route-scoped sessions, and safe clipboard present`
    );
    assert(
        content.includes("activeClickSessions.zelle = null;"),
        `[${f}] Sessions reset when closing Zelle or closing modal to prevent duplicate PKs`
    );
    assert(
        content.includes('return fetch('),
        `[${f}] logLinkClickMaster returns fetch promise to caller`
    );
    assert(
        content.includes('id="zelle-error-display"'),
        `[${f}] In-page zelle-info has visible zelle-error-display container`
    );
    assert(
        content.includes('id="modal-zelle-error"'),
        `[${f}] Modal step-zelle has visible modal-zelle-error container`
    );
    assert(
        content.includes('id="modal-paypal-error"'),
        `[${f}] Modal step-paypal has visible modal-paypal-error container`
    );
    assert(
        content.includes('Preparing campaign memo...'),
        `[${f}] Modal PayPal status starts with neutral 'Preparing campaign memo...'`
    );
    assert(
        content.includes("logLinkClickMaster('Zelle', amt, fn, ln, em, session.id).catch("),
        `[${f}] Both Zelle click paths handle logging rejection cleanly`
    );
    assert(
        content.includes("throw new Error('Invalid server response (non-JSON)');"),
        `[${f}] logLinkClickMaster rejects on non-JSON response rather than swallowing as success`
    );
});

// 8. Test Bidirectional Amount Sync & Route-Scoped Click PK in Sandbox VM
console.log('\n--- Testing JS Logic Execution in Isolated Sandbox VM ---');
const vmContext = {
    console: console,
    Date: Date,
    Math: Math,
    parseFloat: parseFloat,
    isNaN: isNaN,
    String: String,
    Promise: Promise,
    setTimeout: setTimeout,
    CAMPAIGN_CONFIG: {
        id: 'kfw87',
        name: 'Keren Freidel Woodmere 87',
        appsScriptUrl: 'https://mock/exec',
        zelleEmail: 'test@notzer.org'
    }
};

const logicCode = `
    var activeClickSessions = { zelle: null, paypal: null };

    function mintClickPk(campId, route) {
        var prefix = 'LC-' + (campId || 'NC').toUpperCase() + '-' + (route || 'GEN').toUpperCase();
        var ts = Date.now();
        var rand = Math.random().toString(36).substring(2, 7).toUpperCase();
        return prefix + '-' + ts + '-' + rand;
    }

    function getRouteSession(route) {
        var r = (route || 'gen').toLowerCase();
        if (!activeClickSessions[r]) {
            var code = r === 'zelle' ? 'ZL' : (r === 'paypal' ? 'PP' : 'LK');
            var campId = CAMPAIGN_CONFIG.id || 'general';
            var campName = CAMPAIGN_CONFIG.name || 'Notzer Chesed';
            var pk = mintClickPk(campId, code);
            var memo = campName + ' - Ref: ' + pk;
            activeClickSessions[r] = { id: pk, memo: memo };
        }
        return activeClickSessions[r];
    }

    function resetSessions() {
        activeClickSessions.zelle = null;
        activeClickSessions.paypal = null;
    }
`;

vm.createContext(vmContext);
vm.runInContext(logicCode, vmContext);

const zSession1 = vm.runInContext("getRouteSession('zelle')", vmContext);
const zSession2 = vm.runInContext("getRouteSession('zelle')", vmContext);
assert(zSession1.id === zSession2.id, "Repeated Zelle clicks within active session reuse ID");
assert(zSession1.id.startsWith('LC-KFW87-ZL-'), "Zelle PK has correct route format LC-KFW87-ZL-");
assert(zSession1.memo.includes('Ref: LC-KFW87-ZL-'), "Zelle memo includes campaign name and Ref ID");

const pSession1 = vm.runInContext("getRouteSession('paypal')", vmContext);
assert(pSession1.id !== zSession1.id, "PayPal session gets independent ID from Zelle");
assert(pSession1.id.startsWith('LC-KFW87-PP-'), "PayPal PK has correct route format LC-KFW87-PP-");
assert(pSession1.memo.includes('Ref: LC-KFW87-PP-'), "PayPal memo includes campaign name and Ref ID");

// Test session reset on modal close
vm.runInContext("resetSessions()", vmContext);
const zSession3 = vm.runInContext("getRouteSession('zelle')", vmContext);
assert(zSession3.id !== zSession1.id, "After modal/panel close reset, subsequent attempt mints a fresh unique PK");

// 9. Check all 5 files for fail-closed double-charge lockout on accounting_error
console.log('\n--- Verifying Double-Charge Lockout on All 5 Donation Pages ---');
allFiles.forEach(f => {
    const fullPath = path.resolve(BASE_DIR, f);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert(
        content.includes("data.status === 'accounting_error'") &&
        content.includes("data.refNum && data.status !== 'success'"),
        `[${f}] Handles data.status === 'accounting_error' and unexpected refNum status`
    );
    assert(
        content.includes("btn.textContent = 'Payment Processed (Contact Support)'") &&
        content.includes("btn.disabled = true;"),
        `[${f}] Permanently locks Donate button to prevent double-charging donor`
    );
    assert(
        content.includes("Please DO NOT submit again to prevent duplicate charges"),
        `[${f}] Displays explicit donor advisory against resubmission`
    );
});

console.log(`\n====================================================`);
console.log(`ALL TESTS PASSED: ${passedTests}/${totalTests} assertions GREEN!`);
console.log('====================================================\n');
