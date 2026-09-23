const fs = require('fs');
const content = fs.readFileSync('apps-script-backend/SetupScript.gs', 'utf8');
const lines = content.split(/\r?\n/);

lines.forEach((line, idx) => {
  if (line.includes('Transactions') || line.includes('Fee_Config') || line.includes('LinkClicks')) {
    console.log(`line ${idx + 1}: ${line.trim()}`);
  }
});
