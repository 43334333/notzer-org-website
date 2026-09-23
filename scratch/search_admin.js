const fs = require('fs');
const content = fs.readFileSync('templates/admin-page/template.html', 'utf8');
const lines = content.split(/\r?\n/);

lines.forEach((line, idx) => {
  if (line.includes('Transactions') || line.includes('transactions') || line.includes('txn') || line.includes('Net') || line.includes('Fees')) {
    if (line.includes('table') || line.includes('<th>') || line.includes('colspan') || line.includes('Summary') || line.includes('summary')) {
      console.log(`${idx + 1}: ${line.trim()}`);
    }
  }
});
