const fs = require('fs');
const path = require('path');

const BASE_DIR = path.resolve(__dirname, '..');

// 1. campaigns/kfw87/index.html layout re-nesting
const kfwPath = path.resolve(BASE_DIR, 'campaigns/kfw87/index.html');
let kfw = fs.readFileSync(kfwPath, 'utf8');

const kfwTarget = /\r?\n\s*<\/div>\r?\n\s*<\/div>\r?\n\r?\n\s*<!-- Full-width bottom section -->/;
if (kfwTarget.test(kfw)) {
    kfw = kfw.replace(kfwTarget, '');
    kfw = kfw.replace(
        /(\s*<\/div>\s*<\/div>\s*<\/div>\s*)<\/form>/,
        '$1                        </div>\n                    </div>\n                </form>'
    );
    fs.writeFileSync(kfwPath, kfw, 'utf8');
    console.log('[OK] campaigns/kfw87/index.html layout re-nested successfully');
} else {
    console.error('kfwTarget not found in campaigns/kfw87/index.html');
}

// 2. donate/index.html recurring-frequency add daily
const donatePath = path.resolve(BASE_DIR, 'donate/index.html');
let donate = fs.readFileSync(donatePath, 'utf8');

const donateTarget = /(<select class="recurring-select" id="recurring-frequency"[^>]*>\r?\n\s*)(<option value="weekly">)/;
if (donateTarget.test(donate)) {
    donate = donate.replace(donateTarget, '$1<option value="daily">Daily</option>\n                                                $2');
    fs.writeFileSync(donatePath, donate, 'utf8');
    console.log('[OK] donate/index.html recurring-frequency daily added successfully');
} else {
    console.error('donateTarget not found in donate/index.html');
}
