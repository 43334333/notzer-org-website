const fs = require('fs');
const content = fs.readFileSync('donate/index.html', 'utf8');
const lines = content.split(/\r?\n/);

console.log('Total lines in donate/index.html:', lines.length);
lines.forEach((line, idx) => {
  if (line.includes('custom-amount') || line.includes('amount') || line.includes('card-number') || line.includes('donate-btn') || line.includes('zelle') || line.includes('paypal')) {
    if (line.length < 120) {
      console.log(`${idx + 1}: ${line.trim()}`);
    }
  }
});
