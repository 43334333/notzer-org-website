const fs = require('fs');

const adminFiles = [
  'admin/kfw87/index.html',
  'admin/keren-hk-m-twersky/index.html',
  'admin/ksy/index.html',
  'admin/index.html'
];

for (const f of adminFiles) {
  if (!fs.existsSync(f)) {
    console.log(`File not found: ${f}`);
    continue;
  }
  const content = fs.readFileSync(f, 'utf8');
  console.log(`=== ${f} ===`);
  console.log(`Has transactionsTable: ${content.includes('transactionsTable')}`);
  console.log(`Has txnTotalFees: ${content.includes('txnTotalFees')}`);
  console.log(`Has renderTransactions: ${content.includes('renderTransactions')}`);
  console.log(`Has feeDefaultsTable: ${content.includes('feeDefaultsTable')}`);
  console.log(`Has colspan="10": ${content.includes('colspan="10"')}`);
}
