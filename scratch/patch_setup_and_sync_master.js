const fs = require('fs');
const vm = require('vm');

// 1. Patch SetupScript.gs
const setupPath = 'apps-script-backend/SetupScript.gs';
let setupCode = fs.readFileSync(setupPath, 'utf8');

function normalize(str) {
  return str.replace(/\r\n/g, '\n');
}

function replaceInSetup(label, searchStr, replaceStr) {
  const normCode = normalize(setupCode);
  const normSearch = normalize(searchStr);
  const normReplace = normalize(replaceStr);

  const count = normCode.split(normSearch).length - 1;
  if (count === 0) throw new Error(`Target not found for: ${label}`);
  if (count > 1) throw new Error(`Target found ${count} times for: ${label}`);

  const newNormCode = normCode.replace(normSearch, normReplace);
  setupCode = newNormCode.replace(/\n/g, '\r\n');
  console.log(`✅ SetupScript patched: ${label}`);
}

// Tab 2: Transactions
const sTab2 = `  // ── Tab 2: Transactions (cols A-N) ──
  var txnSheet = ss.insertSheet('Transactions');
  txnSheet.getRange('A1:N1').setValues([[
    'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Net',
    'Donor Name', 'Pledge ID', 'Customer ID', 'Result', 'Method',
    'Card Type', 'Payment #', 'Funded', 'Funded Date'
  ]]);
  formatHeaderRow_(txnSheet, 'A1:N1');
  txnSheet.getRange('C2:E1000').setNumberFormat('$#,##0.00');`;

const rTab2 = `  // ── Tab 2: Transactions (cols A-O) ──
  var txnSheet = ss.insertSheet('Transactions');
  txnSheet.getRange('A1:O1').setValues([[
    'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Fund Charge', 'Net',
    'Donor Name', 'Pledge ID', 'Customer ID', 'Result', 'Method',
    'Card Type', 'Payment #', 'Funded', 'Funded Date'
  ]]);
  formatHeaderRow_(txnSheet, 'A1:O1');
  txnSheet.getRange('C2:F1000').setNumberFormat('$#,##0.00');`;

replaceInSetup('Tab 2 Transactions', sTab2, rTab2);

// Tab 6: LinkClicks
const sTab6 = `  // ── Tab 6: LinkClicks (cols A-F) ──
  var clicksSheet = ss.insertSheet('LinkClicks');
  clicksSheet.getRange('A1:F1').setValues([[
    'Timestamp', 'First Name', 'Last Name',
    'Email', 'Link Clicked', 'Campaign'
  ]]);
  formatHeaderRow_(clicksSheet, 'A1:F1');`;

const rTab6 = `  // ── Tab 6: LinkClicks (cols A-H) ──
  var clicksSheet = ss.insertSheet('LinkClicks');
  clicksSheet.getRange('A1:H1').setValues([[
    'Click ID', 'Timestamp', 'First Name', 'Last Name',
    'Email', 'Link Clicked', 'Campaign', 'Amount'
  ]]);
  formatHeaderRow_(clicksSheet, 'A1:H1');
  clicksSheet.setColumnWidth(1, 180);`;

replaceInSetup('Tab 6 LinkClicks', sTab6, rTab6);

// Tab 7: Fee_Config
const sTab7 = `  // ── Tab 7: Fee_Config (cols A-C) ──
  var feeSheet = ss.insertSheet('Fee_Config');
  feeSheet.getRange('A1:C1').setValues([['Method', 'Rate', 'Flat Fee']]);
  var feeDefaults = [
    ['Credit Card', 0.03, 0.30],
    ['Cardknox', 0.03, 0.30],
    ['USAePay', 0.03, 0.30],
    ['Matbia', 0.025, 0.00],
    ['DAF - OJCF', 0.00, 0.00],
    ['DAF - Pledger', 0.00, 0.00],
    ['DAF - Matbia', 0.00, 0.00],
    ['DAF - The Donors Fund', 0.00, 0.00],
    ['Check', 0.00, 0.00],
    ['Zelle', 0.00, 0.00],
    ['PayPal', 0.029, 0.30],
    ['Wire Transfer', 0.00, 0.00],
    ['Cash', 0.00, 0.00],
    ['Bank Transfer', 0.00, 0.00],
    ['Other', 0.00, 0.00]
  ];
  feeSheet.getRange(2, 1, feeDefaults.length, 3).setValues(feeDefaults);
  formatHeaderRow_(feeSheet, 'A1:C1');
  feeSheet.getRange('B2:B100').setNumberFormat('0.00%');
  feeSheet.getRange('C2:C100').setNumberFormat('$#,##0.00');`;

const rTab7 = `  // ── Tab 7: Fee_Config (cols A-D) ──
  var feeSheet = ss.insertSheet('Fee_Config');
  feeSheet.getRange('A1:D1').setValues([['Method', 'Rate', 'Flat Fee', 'Fund_Charge']]);
  var feeDefaults = [
    ['Credit Card', 0.03, 0.30, 0.01],
    ['Cardknox', 0.03, 0.30, 0.01],
    ['USAePay', 0.03, 0.30, 0.01],
    ['Matbia', 0.025, 0.00, 0.01],
    ['DAF - OJCF', 0.00, 0.00, 0.01],
    ['DAF - Pledger', 0.00, 0.00, 0.01],
    ['DAF - Matbia', 0.00, 0.00, 0.01],
    ['DAF - The Donors Fund', 0.00, 0.00, 0.01],
    ['Check', 0.00, 0.00, 0.01],
    ['Zelle', 0.00, 0.00, 0.01],
    ['PayPal', 0.029, 0.30, 0.01],
    ['Wire Transfer', 0.00, 0.00, 0.01],
    ['Cash', 0.00, 0.00, 0.01],
    ['Bank Transfer', 0.00, 0.00, 0.01],
    ['Other', 0.00, 0.00, 0.01]
  ];
  feeSheet.getRange(2, 1, feeDefaults.length, 4).setValues(feeDefaults);
  formatHeaderRow_(feeSheet, 'A1:D1');
  feeSheet.setColumnWidth(1, 200);
  feeSheet.setColumnWidth(2, 80);
  feeSheet.setColumnWidth(3, 80);
  feeSheet.setColumnWidth(4, 100);
  feeSheet.getRange('B2:B100').setNumberFormat('0.00%');
  feeSheet.getRange('C2:C100').setNumberFormat('$#,##0.00');
  feeSheet.getRange('D2:D100').setNumberFormat('0.00%');`;

replaceInSetup('Tab 7 Fee_Config', sTab7, rTab7);

fs.writeFileSync(setupPath, setupCode, 'utf8');
new vm.Script(setupCode, { filename: setupPath });
console.log('✅ SetupScript.gs syntax validated!');

// 2. Sync Code.gs to MasterCode.gs
const codePath = 'apps-script-backend/Code.gs';
const masterCodePath = 'apps-script-backend/MasterCode.gs';
const codeContent = fs.readFileSync(codePath, 'utf8');
fs.writeFileSync(masterCodePath, codeContent, 'utf8');
new vm.Script(codeContent, { filename: masterCodePath });
console.log('✅ MasterCode.gs synced and syntax validated!');
