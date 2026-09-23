const fs = require('fs');
const content = fs.readFileSync('apps-script-backend/Code.gs', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('function updateScheduledPayment')) {
    console.log(`${idx + 1}: ${line}`);
  }
});
