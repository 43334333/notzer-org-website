const fs = require('fs');
const vm = require('vm');

const files = [
    'templates/donation-page/template.html',
    'campaigns/kfw87/index.html',
    'keren-hk-m-twersky.html',
    'keren-shlomo-yechiel.html',
    'donate/index.html'
];

let allPassed = true;

files.forEach(filePath => {
    console.log(`\n========================================`);
    console.log(`Deep validating: ${filePath}`);
    console.log(`========================================`);
    const content = fs.readFileSync(filePath, 'utf8');

    // 1. Extract and validate all <script> blocks
    const scriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
    let match;
    let scriptIdx = 0;
    let jsErrors = 0;

    while ((match = scriptRegex.exec(content)) !== null) {
        scriptIdx++;
        const scriptBody = match[1].trim();
        // Skip external scripts (empty body)
        if (!scriptBody) continue;

        // Skip template placeholders like {{...}} for raw JS parsing if template
        let testCode = scriptBody;
        if (filePath.includes('template.html')) {
            testCode = testCode.replace(/\{\{[^}]+\}\}/g, '""');
        } else if (filePath.includes('donate/index.html')) {
            testCode = testCode.replace(/\{\{[^}]+\}\}/g, '""');
        }

        try {
            new vm.Script(testCode);
            console.log(`  [JS] Script block #${scriptIdx} syntax OK`);
        } catch (err) {
            console.error(`  [JS ERROR] Script block #${scriptIdx} in ${filePath}:`, err.message);
            jsErrors++;
            allPassed = false;
        }
    }

    // 2. Element ID checks
    const expectedIds = [
        'cardknox-fields',
        'btn-schedule-onetime',
        'btn-schedule-recurring',
        'btn-schedule-installment',
        'recurring-panel',
        'installment-panel',
        'recurring-check',
        'installment-check'
    ];

    expectedIds.forEach(id => {
        if (!content.includes(`id="${id}"`)) {
            console.error(`  [ID ERROR] Missing id="${id}"`);
            allPassed = false;
        } else {
            console.log(`  [ID OK] id="${id}" present`);
        }
    });

    // 3. Cardknox field labels
    if (!content.includes('Credit, Debit, Donors Fund, OJC, Pledger, Matbia')) {
        console.error(`  [LABEL ERROR] Card number label does not list all DAF types`);
        allPassed = false;
    } else {
        console.log(`  [LABEL OK] Card number label includes all DAF card types`);
    }

    if (!content.includes('CVV / PIN')) {
        console.error(`  [LABEL ERROR] CVV label or placeholder does not mention PIN`);
        allPassed = false;
    } else {
        console.log(`  [LABEL OK] CVV label/placeholder includes PIN`);
    }

    // 4. Function definitions
    const expectedFuncs = ['setScheduleType', 'syncScheduleInputs', 'updateInstallmentSummary'];
    expectedFuncs.forEach(fn => {
        if (!content.includes(`function ${fn}`) && !content.includes(`${fn}(`) && !content.includes(`${fn} =`)) {
            console.error(`  [FN ERROR] Missing function ${fn}`);
            allPassed = false;
        } else {
            console.log(`  [FN OK] Function ${fn} defined`);
        }
    });
});

console.log(`\n========================================`);
if (allPassed) {
    console.log('ALL 5 FILES PASSED DEEP VALIDATION!');
} else {
    console.error('DEEP VALIDATION FAILED!');
    process.exit(1);
}
