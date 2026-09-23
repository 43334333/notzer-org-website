const fs = require('fs');
['keren-shlomo-yechiel.html', 'donate/index.html'].forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  lines.forEach((l, idx) => {
    if (l.includes('redirectToSuccess(') || l.includes('function processPayment(')) {
      console.log(`${f}:${idx + 1}: ${l.trim()}`);
    }
  });
});
