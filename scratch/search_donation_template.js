const fs = require('fs');
const content = fs.readFileSync('templates/donation-page/template.html', 'utf8');
const lines = content.split(/\r?\n/);

const terms = [
  'custom-amount-wrapper',
  'custom-amount',
  'other-ways',
  'donate-btn',
  'donation-status',
  'addIfieldKeyPressCallback',
  'card-brand',
  'openZelleModal',
  'openPaypalModal',
  'logLinkClick'
];

terms.forEach(term => {
  const matches = [];
  lines.forEach((line, idx) => {
    if (line.includes(term)) matches.push(idx + 1);
  });
  console.log(`${term}: [${matches.join(', ')}]`);
});
