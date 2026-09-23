const fs = require('fs');
const content = fs.readFileSync('apps-script-backend/Code.gs', 'utf8');
const lines = content.split(/\r?\n/);

lines.forEach((line, idx) => {
  if (line.includes('logTransactionMaster(')) {
    console.log(`line ${idx + 1}: ${line.trim()}`);
  }
});
