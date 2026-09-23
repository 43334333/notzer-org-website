const fs = require('fs');
const content = fs.readFileSync('apps-script-backend/Code.gs', 'utf8');
const lines = content.split(/\r?\n/);

const patterns = [
  'function getReconciliationDataMaster_',
  'getReconciliationDataMaster',
  'resendReceipt',
  'provisionCampaignSheet',
  'calculateFundCharge',
  'calculateFee'
];

for (const p of patterns) {
  let found = [];
  lines.forEach((line, idx) => {
    if (line.includes(p)) {
      found.push(idx + 1);
    }
  });
  console.log(`${p}: lines [${found.join(', ')}]`);
}
