const fs = require('fs');
const files = [
  'templates/donation-page/template.html',
  'campaigns/kfw87/index.html',
  'keren-hk-m-twersky.html',
  'keren-shlomo-yechiel.html',
  'donate/index.html'
];

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  lines.forEach((l, idx) => {
    if (l.includes('showDeclinedModal(')) {
      console.log(`${f}:${idx + 1}: ${l.trim()}`);
    }
  });
});
