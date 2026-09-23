const fs = require('fs');
const content = fs.readFileSync('admin/index.html', 'utf8');
const lines = content.split(/\r?\n/);

lines.forEach((line, idx) => {
  if (line.includes('feeDefaultsTable') || line.includes('Fee Defaults') || line.includes('loadFeeDefaults') || line.includes('saveFeeDefaults')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
