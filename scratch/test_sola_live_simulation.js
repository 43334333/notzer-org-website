/**
 * test_sola_live_simulation.js
 *
 * Verifies and proves:
 * 1. Why live deployment @52 failed to calculate and deduct fees on Sola DAF transactions (reproduction of live bug).
 * 2. That current 'main' correctly resolves Cardknox Sola xCardType values ('Pledger', 'OJC', 'DonorsFund'),
 *    calculates fees and fund charges from Fee_Config, and logs them accurately to Transactions.
 */

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { execSync } = require('child_process');

// ─── Mock Google Apps Script Spreadsheet Environment ─────────
class MockSheet {
  constructor(name) {
    this.name = name;
    this.rows = [];
    this.columnWidths = {};
    this.formats = {};
    this.weights = {};
  }
  getLastRow() { return this.rows.length; }
  getLastColumn() {
    return this.rows.reduce((max, row) => Math.max(max, row ? row.length : 0), 0);
  }
  appendRow(row) {
    this.rows.push([...row]);
  }
  getRange(row, col, numRows = 1, numCols = 1) {
    const sheet = this;
    return {
      getValues: () => {
        const res = [];
        for (let r = 0; r < numRows; r++) {
          const rowIdx = row - 1 + r;
          const rowData = sheet.rows[rowIdx] || [];
          const slice = [];
          for (let c = 0; c < numCols; c++) {
            const colIdx = col - 1 + c;
            slice.push(rowData[colIdx] !== undefined ? rowData[colIdx] : '');
          }
          res.push(slice);
        }
        return res;
      },
      getValue: () => {
        const rowData = sheet.rows[row - 1] || [];
        return rowData[col - 1] !== undefined ? rowData[col - 1] : '';
      },
      setValue: (val) => {
        for (let r = 0; r < numRows; r++) {
          const rowIdx = row - 1 + r;
          while (sheet.rows.length <= rowIdx) sheet.rows.push([]);
          for (let c = 0; c < numCols; c++) {
            const colIdx = col - 1 + c;
            while (sheet.rows[rowIdx].length <= colIdx) sheet.rows[rowIdx].push('');
            sheet.rows[rowIdx][colIdx] = val;
          }
        }
      },
      setFontWeight: (weight) => { sheet.weights[`${row}:${col}`] = weight; },
      setNumberFormat: (fmt) => { sheet.formats[`${row}:${col}`] = fmt; }
    };
  }
  setColumnWidth(col, width) { this.columnWidths[col] = width; }
}

class MockSpreadsheet {
  constructor(id) {
    this.id = id;
    this.sheets = {};
  }
  getId() { return this.id; }
  getSheetByName(name) { return this.sheets[name] || null; }
  insertSheet(name) {
    if (!this.sheets[name]) {
      this.sheets[name] = new MockSheet(name);
    }
    return this.sheets[name];
  }
}

// ─── Extract v52 Code from Git Commit 6146f1c ────────────────
const v52Code = execSync('git show 6146f1c:apps-script-backend/Code.gs', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const mainCode = fs.readFileSync('apps-script-backend/Code.gs', 'utf8');

function createGasSandbox(codeString) {
  const sandbox = {
    Logger: { log: () => {} },
    Utilities: {
      formatDate: (date, tz, fmt) => '2026-09-17'
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => null
      })
    },
    SpreadsheetApp: {
      openById: (id) => new MockSpreadsheet(id)
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(codeString, sandbox);
  return sandbox;
}

const v52Sandbox = createGasSandbox(v52Code);
const mainSandbox = createGasSandbox(mainCode);

console.log('=== SOLA DAF TRANSACTION REPRODUCTION & RESOLUTION SUITE ===\n');

// Standard Campaign Fee_Config Setup
function setupStandardFeeConfig(ss) {
  const feeSheet = ss.insertSheet('Fee_Config');
  feeSheet.appendRow(['Method', 'Rate', 'Flat Fee', 'Fund_Charge']);
  feeSheet.appendRow(['Credit Card', 0.03, 0.30, 0.01]);
  feeSheet.appendRow(['Cardknox', 0.03, 0.30, 0.01]);
  feeSheet.appendRow(['USAePay', 0.03, 0.30, 0.01]);
  feeSheet.appendRow(['Matbia', 0.025, 0.00, 0.01]);
  feeSheet.appendRow(['DAF - OJCF', 0.00, 0.00, 0.01]);
  feeSheet.appendRow(['DAF - Pledger', 0.00, 0.00, 0.01]);
  feeSheet.appendRow(['DAF - Matbia', 0.00, 0.00, 0.01]);
  feeSheet.appendRow(['DAF - The Donors Fund', 0.00, 0.00, 0.01]);
  feeSheet.appendRow(['Check', 0.00, 0.00, 0.01]);
  feeSheet.appendRow(['Zelle', 0.00, 0.00, 0.01]);
  feeSheet.appendRow(['PayPal', 0.029, 0.30, 0.01]);
  return feeSheet;
}

// ─── 1. REPRODUCE BUG ON V52 ─────────────────────────────────
console.log('1. Testing Live Production Version 52:');

const v52SS = new MockSpreadsheet('camp-v52');
setupStandardFeeConfig(v52SS);

// In v52, calculateFundCharge does not exist
assert.strictEqual(typeof v52Sandbox.calculateFundCharge, 'undefined', 'v52 should lack calculateFundCharge');

// In v52, calculateFee with Cardknox xCardType returns 0 or undefined
const v52PledgerFee = v52Sandbox.calculateFee('Pledger', 100, v52SS);
const v52OjcFee = v52Sandbox.calculateFee('OJC', 180, v52SS);
const v52TdfFee = v52Sandbox.calculateFee('DonorsFund', 250, v52SS);

console.log(`   v52 Pledger fee on $100: ${v52PledgerFee} (Unmatched - zero fee)`);
console.log(`   v52 OJC fee on $180: ${v52OjcFee} (Unmatched - zero fee)`);
console.log(`   v52 DonorsFund fee on $250: ${v52TdfFee} (Unmatched - zero fee)`);

assert(isNaN(v52PledgerFee) || v52PledgerFee === 0, 'v52 fails to resolve Pledger fee');
assert(isNaN(v52OjcFee) || v52OjcFee === 0, 'v52 fails to resolve OJC fee');
assert(isNaN(v52TdfFee) || v52TdfFee === 0, 'v52 fails to resolve DonorsFund fee');
console.log('   ✅ Confirmed: v52 fails to resolve Cardknox DAF card types and has no fund charge logic.\n');

// ─── 2. VERIFY RESOLUTION ON CURRENT MAIN ────────────────────
console.log('2. Testing Current Main (Standard Fee_Config):');

const mainSS = new MockSpreadsheet('camp-main');
setupStandardFeeConfig(mainSS);

// Cardknox Pledger Transaction
const mainPledgerFee = mainSandbox.calculateFee('Pledger', 100, mainSS);
const mainPledgerFC = mainSandbox.calculateFundCharge('Pledger', 100, mainSS);
console.log(`   main Pledger ($100): Fee = $${mainPledgerFee.toFixed(2)}, Fund Charge = $${mainPledgerFC.toFixed(2)}`);
assert.strictEqual(mainPledgerFee, 0.00, 'Pledger gateway fee should be 0.00 according to DAF - Pledger config');
assert.strictEqual(mainPledgerFC, 1.00, 'Pledger Fund Charge should be 1% ($1.00)');

// Cardknox OJC Transaction
const mainOjcFee = mainSandbox.calculateFee('OJC', 180, mainSS);
const mainOjcFC = mainSandbox.calculateFundCharge('OJC', 180, mainSS);
console.log(`   main OJC ($180): Fee = $${mainOjcFee.toFixed(2)}, Fund Charge = $${mainOjcFC.toFixed(2)}`);
assert.strictEqual(mainOjcFee, 0.00, 'OJC gateway fee should be 0.00 according to DAF - OJCF config');
assert.strictEqual(mainOjcFC, 1.80, 'OJC Fund Charge should be 1% ($1.80)');

// Cardknox The Donors Fund (DonorsFund) Transaction
const mainTdfFee = mainSandbox.calculateFee('DonorsFund', 250, mainSS);
const mainTdfFC = mainSandbox.calculateFundCharge('DonorsFund', 250, mainSS);
console.log(`   main DonorsFund ($250): Fee = $${mainTdfFee.toFixed(2)}, Fund Charge = $${mainTdfFC.toFixed(2)}`);
assert.strictEqual(mainTdfFee, 0.00, 'DonorsFund gateway fee should be 0.00 according to DAF - The Donors Fund config');
assert.strictEqual(mainTdfFC, 2.50, 'DonorsFund Fund Charge should be 1% ($2.50)');

// ─── 3. TEST CUSTOM FEE SCHEDULE DEDUCTIONS ──────────────────
console.log('\n3. Testing Custom Non-Zero Fee Schedule:');
const customSS = new MockSpreadsheet('camp-custom');
const customFeeSheet = customSS.insertSheet('Fee_Config');
customFeeSheet.appendRow(['Method', 'Rate', 'Flat Fee', 'Fund_Charge']);
customFeeSheet.appendRow(['DAF - Pledger', 0.02, 0.30, 0.015]); // 2.0% + $0.30, 1.5% Fund Charge
customFeeSheet.appendRow(['DAF - OJCF', 0.015, 0.25, 0.02]);   // 1.5% + $0.25, 2.0% Fund Charge
customFeeSheet.appendRow(['DAF - The Donors Fund', 0.00, 0.00, 0.01]); // 0% fee, 1% Fund Charge

// Custom Pledger on $100: Fee = 100 * 0.02 + 0.30 = $2.30; FC = 100 * 0.015 = $1.50; Net = $96.20
const custPledgerFee = mainSandbox.calculateFee('Pledger', 100, customSS);
const custPledgerFC = mainSandbox.calculateFundCharge('Pledger', 100, customSS);
console.log(`   custom Pledger ($100): Fee = $${custPledgerFee.toFixed(2)}, Fund Charge = $${custPledgerFC.toFixed(2)}`);
assert.strictEqual(custPledgerFee, 2.30);
assert.strictEqual(custPledgerFC, 1.50);

// Log to Transactions sheet and verify column values and Net deduction
const txSheet = customSS.insertSheet('Transactions');
txSheet.appendRow([
  'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Fund Charge', 'Net', 'Donor Name',
  'Pledge ID', 'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date'
]);

mainSandbox.logTransactionMaster(
  customSS,
  'PL-101',
  'CUST-101',
  'Reuven Ploni',
  100,
  { xResult: 'A', xRefNum: 'SOLA-PL-001', xCardType: 'Pledger', xMaskedCardNumber: '5399********1234' },
  '1',
  custPledgerFee,
  custPledgerFC
);

const loggedRow = txSheet.rows[1];
console.log('   Logged transaction row:', loggedRow);
assert.strictEqual(loggedRow[1], 'SOLA-PL-001', 'Reference should be SOLA-PL-001');
assert.strictEqual(loggedRow[2], 100, 'Amount Charged should be 100');
assert.strictEqual(loggedRow[3], 2.30, 'Fees should be 2.30');
assert.strictEqual(loggedRow[4], 1.50, 'Fund Charge should be 1.50');
assert.strictEqual(loggedRow[5], 96.20, 'Net should be exactly 96.20 (100 - 2.30 - 1.50)');
assert.strictEqual(loggedRow[11], 'Pledger', 'Card Type should be Pledger');

console.log('\n=============================================================');
console.log('🎉 ALL SOLA DAF TESTS PASSED: Bug reproduced on v52, verified fixed on main!');
console.log('=============================================================');
