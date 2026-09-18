const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

// Create mock Google Apps Script environment
class MockRange {
  constructor(sheet, startRow, startCol, numRows = 1, numCols = 1) {
    this.sheet = sheet;
    this.startRow = startRow;
    this.startCol = startCol;
    this.numRows = numRows;
    this.numCols = numCols;
  }

  getValue() {
    return this.getValues()[0][0];
  }

  getValues() {
    const res = [];
    for (let r = 0; r < this.numRows; r++) {
      const rowArr = [];
      for (let c = 0; c < this.numCols; c++) {
        const rowIdx = this.startRow - 1 + r;
        const colIdx = this.startCol - 1 + c;
        rowArr.push(this.sheet.cells[rowIdx] ? (this.sheet.cells[rowIdx][colIdx] !== undefined ? this.sheet.cells[rowIdx][colIdx] : '') : '');
      }
      res.push(rowArr);
    }
    return res;
  }

  getDisplayValues() {
    return this.getValues().map(row => row.map(v => String(v !== undefined && v !== null ? v : '')));
  }

  setValue(val) {
    this.setValues([[val]]);
    return this;
  }

  setValues(valArr) {
    for (let r = 0; r < valArr.length; r++) {
      const rowIdx = this.startRow - 1 + r;
      if (!this.sheet.cells[rowIdx]) {
        this.sheet.cells[rowIdx] = [];
      }
      for (let c = 0; c < valArr[r].length; c++) {
        const colIdx = this.startCol - 1 + c;
        this.sheet.cells[rowIdx][colIdx] = valArr[r][c];
      }
    }
    return this;
  }

  setFontWeight() { return this; }
  setNumberFormat() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
}

class MockSheet {
  constructor(name, spreadsheet) {
    this.name = name;
    this.spreadsheet = spreadsheet;
    this.cells = []; // 2D array [row][col] (0-indexed)
  }

  getName() { return this.name; }
  setName(name) { this.name = name; return this; }

  getLastRow() {
    return this.cells.length;
  }

  getLastColumn() {
    let max = 0;
    for (const r of this.cells) {
      if (r && r.length > max) max = r.length;
    }
    return max;
  }

  getRange(a1OrRow, col, numRows, numCols) {
    if (typeof a1OrRow === 'string') {
      const match = a1OrRow.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i);
      if (match) {
        const colToNum = c => {
          let n = 0;
          for (let i = 0; i < c.length; i++) n = n * 26 + c.charCodeAt(i) - 64;
          return n;
        };
        const startCol = colToNum(match[1]);
        const startRow = parseInt(match[2], 10);
        const endCol = match[3] ? colToNum(match[3]) : startCol;
        const endRow = match[4] ? parseInt(match[4], 10) : startRow;
        return new MockRange(this, startRow, startCol, endRow - startRow + 1, endCol - startCol + 1);
      }
      if (a1OrRow === '1:1') {
        return new MockRange(this, 1, 1, 1, Math.max(1, this.getLastColumn()));
      }
      return new MockRange(this, 1, 1, 1, 1);
    }
    return new MockRange(this, a1OrRow, col, numRows || 1, numCols || 1);
  }

  appendRow(rowArr) {
    const newRow = rowArr.slice();
    this.cells.push(newRow);
    return this;
  }

  insertColumnBefore(colIndex) {
    const idx = colIndex - 1;
    for (let r = 0; r < this.cells.length; r++) {
      if (this.cells[r]) {
        this.cells[r].splice(idx, 0, '');
      }
    }
    return this;
  }

  setColumnWidth() { return this; }
  setFrozenRows() { return this; }
}

class MockSpreadsheet {
  constructor(id = 'mock-ss-id') {
    this.id = id;
    this.sheets = {};
  }

  getId() { return this.id; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }

  getSheetByName(name) {
    return this.sheets[name] || null;
  }

  insertSheet(name) {
    const s = new MockSheet(name, this);
    this.sheets[name] = s;
    return s;
  }
}

const mockSSRegistry = {};
function getMockSS(id) {
  if (!mockSSRegistry[id]) mockSSRegistry[id] = new MockSpreadsheet(id);
  return mockSSRegistry[id];
}

const sandbox = {
  console: console,
  Logger: { log: () => {} },
  SpreadsheetApp: {
    openById: (id) => getMockSS(id),
    create: (title) => {
      const ss = new MockSpreadsheet('ss-' + Math.random());
      return ss;
    }
  },
  Utilities: {
    formatDate: (d, tz, fmt) => {
      const date = d instanceof Date ? d : new Date(d);
      return date.toISOString().slice(0, 10);
    }
  },
  Session: {
    getScriptTimeZone: () => 'America/New_York'
  },
  UrlFetchApp: {
    fetch: () => ({
      getContentText: () => JSON.stringify({ success: true }),
      getResponseCode: () => 200
    })
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => {
        if (k === 'TURNSTILE_SECRET') return 'mock-turnstile-secret';
        return 'mock-master-sheet-id';
      }
    })
  },
  CacheService: {
    getScriptCache: () => ({
      get: () => null,
      put: () => {}
    })
  },
  verifyTurnstile: () => ({ success: true }),
  Math: Math,
  Date: Date,
  parseInt: parseInt,
  parseFloat: parseFloat,
  isNaN: isNaN,
  String: String,
  Array: Array,
  Object: Object
};

// Create context and load Code.gs
const code = fs.readFileSync('apps-script-backend/Code.gs', 'utf8');
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
sandbox.verifyTurnstile = () => ({ success: true });

console.log('--- STARTING COMPREHENSIVE FUND CHARGE VERIFICATION SUITE ---');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(err.stack || err);
    failed++;
  }
}

// SCENARIO 1: Strict Header Map Validation
it('Scenario 1a: getTransactionColMap_ maps all standard columns correctly', () => {
  const ss = new MockSpreadsheet('test1');
  const sheet = ss.insertSheet('Transactions');
  sheet.appendRow([
    'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Fund Charge', 'Net',
    'Donor Name', 'Pledge ID', 'Customer ID', 'Result', 'Method',
    'Card Type', 'Payment #', 'Funded', 'Funded Date', 'Deposit Batch ID'
  ]);

  const map = sandbox.getTransactionColMap_(sheet);
  assert.strictEqual(map.timestamp, 0);
  assert.strictEqual(map.reference, 1);
  assert.strictEqual(map.amount, 2);
  assert.strictEqual(map.fees, 3);
  assert.strictEqual(map.fundCharge, 4);
  assert.strictEqual(map.net, 5);
  assert.strictEqual(map.donorName, 6);
  assert.strictEqual(map.pledgeId, 7);
  assert.strictEqual(map.customerId, 8);
  assert.strictEqual(map.result, 9);
  assert.strictEqual(map.method, 10);
  assert.strictEqual(map.cardType, 11);
  assert.strictEqual(map.paymentNum, 12);
  assert.strictEqual(map.funded, 13);
  assert.strictEqual(map.fundedDate, 14);
  assert.strictEqual(map.depositBatchId, 15);
});

it('Scenario 1b: getTransactionColMap_ rejects missing required headers fail-closed', () => {
  const ss = new MockSpreadsheet('test1b');
  const sheet = ss.insertSheet('Transactions');
  sheet.appendRow(['Timestamp', 'Reference', 'Amount Charged', 'Fees']); // Missing Net

  assert.throws(() => {
    sandbox.getTransactionColMap_(sheet);
  }, /Required header "net" missing/);
});

it('Scenario 1c: getTransactionColMap_ rejects duplicate headers fail-closed', () => {
  const ss = new MockSpreadsheet('test1c');
  const sheet = ss.insertSheet('Transactions');
  sheet.appendRow(['Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Net', 'Reference']); // Duplicate Reference

  assert.throws(() => {
    sandbox.getTransactionColMap_(sheet);
  }, /Duplicate header detected: "Reference"/);
});

it('Scenario 1d: logTransactionMaster throws fail-closed when sheet headers are invalid', () => {
  const ss = new MockSpreadsheet('test1d');
  const sheet = ss.insertSheet('Transactions');
  sheet.appendRow(['Timestamp', 'Reference', 'Amount Charged', 'Fees']); // Missing Net

  assert.throws(() => {
    sandbox.logTransactionMaster(ss, 'PL-1', 'CUST-1', 'Donor', 100, { xResult: 'A', xRefNum: 'REF-1' }, '1', 3.00);
  }, /Required header "net" missing/);
});

it('Scenario 1e: ensureCustomerSheet_ rejects corrupted Customers sheet with missing "Customer ID"', () => {
  const ss = new MockSpreadsheet('test1e');
  const sheet = ss.insertSheet('Customers');
  sheet.appendRow(['First Name', 'Last Name', 'Email']); // Missing Customer ID

  assert.throws(() => {
    sandbox.ensureCustomerSheet_(ss);
  }, /Required header "Customer ID" missing/);
});

it('Scenario 1f: ensurePledgeSheet_ rejects corrupted Pledges sheet with missing "Pledge ID"', () => {
  const ss = new MockSpreadsheet('test1f');
  const sheet = ss.insertSheet('Pledges');
  sheet.appendRow(['Customer ID', 'Amount', 'Status']); // Missing Pledge ID

  assert.throws(() => {
    sandbox.ensurePledgeSheet_(ss);
  }, /Required header "Pledge ID" missing/);
});

it('Scenario 1g: processGeneralDonation fails closed BEFORE card authorization when sheet pre-validation fails', () => {
  let gatewayCalled = false;
  sandbox.processWithFailover = () => {
    gatewayCalled = true;
    return { xResult: 'A', xRefNum: 'NEVER-CHARGED' };
  };
  sandbox.getCampaignSheetId = () => 'camp-preval-fail';
  const ss = getMockSS('camp-preval-fail');
  const custSheet = ss.insertSheet('Customers');
  custSheet.appendRow(['Corrupt', 'Headers']); // Missing Customer ID

  const res = sandbox.processGeneralDonation({
    turnstileToken: 'mock-valid-turnstile',
    cardToken: 'tok_test',
    firstName: 'Chaim',
    lastName: 'Cohen',
    email: 'chaim@example.com',
    amount: '100',
    campaignId: 'kfw87'
  });

  console.log('1g res:', res);
  assert.strictEqual(res.status, 'error');
  assert(res.message.includes('Campaign accounting pre-validation failed'));
  assert.strictEqual(gatewayCalled, false, 'Gateway MUST NOT be called when pre-validation fails!');
});

it('Scenario 1h: processGeneralDonation returns accounting_error with refNum if customer logging throws post-charge', () => {
  sandbox.processWithFailover = () => ({ xResult: 'A', xRefNum: 'GW-APPROVED-CUSTFAIL', xCardType: 'Visa' });
  sandbox.getCampaignSheetId = () => 'camp-post-custfail';
  const ss = getMockSS('camp-post-custfail');
  ss.insertSheet('Customers').appendRow(['Customer ID', 'First Name', 'Last Name', 'Email']);
  ss.insertSheet('Pledges').appendRow(['Pledge ID', 'Customer ID', 'Amount', 'Status']);
  const tx = ss.insertSheet('Transactions');
  tx.appendRow(['Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Fund Charge', 'Net', 'Donor Name', 'Pledge ID', 'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date']);

  const originalLogCust = sandbox.logCustomerMaster;
  sandbox.logCustomerMaster = () => { throw new Error('Simulated Customer disk error'); };

  try {
    const res = sandbox.processGeneralDonation({
      turnstileToken: 'mock-valid-turnstile',
      cardToken: 'tok_test',
      firstName: 'Chaim',
      lastName: 'Cohen',
      email: 'chaim@example.com',
      amount: '100',
      campaignId: 'kfw87'
    });

    assert.strictEqual(res.status, 'accounting_error');
    assert.strictEqual(res.refNum, 'GW-APPROVED-CUSTFAIL');
    assert(res.message.includes('Customer: Simulated Customer disk error'));
  } finally {
    sandbox.logCustomerMaster = originalLogCust;
  }
});

it('Scenario 1i: processGeneralDonation returns accounting_error with refNum if pledge logging throws post-charge', () => {
  sandbox.processWithFailover = () => ({ xResult: 'A', xRefNum: 'GW-APPROVED-PLGFAIL', xCardType: 'Visa' });
  sandbox.getCampaignSheetId = () => 'camp-post-plgfail';
  const ss = getMockSS('camp-post-plgfail');
  ss.insertSheet('Customers').appendRow(['Customer ID', 'First Name', 'Last Name', 'Email']);
  ss.insertSheet('Pledges').appendRow(['Pledge ID', 'Customer ID', 'Amount', 'Status']);
  const tx = ss.insertSheet('Transactions');
  tx.appendRow(['Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Fund Charge', 'Net', 'Donor Name', 'Pledge ID', 'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date']);

  const originalLogPledge = sandbox.logPledgeMaster;
  sandbox.logPledgeMaster = () => { throw new Error('Simulated Pledge write timeout'); };

  try {
    const res = sandbox.processGeneralDonation({
      turnstileToken: 'mock-valid-turnstile',
      cardToken: 'tok_test',
      firstName: 'Chaim',
      lastName: 'Cohen',
      email: 'chaim@example.com',
      amount: '100',
      campaignId: 'kfw87'
    });

    assert.strictEqual(res.status, 'accounting_error');
    assert.strictEqual(res.refNum, 'GW-APPROVED-PLGFAIL');
    assert(res.message.includes('Pledge: Simulated Pledge write timeout'));
  } finally {
    sandbox.logPledgeMaster = originalLogPledge;
  }
});

it('Scenario 1j: processGeneralDonation returns accounting_error with refNum if transaction logging throws post-charge', () => {
  sandbox.processWithFailover = () => ({ xResult: 'A', xRefNum: 'GW-APPROVED-TXFAIL', xCardType: 'Visa' });
  sandbox.getCampaignSheetId = () => 'camp-post-txfail';
  const ss = getMockSS('camp-post-txfail');
  ss.insertSheet('Customers').appendRow(['Customer ID', 'First Name', 'Last Name', 'Email']);
  ss.insertSheet('Pledges').appendRow(['Pledge ID', 'Customer ID', 'Amount', 'Status']);
  const tx = ss.insertSheet('Transactions');
  tx.appendRow(['Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Fund Charge', 'Net', 'Donor Name', 'Pledge ID', 'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date']);

  const originalLogTx = sandbox.logTransactionMaster;
  sandbox.logTransactionMaster = () => { throw new Error('Simulated Transaction quota exceeded'); };

  try {
    const res = sandbox.processGeneralDonation({
      turnstileToken: 'mock-valid-turnstile',
      cardToken: 'tok_test',
      firstName: 'Chaim',
      lastName: 'Cohen',
      email: 'chaim@example.com',
      amount: '100',
      campaignId: 'kfw87'
    });

    assert.strictEqual(res.status, 'accounting_error');
    assert.strictEqual(res.refNum, 'GW-APPROVED-TXFAIL');
    assert(res.message.includes('Transaction: Simulated Transaction quota exceeded'));
  } finally {
    sandbox.logTransactionMaster = originalLogTx;
  }
});

it('Scenario 1k: processGeneralDonation full happy path writes all 3 records and returns success', () => {
  sandbox.processWithFailover = () => ({ xResult: 'A', xRefNum: 'GW-APPROVED-FULLOK', xCardType: 'Visa' });
  sandbox.getCampaignSheetId = () => 'camp-post-fullok';
  const ss = getMockSS('camp-post-fullok');
  ss.insertSheet('Customers').appendRow(['Customer ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Street', 'City', 'State', 'Zip', 'Created Date', 'Source']);
  ss.insertSheet('Pledges').appendRow(['Pledge ID', 'Customer ID', 'Created Date', 'Donor', 'Campaign', 'Amount', 'Status', 'Amount Paid', 'Balance', 'Display Name', 'Memo', 'Anonymous', 'Teams', 'Method', 'Schedule ID', 'Notes']);
  const tx = ss.insertSheet('Transactions');
  tx.appendRow(['Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Fund Charge', 'Net', 'Donor Name', 'Pledge ID', 'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date']);

  const res = sandbox.processGeneralDonation({
    turnstileToken: 'mock-valid-turnstile',
    cardToken: 'tok_test',
    firstName: 'Moshe',
    lastName: 'Levi',
    email: 'moshe@example.com',
    amount: '150',
    campaignId: 'kfw87'
  });

  assert.strictEqual(res.status, 'success');
  assert.strictEqual(res.refNum, 'GW-APPROVED-FULLOK');
  assert(ss.getSheetByName('Customers').getLastRow() >= 2, 'Customer row must be written');
  assert(ss.getSheetByName('Pledges').getLastRow() >= 2, 'Pledge row must be written');
  assert(ss.getSheetByName('Transactions').getLastRow() >= 2, 'Transaction row must be written');
});

// SCENARIO 2: Legacy Row Reading & Non-Retroactivity
it('Scenario 2: getTransactionsMaster_ preserves historical Net and returns fundCharge: 0 on legacy 14-col sheet', () => {
  const ss = getMockSS('camp-legacy-sheet');
  const txSheet = ss.insertSheet('Transactions');
  txSheet.appendRow([
    'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Net',
    'Donor Name', 'Pledge ID', 'Customer ID', 'Result', 'Method',
    'Card Type', 'Payment #', 'Funded', 'Funded Date'
  ]);
  txSheet.appendRow([
    new Date(), 'LEGACY-REF-1', 100.00, 3.00, 97.00,
    'John Doe', 'PL-1', 'CUST-1', 'Success', 'Credit Card',
    'Visa', '1', 'Cleared', new Date()
  ]);

  sandbox.getCampaignRow = (id) => ['leg', 'Legacy', '', 'camp-legacy-sheet'];

  const res = sandbox.getTransactionsMaster_('leg', {});
  assert.strictEqual(res.status, 'success');
  assert.strictEqual(res.transactions.length, 1);
  const tx = res.transactions[0];
  assert.strictEqual(tx.amount, 100.00);
  assert.strictEqual(tx.fees, 3.00);
  assert.strictEqual(tx.fundCharge, 0); // 0 because column does not exist
  assert.strictEqual(tx.net, 97.00);    // Exact historical Net preserved!
  assert.strictEqual(res.summary.totalFundCharge, 0);
  assert.strictEqual(res.summary.totalNet, 97.00);
});

// SCENARIO 3: All Transaction Writers on New & Migrated Sheets
it('Scenario 3a: logTransactionMaster computes fundCharge and writes to mapped columns', () => {
  const ss = new MockSpreadsheet('camp-log-tx');
  sandbox.logTransactionMaster(ss, 'PL-101', 'CUST-101', 'Alice Supporter', 200.00, {
    xRefNum: 'GW-2026',
    xResult: 'A',
    xCardType: 'Visa',
    xMaskedCardNumber: 'xxxxxxxxxxxx1111'
  }, '1', 6.00); // 200 gross, 6 fee. 1% default fundCharge = 2.00. Net = 192.00

  const sheet = ss.getSheetByName('Transactions');
  const map = sandbox.getTransactionColMap_(sheet);
  assert.strictEqual(map.fundCharge, 4);
  assert.strictEqual(map.net, 5);

  const row = sheet.cells[1];
  assert.strictEqual(row[map.amount], 200.00);
  assert.strictEqual(row[map.fees], 6.00);
  assert.strictEqual(row[map.fundCharge], 2.00);
  assert.strictEqual(row[map.net], 192.00);
  assert.strictEqual(row[map.result], 'A');
  assert.strictEqual(row[map.funded], 'Pending');
});

it('Scenario 3b: recordPledgePayment computes fundCharge and writes to mapped columns', () => {
  const ss = getMockSS('camp-pledge-sheet');
  const pledges = ss.insertSheet('Pledges');
  pledges.appendRow([
    'Pledge ID', 'Customer ID', 'Created Date', 'Donor', 'Campaign',
    'Amount', 'Status', 'Amount Paid', 'Balance'
  ]);
  pledges.appendRow([
    'PL-200', 'CUST-200', new Date(), 'Bob Donor', 'ksy',
    500.00, 'Pledged', 0.00, 500.00
  ]);

  sandbox.getCampaignRow = (id) => ['ksy', 'KSY', '', 'camp-pledge-sheet'];

  const res = sandbox.recordPledgePayment({
    campaignId: 'ksy',
    pledgeId: 'PL-200',
    amount: 100.00,
    fee: 2.50,
    method: 'Credit Card'
  });

  assert.strictEqual(res.status, 'success');
  const txSheet = ss.getSheetByName('Transactions');
  const map = sandbox.getTransactionColMap_(txSheet);
  const row = txSheet.cells[1];
  assert.strictEqual(row[map.amount], 100.00);
  assert.strictEqual(row[map.fees], 2.50);
  assert.strictEqual(row[map.fundCharge], 1.00); // 1% of 100
  assert.strictEqual(row[map.net], 96.50); // 100 - 2.50 - 1.00 = 96.50
  assert.strictEqual(row[map.pledgeId], 'PL-200');

  // Pledge balance updated
  assert.strictEqual(pledges.cells[1][7], 100.00); // Amount paid
  assert.strictEqual(pledges.cells[1][8], 400.00); // Balance
});

it('Scenario 3c: updateScheduledPayment markPaid computes fundCharge and writes to mapped columns', () => {
  const ss = getMockSS('camp-sched-sheet');
  const spSheet = ss.insertSheet('Scheduled Payments');
  spSheet.appendRow([
    'DateSubmitted', 'Recurring ID', 'Pledge ID', 'Customer ID',
    'Donor Name', 'USD Amount', 'Total Pledge', 'Frequency',
    'Count', 'Sequence', 'DateDue', 'Status', 'Transaction Ref'
  ]);
  spSheet.appendRow([
    new Date(), 'REC-1', 'PL-300', 'CUST-300',
    'Charlie', 50.00, 100.00, 'Monthly',
    '2', '1 of 2', new Date(), 'Scheduled', ''
  ]);

  sandbox.getCampaignRow = (id) => ['sched', 'Sched', '', 'camp-sched-sheet'];
  sandbox.updatePledgePaid = () => {};

  const res = sandbox.updateScheduledPayment({
    campaignId: 'sched',
    scheduleId: 'REC-1',
    paymentNum: '1',
    action: 'markPaid',
    amount: 50.00,
    method: 'Credit Card'
  });

  assert.strictEqual(res.status, 'success');
  const txSheet = ss.getSheetByName('Transactions');
  const map = sandbox.getTransactionColMap_(txSheet);
  const row = txSheet.cells[1];
  assert.strictEqual(row[map.amount], 50.00);
  // Default fee for Credit Card: 0.03 * 50 + 0.30 = 1.80
  assert.strictEqual(row[map.fees], 1.80);
  assert.strictEqual(row[map.fundCharge], 0.50); // 1% of 50
  assert.strictEqual(row[map.net], 47.70); // 50 - 1.80 - 0.50 = 47.70
});

it('Scenario 3d: processBookkeeperPayment computes fundCharge and writes to mapped columns', () => {
  const ss = getMockSS('camp-bk-sheet');
  sandbox.getCampaignRow = (id) => ['bk', 'BK', '', 'camp-bk-sheet', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '5786'];
  sandbox.updatePledgePaid = () => {};

  const res = sandbox.processBookkeeperPayment({
    campaignId: 'bk',
    pledgeId: 'PL-400',
    amount: 150.00,
    fee: 3.00,
    method: 'Check',
    key: '5786'
  });

  assert.strictEqual(res.status, 'success');
  const txSheet = ss.getSheetByName('Transactions');
  const map = sandbox.getTransactionColMap_(txSheet);
  const row = txSheet.cells[1];
  assert.strictEqual(row[map.amount], 150.00);
  assert.strictEqual(row[map.fees], 3.00);
  assert.strictEqual(row[map.fundCharge], 1.50); // 1% of 150
  assert.strictEqual(row[map.net], 145.50); // 150 - 3.00 - 1.50 = 145.50
});

// SCENARIO 4: Funding Operations
it('Scenario 4: markTransactionFunded and bulkMarkFunded update exact mapped columns', () => {
  const ss = getMockSS('camp-fund-sheet');
  const txSheet = ss.insertSheet('Transactions');
  txSheet.appendRow([
    'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Fund Charge', 'Net',
    'Donor Name', 'Pledge ID', 'Customer ID', 'Result', 'Method',
    'Card Type', 'Payment #', 'Funded', 'Funded Date'
  ]);
  txSheet.appendRow([
    new Date(), 'TX-FUND-1', 100, 3, 1, 96, 'Donor A', '', '', 'A', 'CC', 'Visa', '1', 'Pending', ''
  ]);
  txSheet.appendRow([
    new Date(), 'TX-FUND-2', 200, 6, 2, 192, 'Donor B', '', '', 'A', 'CC', 'Visa', '1', 'Pending', ''
  ]);

  sandbox.getCampaignRow = (id) => ['fnd', 'Fund', '', 'camp-fund-sheet'];

  // Single mark funded
  const res1 = sandbox.markTransactionFunded({ campaignId: 'fnd', transactionRef: 'TX-FUND-1' });
  assert.strictEqual(res1.status, 'success');
  assert.strictEqual(txSheet.cells[1][13], 'Cleared');
  assert.notStrictEqual(txSheet.cells[1][14], '');

  // Bulk mark funded
  const res2 = sandbox.bulkMarkFunded({ campaignId: 'fnd', transactionRefs: ['TX-FUND-2'] });
  assert.strictEqual(res2.status, 'success');
  assert.strictEqual(txSheet.cells[2][13], 'Cleared');
  assert.notStrictEqual(txSheet.cells[2][14], '');
});

// SCENARIO 5: Deposit Batch Creation (Literal Net Sum across mixed batches)
it('Scenario 5: createDepositBatchMaster_ computes totalNet by literally summing stored Net', () => {
  const ss = getMockSS('camp-dep-sheet');
  const txSheet = ss.insertSheet('Transactions');
  txSheet.appendRow([
    'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Fund Charge', 'Net',
    'Donor Name', 'Pledge ID', 'Customer ID', 'Result', 'Method',
    'Card Type', 'Payment #', 'Funded', 'Funded Date', 'Deposit Batch ID'
  ]);
  // Legacy row: $100 gross, $3 fee, $0 fund charge, $97 net
  txSheet.appendRow([
    new Date(), 'DEP-TX-1', 100.00, 3.00, 0.00, 97.00,
    'Donor 1', '', '', 'A', 'CC', 'Visa', '1', '', '', ''
  ]);
  // New row: $100 gross, $3 fee, $1 fund charge, $96 net
  txSheet.appendRow([
    new Date(), 'DEP-TX-2', 100.00, 3.00, 1.00, 96.00,
    'Donor 2', '', '', 'A', 'CC', 'Visa', '1', '', '', ''
  ]);

  sandbox.ensureDepositsSheet_ = (s) => {
    let d = s.getSheetByName('Deposits');
    if (!d) {
      d = s.insertSheet('Deposits');
      d.appendRow(['Batch ID', 'Date Created', 'Deposit Date', 'Transaction Count', 'Gross Amount', 'Total Fees', 'Net Transferred', 'Target Account', 'Transfer Ref', 'Memo', 'Created By', 'Status']);
    }
    return d;
  };
  sandbox.getCampaignRow = (id) => ['dep', 'Dep', '', 'camp-dep-sheet'];

  const res = sandbox.createDepositBatchMaster_('dep', {
    transactionRefs: ['DEP-TX-1', 'DEP-TX-2'],
    targetAccount: 'Operating',
    transferRef: 'TR-999'
  }, 'admin@notzer.org');

  assert.strictEqual(res.status, 'success');
  assert.strictEqual(res.transactionCount, 2);
  assert.strictEqual(res.gross, 200.00);
  assert.strictEqual(res.fees, 6.00);
  // Literal sum: 97.00 + 96.00 = 193.00!
  assert.strictEqual(res.net, 193.00);

  const depSheet = ss.getSheetByName('Deposits');
  const depRow = depSheet.cells[1]; // Second row (row index 1 after header)
  assert.strictEqual(depRow[4], 200.00); // Gross
  assert.strictEqual(depRow[5], 6.00);   // Fees
  assert.strictEqual(depRow[6], 193.00); // Net Transferred literally 193.00
});

// SCENARIO 6: Deposit Batch Reversal
it('Scenario 6: reverseDepositBatchMaster_ unlinks transactions and marks batch Reversed', () => {
  const ss = getMockSS('camp-dep-sheet');
  const txSheet = ss.getSheetByName('Transactions');
  const depSheet = ss.getSheetByName('Deposits');
  const batchId = depSheet.cells[1][0];

  const res = sandbox.reverseDepositBatchMaster_('dep', { batchId: batchId });
  assert.strictEqual(res.status, 'success');
  assert.strictEqual(res.reversedCount, 2);

  // Cleared status and batch ID removed
  const map = sandbox.getTransactionColMap_(txSheet);
  assert.strictEqual(txSheet.cells[1][map.funded], '');
  assert.strictEqual(txSheet.cells[1][map.depositBatchId], '');
  assert.strictEqual(txSheet.cells[2][map.funded], '');
  assert.strictEqual(txSheet.cells[2][map.depositBatchId], '');

  // Status on Deposits tab set to Reversed
  assert.strictEqual(depSheet.cells[1][11], 'Reversed');
});

// SCENARIO 7: Reconciliation Data
it('Scenario 7: getReconciliationDataMaster_ reads Net from colMap.net without shifting', () => {
  const ss = getMockSS('camp-recon-sheet');
  const txSheet = ss.insertSheet('Transactions');
  txSheet.appendRow([
    'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Fund Charge', 'Net',
    'Donor Name', 'Pledge ID', 'Customer ID', 'Result', 'Method',
    'Card Type', 'Payment #', 'Funded', 'Funded Date'
  ]);
  txSheet.appendRow([
    new Date(), 'REC-TX-1', 100, 3, 1, 96, 'Donor A', '', '', 'A', 'CC', 'Visa', '1', 'Cleared', new Date()
  ]);
  txSheet.appendRow([
    new Date(), 'REC-TX-2', 50, 1.5, 0.5, 48, 'Donor B', '', '', 'A', 'CC', 'Visa', '1', 'Pending', ''
  ]);

  sandbox.ensureDepositsSheet_ = (s) => s.insertSheet('Deposits');
  sandbox.ensureExpandedExpensesSheet_ = (s) => s.insertSheet('Expenses');
  sandbox.getCampaignRow = (id) => ['recon', 'Recon', '', 'camp-recon-sheet'];

  const res = sandbox.getReconciliationDataMaster_('recon');
  assert.strictEqual(res.status, 'success');
  // Funded net: 96, Pending net: 48, Total net: 144
  assert.strictEqual(res.transactionSummary.funded.amount, 96.00);
  assert.strictEqual(res.transactionSummary.pending.amount, 48.00);
  assert.strictEqual(res.transactionSummary.total.amount, 144.00);
});

// SCENARIO 8: Receipt Lookup across shifted columns
it('Scenario 8: resendReceipt matches pledgeId and finds reference across shifted columns', () => {
  const ss = getMockSS('camp-resend-sheet');
  const pledges = ss.insertSheet('Pledges');
  pledges.appendRow([
    'Pledge ID', 'Customer ID', 'Created Date', 'Donor', 'Campaign',
    'Amount', 'Status', 'Amount Paid', 'Balance'
  ]);
  pledges.appendRow([
    'PL-RR-1', 'CUST-RR-1', new Date(), 'Donor RR', 'ksy',
    100.00, 'Processed', 100.00, 0.00
  ]);

  const txSheet = ss.insertSheet('Transactions');
  txSheet.appendRow([
    'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Fund Charge', 'Net',
    'Donor Name', 'Pledge ID', 'Customer ID', 'Result', 'Method',
    'Card Type', 'Payment #', 'Funded', 'Funded Date'
  ]);
  txSheet.appendRow([
    new Date(), 'TXN-REF-RR-999', 100, 3, 1, 96, 'Donor RR', 'PL-RR-1', 'CUST-RR-1', 'A', 'CC', 'Visa', '1', 'Cleared', new Date()
  ]);

  sandbox.getCampaignSheetId = () => 'camp-resend-sheet';
  sandbox.getNextReceiptId = () => 'NC-R-12345';

  let sentEmail = null;
  sandbox.MailApp = {
    sendEmail: (opts) => { sentEmail = opts; }
  };

  const res = sandbox.resendReceipt({
    campaignId: 'ksy',
    pledgeId: 'PL-RR-1',
    targetEmail: 'donor@example.com'
  }, { email: 'admin@notzer.org' });

  assert.strictEqual(res.status, 'success');
  assert.ok(res.message.includes('TXN-REF-RR-999') || res.message.includes('sent'));
});

// SCENARIO 9: Idempotent Provisioning
it('Scenario 9: provisionCampaignSheet on existing sheets preserves headers non-destructively', () => {
  const ss = getMockSS('camp-prov-sheet');
  // Campaign registry row in Master SS
  const masterSS = getMockSS('mock-master-sheet-id');
  const campSheet = masterSS.insertSheet('Campaigns');
  campSheet.appendRow(['Campaign ID', 'Name', '', 'Sheet ID']);
  campSheet.appendRow(['prov-camp', 'Provisioned Campaign', '', 'camp-prov-sheet']);

  // Pre-existing Transactions sheet with legacy 14 cols + 1 data row
  const txSheet = ss.insertSheet('Transactions');
  txSheet.appendRow([
    'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Net',
    'Donor Name', 'Pledge ID', 'Customer ID', 'Result', 'Method',
    'Card Type', 'Payment #', 'Funded', 'Funded Date'
  ]);
  txSheet.appendRow([new Date(), 'KEEP-ME-1', 100, 3, 97, 'Donor Keep', '', '', 'A', 'CC', 'Visa', '1', '', '']);

  // Pre-existing LinkClicks without Click ID
  const clicks = ss.insertSheet('LinkClicks');
  clicks.appendRow(['Timestamp', 'First Name', 'Last Name', 'Email', 'Link Clicked', 'Campaign', 'Amount']);
  clicks.appendRow([new Date(), 'Clicker', 'One', 'c1@example.com', 'Zelle', 'prov-camp', 50]);

  // Pre-existing Fee_Config with 3 cols
  const fees = ss.insertSheet('Fee_Config');
  fees.appendRow(['Method', 'Rate', 'Flat Fee']);
  fees.appendRow(['Credit Card', 0.03, 0.30]);

  // Run provisionCampaignSheet
  const res = sandbox.provisionCampaignSheet('prov-camp');
  assert.strictEqual(res.status, 'success');

  // Verify Transactions: Fund Charge inserted before Net; data intact
  const txHeaders = txSheet.cells[0];
  assert.strictEqual(txHeaders[4], 'Fund Charge');
  assert.strictEqual(txHeaders[5], 'Net');
  assert.strictEqual(txSheet.cells[1][1], 'KEEP-ME-1');
  assert.strictEqual(txSheet.cells[1][5], 97); // Net preserved at new index 5!

  // Verify LinkClicks: Click ID inserted at Col A; data intact
  const clickHeaders = clicks.cells[0];
  assert.strictEqual(clickHeaders[0], 'Click ID');
  assert.strictEqual(clicks.cells[1][1] instanceof Date, true);
  assert.strictEqual(clicks.cells[1][2], 'Clicker');

  // Verify Fee_Config: Fund_Charge inserted at Col D; data intact
  const feeHeaders = fees.cells[0];
  assert.strictEqual(feeHeaders[3], 'Fund_Charge');
  assert.strictEqual(fees.cells[1][0], 'Credit Card');

  // Rerun provisionCampaignSheet (idempotency check)
  const res2 = sandbox.provisionCampaignSheet('prov-camp');
  assert.strictEqual(res2.status, 'success');
  // Column counts unchanged, no duplicate columns!
  assert.strictEqual(txSheet.cells[0].length, 15);
  assert.strictEqual(clicks.cells[0].length, 8);
  assert.strictEqual(fees.cells[0].length, 4);
});

// SCENARIO 10: Explicit 0% Rate Invariant & DAF Card Type Resolution
it('Scenario 10: calculateFundCharge preserves explicit 0.00% rate and maps DAF card types', () => {
  const ss = new MockSpreadsheet('camp-zero-fee');
  const feeSheet = ss.insertSheet('Fee_Config');
  feeSheet.appendRow(['Method', 'Rate', 'Flat Fee', 'Fund_Charge']);
  feeSheet.appendRow(['Credit Card', 0.03, 0.30, 0.01]);             // 1.00%
  feeSheet.appendRow(['Matbia', 0.025, 0.00, 0.01]);                 // Generic Matbia: 2.50% fee / 1.00% fund charge
  feeSheet.appendRow(['DAF - The Donors Fund', 0.00, 0.00, 0.00]);    // Explicit 0.00%
  feeSheet.appendRow(['DAF - OJCF', 0.00, 0.00, 0.005]);             // 0.50%
  feeSheet.appendRow(['DAF - Pledger', 0.00, 0.00, 0.02]);           // 2.00%
  feeSheet.appendRow(['DAF - Matbia', 0.00, 0.00, 0.015]);           // DAF - Matbia: 0.00% fee / 1.50% fund charge

  // 1. Direct method name with explicit 0.00%
  const chargeDirect = sandbox.calculateFundCharge('DAF - The Donors Fund', 1000.00, ss);
  assert.strictEqual(chargeDirect, 0.00);

  // 2. Cardknox xCardType: 'DonorsFund' -> maps to 'DAF - The Donors Fund' (0.00% rate, NOT 1.00% CC default)
  const chargeDonorsFund = sandbox.calculateFundCharge('DonorsFund', 1000.00, ss);
  assert.strictEqual(chargeDonorsFund, 0.00);

  // 3. Cardknox xCardType: 'The Donors Fund' -> 0.00%
  const chargeTDF = sandbox.calculateFundCharge('The Donors Fund', 1000.00, ss);
  assert.strictEqual(chargeTDF, 0.00);

  // 4. Cardknox xCardType: 'OJC' -> maps to 'DAF - OJCF' (0.50%)
  const chargeOjc = sandbox.calculateFundCharge('OJC', 1000.00, ss);
  assert.strictEqual(chargeOjc, 5.00);

  // 5. Cardknox xCardType: 'Pledger' -> maps to 'DAF - Pledger' (2.00%)
  const chargePledger = sandbox.calculateFundCharge('Pledger', 1000.00, ss);
  assert.strictEqual(chargePledger, 20.00);

  // 6. Cardknox xCardType: 'Matbia' -> maps to 'DAF - Matbia' (1.50%) when both 'Matbia' and 'DAF - Matbia' exist
  const chargeMatbia = sandbox.calculateFundCharge('Matbia', 1000.00, ss);
  assert.strictEqual(chargeMatbia, 15.00);

  // 7. Standard Credit Card
  const chargeNormal = sandbox.calculateFundCharge('Credit Card', 1000.00, ss);
  assert.strictEqual(chargeNormal, 10.00);

  // 8. calculateFee with DAF card type 'DonorsFund' -> resolves to 'DAF - The Donors Fund' ($0 fee)
  const feeDonors = sandbox.calculateFee('DonorsFund', 1000.00, ss);
  assert.strictEqual(feeDonors, 0.00);

  // 8b. calculateFee with 'Matbia' -> resolves to 'DAF - Matbia' ($0 fee) rather than 'Matbia' (2.5% = $25 fee)
  const feeMatbia = sandbox.calculateFee('Matbia', 1000.00, ss);
  assert.strictEqual(feeMatbia, 0.00);

  // 8c. Fallback test: when 'DAF - Matbia' is absent, 'Matbia' falls back to the 'Matbia' row
  const ssFallback = new MockSpreadsheet('camp-matbia-fallback');
  const feeFallback = ssFallback.insertSheet('Fee_Config');
  feeFallback.appendRow(['Method', 'Rate', 'Flat Fee', 'Fund_Charge']);
  feeFallback.appendRow(['Matbia', 0.025, 0.00, 0.01]);
  assert.strictEqual(sandbox.calculateFee('Matbia', 1000.00, ssFallback), 25.00);
  assert.strictEqual(sandbox.calculateFundCharge('Matbia', 1000.00, ssFallback), 10.00);

  // 9. Full logTransactionMaster path with xCardType='DonorsFund' and configured 0% rate
  const txSheet = ss.insertSheet('Transactions');
  txSheet.appendRow(['Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Fund Charge', 'Net',
    'Donor Name', 'Pledge ID', 'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date']);

  sandbox.logTransactionMaster(ss, 'PL-DF-1', 'CUST-DF-1', 'DAF Donor', 500, {
    xResult: 'A',
    xRefNum: 'REF-DF-99',
    xCardType: 'DonorsFund'
  }, '1');

  // Verify stored row: Gross=$500, Fee=$0, FundCharge=$0, Net=$500
  const txRow = txSheet.cells[1];
  assert.strictEqual(txRow[2], 500); // Amount
  assert.strictEqual(txRow[3], 0);   // Fee
  assert.strictEqual(txRow[4], 0);   // Fund Charge = $0.00 (configured DAF rate honored!)
  assert.strictEqual(txRow[5], 500); // Net = $500.00
});

// SCENARIO 11: LinkClicks PK Persistence
it('Scenario 11: logLinkClickMaster_ persists Click ID in Col A and returns it', () => {
  const ss = getMockSS('camp-click-sheet');
  sandbox.getCampaignSheetId = () => 'camp-click-sheet';

  const res = sandbox.logLinkClickMaster_({
    campaignId: 'ksy',
    clickId: 'LC-KSY-ZL-20260917-1234',
    firstName: 'David',
    lastName: 'Cohen',
    email: 'david@example.com',
    linkClicked: 'Zelle',
    amount: 180.00
  });

  assert.strictEqual(res.status, 'success');
  assert.strictEqual(res.clickId, 'LC-KSY-ZL-20260917-1234');

  const sheet = ss.getSheetByName('LinkClicks');
  assert.strictEqual(sheet.cells[0][0], 'Click ID');
  const row = sheet.cells[1];
  assert.strictEqual(row[0], 'LC-KSY-ZL-20260917-1234');
  assert.strictEqual(row[2], 'David');
  assert.strictEqual(row[4], 'david@example.com');
  assert.strictEqual(row[5], 'Zelle');
  assert.strictEqual(row[7], 180.00);
});

console.log('-------------------------------------------------------------');
console.log(`RESULTS: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL 11 TEST SCENARIOS PASSED WITH ZERO FAILURES!');
}
