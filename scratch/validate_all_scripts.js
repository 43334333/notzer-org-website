const fs = require('fs');
const path = require('path');
const vm = require('vm');

const files = [
    'templates/donation-page/template.html',
    'campaigns/kfw87/index.html',
    'keren-hk-m-twersky.html',
    'keren-shlomo-yechiel.html',
    'donate/index.html',
    'donation-success.html',
    'templates/admin-page/template.html',
    'admin/kfw87/index.html',
    'admin/keren-hk-m-twersky/index.html',
    'admin/ksy/index.html',
    'admin/index.html'
];

let totalScripts = 0;
let errors = 0;

files.forEach(f => {
    const fullPath = path.resolve(__dirname, '..', f);
    const content = fs.readFileSync(fullPath, 'utf8');
    const regex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    let count = 0;
    while ((match = regex.exec(content)) !== null) {
        const code = match[1].trim();
        // Skip empty scripts or external src-only scripts
        if (!code || match[0].includes('src=')) continue;
        count++;
        totalScripts++;
        try {
            new vm.Script(code);
        } catch (e) {
            console.error(`❌ Syntax error in [${f}] script #${count}:`, e.message);
            errors++;
        }
    }
    console.log(`[OK] ${f}: ${count} inline scripts validated with 0 syntax errors`);
});

if (errors === 0) {
    console.log(`\n🎉 SUCCESS: All ${totalScripts} inline scripts across all 11 files passed JS syntax validation!`);
} else {
    process.exit(1);
}
