const fs = require('fs');

function validateHtml(filePath) {
    console.log(`Checking ${filePath}...`);
    const content = fs.readFileSync(filePath, 'utf8');

    const requiredChecks = [
        'id="cardknox-fields"',
        'id="btn-schedule-onetime"',
        'id="btn-schedule-recurring"',
        'id="btn-schedule-installment"',
        'id="recurring-panel"',
        'id="installment-panel"',
        'id="recurring-check"',
        'id="installment-check"',
        'setScheduleType',
        'syncScheduleInputs',
        'Matbia',
        'CVV / PIN'
    ];

    let passed = true;
    requiredChecks.forEach(check => {
        if (!content.includes(check)) {
            console.error(`  FAIL: Missing "${check}" in ${filePath}`);
            passed = false;
        }
    });

    // Check that daf-options-container exists if the page has DAF options
    if (content.includes('tdf-form-container') || content.includes('daf-links')) {
        if (!content.includes('id="daf-options-container"')) {
            console.error(`  FAIL: Missing "daf-options-container" in DAF page ${filePath}`);
            passed = false;
        }
    }

    if (passed) {
        console.log(`  PASS: All required elements found in ${filePath}`);
    }
    return passed;
}

const files = [
    'templates/donation-page/template.html',
    'campaigns/kfw87/index.html',
    'keren-hk-m-twersky.html',
    'keren-shlomo-yechiel.html',
    'donate/index.html'
];

let allPassed = true;
files.forEach(f => {
    if (!validateHtml(f)) allPassed = false;
});

if (allPassed) {
    console.log('\nAll checked files passed validation!');
} else {
    process.exit(1);
}
