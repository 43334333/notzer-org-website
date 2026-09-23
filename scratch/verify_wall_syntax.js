const fs = require('fs');
const vm = require('vm');
const path = require('path');

const files = [
  'templates/wall-page/template.html',
  'wall/keren-hk-m-twersky/index.html',
  'wall/kfw87/index.html',
  'wall/ksy/index.html'
];

let allOk = true;
files.forEach(f => {
  const html = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  // Extract script tags
  const regex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let count = 0;
  while ((match = regex.exec(html)) !== null) {
    count++;
    const js = match[1];
    try {
      new vm.Script(js);
    } catch (err) {
      console.error(`[SYNTAX ERROR] ${f} script #${count}:`, err.message);
      allOk = false;
    }
  }
  if (allOk) console.log(`[OK] ${f}: ${count} scripts verified with 0 syntax errors`);
});

if (!allOk) process.exit(1);
