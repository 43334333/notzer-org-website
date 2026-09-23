const fs = require('fs');
const vm = require('vm');

const filePath = 'apps-script-backend/Code.gs';
let code = fs.readFileSync(filePath, 'utf8');

// Ensure CRLF normalization for matching
function normalize(str) {
  return str.replace(/\r\n/g, '\n');
}

function replaceBlock(label, searchStr, replaceStr) {
  const normCode = normalize(code);
  const normSearch = normalize(searchStr);
  const normReplace = normalize(replaceStr);

  const count = normCode.split(normSearch).length - 1;
  if (count === 0) {
    throw new Error(`Target not found for: ${label}`);
  }
  if (count > 1) {
    throw new Error(`Target found ${count} times (expected 1) for: ${label}`);
  }

  const newNormCode = normCode.replace(normSearch, normReplace);
  code = newNormCode.replace(/\n/g, '\r\n');
  console.log(`✅ Patched: ${label}`);
}

// 1. Column Mapping and Schema Helpers before getTransactionsMaster_
const s1 = `// ============================================================
// TRANSACTIONS — READ FROM TAB 2 TRANSACTIONS
// ============================================================`;

const r1 = `// ============================================================
// TRANSACTION COLUMN MAPPING & SCHEMA HELPERS
// ============================================================
/**
 * Resolves column positions dynamically from header row.
 * Throws fail-closed on duplicate headers or missing required headers.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Sheet to inspect
 * @param {Array<string>} [requiredFields] - List of canonical field keys that must exist
 * @returns {Object} Mapping of canonical keys to 0-based column indices
 */
function getTransactionColMap_(sheet, requiredFields) {
  if (!sheet) throw new Error('getTransactionColMap_: sheet is required');
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) throw new Error('getTransactionColMap_: sheet has no columns');
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  // Strict duplicate detection
  var seen = {};
  for (var c = 0; c < headers.length; c++) {
    var rawH = String(headers[c] || '').trim();
    if (rawH) {
      var normH = rawH.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seen[normH] !== undefined) {
        throw new Error('getTransactionColMap_: Duplicate header detected: "' + rawH + '" at cols ' + (seen[normH] + 1) + ' and ' + (c + 1));
      }
      seen[normH] = c;
    }
  }

  var map = {
    timestamp: -1,
    reference: -1,
    amount: -1,
    fees: -1,
    fundCharge: -1,
    net: -1,
    donorName: -1,
    pledgeId: -1,
    customerId: -1,
    result: -1,
    method: -1,
    cardType: -1,
    paymentNum: -1,
    funded: -1,
    fundedDate: -1,
    depositBatchId: -1,
    headers: headers,
    lastCol: lastCol
  };

  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!h) continue;
    if (h === 'timestamp' || h === 'date') map.timestamp = i;
    else if (h === 'reference' || h === 'ref' || h === 'refnum' || h === 'transactionid') map.reference = i;
    else if (h === 'amountcharged' || h === 'amount' || h === 'gross' || h === 'grossamount') map.amount = i;
    else if (h === 'fees' || h === 'fee') map.fees = i;
    else if (h === 'fundcharge' || h === 'fundfee' || h === 'nccharge' || h === 'ncfee') map.fundCharge = i;
    else if (h === 'net' || h === 'nettotal' || h === 'netamount') map.net = i;
    else if (h === 'donorname' || h === 'donor' || h === 'name') map.donorName = i;
    else if (h === 'pledgeid' || h === 'pledge') map.pledgeId = i;
    else if (h === 'customerid' || h === 'customer') map.customerId = i;
    else if (h === 'result' || h === 'status') map.result = i;
    else if (h === 'method' || h === 'paymentmethod') map.method = i;
    else if (h === 'cardtype' || h === 'brand' || h === 'type') map.cardType = i;
    else if (h === 'paymentnum' || h === 'payment' || h === 'installment') map.paymentNum = i;
    else if (h === 'funded' || h === 'iscleared') map.funded = i;
    else if (h === 'fundeddate' || h === 'cleareddate') map.fundedDate = i;
    else if (h === 'depositbatchid' || h === 'depositbatch' || h === 'batchid') map.depositBatchId = i;
  }

  var reqs = requiredFields !== undefined ? requiredFields : ['timestamp', 'reference', 'amount', 'fees', 'net'];
  for (var r = 0; r < reqs.length; r++) {
    var field = reqs[r];
    if (map[field] === undefined || map[field] === -1) {
      throw new Error('getTransactionColMap_: Required header "' + field + '" missing from sheet "' + sheet.getName() + '"');
    }
  }

  return map;
}

/**
 * Ensures column 'Fund Charge' exists before Net in Transactions sheet.
 * Non-destructive and idempotent.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {Object} Updated column map
 */
function ensureTransactionFundChargeCol_(sheet) {
  if (!sheet) return null;
  var colMap = getTransactionColMap_(sheet, []);
  if (colMap.fundCharge === -1) {
    if (colMap.net !== -1) {
      sheet.insertColumnBefore(colMap.net + 1);
      sheet.getRange(1, colMap.net + 1).setValue('Fund Charge');
      sheet.getRange(1, colMap.net + 1).setFontWeight('bold');
      sheet.setColumnWidth(colMap.net + 1, 100);
      if (sheet.getLastRow() >= 2) {
        sheet.getRange(2, colMap.net + 1, sheet.getLastRow() - 1, 1).setNumberFormat('$#,##0.00');
      }
    } else {
      var newCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, newCol).setValue('Fund Charge');
      sheet.getRange(1, newCol).setFontWeight('bold');
      sheet.setColumnWidth(newCol, 100);
      if (sheet.getLastRow() >= 2) {
        sheet.getRange(2, newCol, sheet.getLastRow() - 1, 1).setNumberFormat('$#,##0.00');
      }
    }
    colMap = getTransactionColMap_(sheet, []);
  }
  return colMap;
}

/**
 * Builds a row array matching sheet columns from a dictionary of field values.
 *
 * @param {Object} colMap - Column mapping from getTransactionColMap_
 * @param {Object} fields - Field values
 * @returns {Array} Array sized to max column index
 */
function buildTransactionRowArray_(colMap, fields) {
  var maxCol = Math.max(colMap.lastCol, 15);
  var row = new Array(maxCol);
  for (var i = 0; i < maxCol; i++) row[i] = '';

  if (colMap.timestamp !== -1 && fields.timestamp !== undefined) row[colMap.timestamp] = fields.timestamp;
  if (colMap.reference !== -1 && fields.reference !== undefined) row[colMap.reference] = fields.reference;
  if (colMap.amount !== -1 && fields.amount !== undefined) row[colMap.amount] = fields.amount;
  if (colMap.fees !== -1 && fields.fees !== undefined) row[colMap.fees] = fields.fees;
  if (colMap.fundCharge !== -1 && fields.fundCharge !== undefined) row[colMap.fundCharge] = fields.fundCharge;
  if (colMap.net !== -1 && fields.net !== undefined) row[colMap.net] = fields.net;
  if (colMap.donorName !== -1 && fields.donorName !== undefined) row[colMap.donorName] = fields.donorName;
  if (colMap.pledgeId !== -1 && fields.pledgeId !== undefined) row[colMap.pledgeId] = fields.pledgeId;
  if (colMap.customerId !== -1 && fields.customerId !== undefined) row[colMap.customerId] = fields.customerId;
  if (colMap.result !== -1 && fields.result !== undefined) row[colMap.result] = fields.result;
  if (colMap.method !== -1 && fields.method !== undefined) row[colMap.method] = fields.method;
  if (colMap.cardType !== -1 && fields.cardType !== undefined) row[colMap.cardType] = fields.cardType;
  if (colMap.paymentNum !== -1 && fields.paymentNum !== undefined) row[colMap.paymentNum] = fields.paymentNum;
  if (colMap.funded !== -1 && fields.funded !== undefined) row[colMap.funded] = fields.funded;
  if (colMap.fundedDate !== -1 && fields.fundedDate !== undefined) row[colMap.fundedDate] = fields.fundedDate;
  if (colMap.depositBatchId !== -1 && fields.depositBatchId !== undefined) row[colMap.depositBatchId] = fields.depositBatchId;

  return row;
}

// ============================================================
// TRANSACTIONS — READ FROM TAB 2 TRANSACTIONS
// ============================================================`;

replaceBlock('1. Column mapping helpers', s1, r1);

// 2. getTransactionsMaster_
const s2 = `    var lastRow = sheet.getLastRow();
    var lastCol = Math.max(15, sheet.getLastColumn());
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    var page = parseInt(filters.page) || 1;
    var pageSize = parseInt(filters.pageSize) || 50;
    var searchFilter = (filters.search || '').trim().toLowerCase();
    var resultFilter = (filters.result || '').trim().toLowerCase();
    var methodFilter = (filters.method || '').trim().toLowerCase();
    var fundedFilter = (filters.funded || '').trim().toLowerCase();
    var dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    var dateTo = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59') : null;

    var filtered = [];
    var sumCharged = 0;
    var sumFees = 0;
    var sumNet = 0;

    // Scan newest first (from bottom row up to row 2)
    for (var i = data.length - 1; i >= 0; i--) {
      var row = data[i];
      var rawTimestamp = row[0];
      var refNum = String(row[1] || '').trim();
      var amountCharged = parseFloat(row[2]) || 0;
      var fees = parseFloat(row[3]) || 0;
      var net = parseFloat(row[4]) || 0;
      var donorName = String(row[5] || '').trim();
      var pledgeId = String(row[6] || '').trim();
      var customerId = String(row[7] || '').trim();
      var result = String(row[8] || '').trim();
      var method = String(row[9] || '').trim();
      var cardType = String(row[10] || '').trim();
      var paymentNum = String(row[11] || '').trim();
      var funded = String(row[12] || '').trim();
      var fundedDate = row[13] ? formatDateEdt_(row[13]) : '';
      var depositBatchId = String(row[14] || '').trim();`;

const r2 = `    var colMap = getTransactionColMap_(sheet, ['timestamp', 'reference', 'amount', 'fees', 'net']);
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    var page = parseInt(filters.page) || 1;
    var pageSize = parseInt(filters.pageSize) || 50;
    var searchFilter = (filters.search || '').trim().toLowerCase();
    var resultFilter = (filters.result || '').trim().toLowerCase();
    var methodFilter = (filters.method || '').trim().toLowerCase();
    var fundedFilter = (filters.funded || '').trim().toLowerCase();
    var dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
    var dateTo = filters.dateTo ? new Date(filters.dateTo + 'T23:59:59') : null;

    var filtered = [];
    var sumCharged = 0;
    var sumFees = 0;
    var sumFundCharge = 0;
    var sumNet = 0;

    // Scan newest first (from bottom row up to row 2)
    for (var i = data.length - 1; i >= 0; i--) {
      var row = data[i];
      var rawTimestamp = colMap.timestamp !== -1 ? row[colMap.timestamp] : row[0];
      var refNum = colMap.reference !== -1 ? String(row[colMap.reference] || '').trim() : '';
      var amountCharged = colMap.amount !== -1 ? (parseFloat(row[colMap.amount]) || 0) : 0;
      var fees = colMap.fees !== -1 ? (parseFloat(row[colMap.fees]) || 0) : 0;
      var fundCharge = colMap.fundCharge !== -1 ? (parseFloat(row[colMap.fundCharge]) || 0) : 0;
      var net = colMap.net !== -1 ? (parseFloat(row[colMap.net]) || 0) : 0;
      var donorName = colMap.donorName !== -1 ? String(row[colMap.donorName] || '').trim() : '';
      var pledgeId = colMap.pledgeId !== -1 ? String(row[colMap.pledgeId] || '').trim() : '';
      var customerId = colMap.customerId !== -1 ? String(row[colMap.customerId] || '').trim() : '';
      var result = colMap.result !== -1 ? String(row[colMap.result] || '').trim() : '';
      var method = colMap.method !== -1 ? String(row[colMap.method] || '').trim() : '';
      var cardType = colMap.cardType !== -1 ? String(row[colMap.cardType] || '').trim() : '';
      var paymentNum = colMap.paymentNum !== -1 ? String(row[colMap.paymentNum] || '').trim() : '';
      var funded = colMap.funded !== -1 ? String(row[colMap.funded] || '').trim() : '';
      var fundedDate = (colMap.fundedDate !== -1 && row[colMap.fundedDate]) ? formatDateEdt_(row[colMap.fundedDate]) : '';
      var depositBatchId = colMap.depositBatchId !== -1 ? String(row[colMap.depositBatchId] || '').trim() : '';`;

replaceBlock('2a. getTransactionsMaster_ data loop', s2, r2);

const s2b = `      sumCharged += amountCharged;
      sumFees += fees;
      sumNet += net;

      filtered.push({
        id: refNum || ('TXN-' + (i + 2)),
        timestamp: formatDateEdt_(txDate),
        date: txDate ? Utilities.formatDate(txDate, Session.getScriptTimeZone() || 'America/New_York', 'yyyy-MM-dd HH:mm') : '',
        reference: refNum,
        amount: amountCharged,
        fees: fees,
        net: net,
        donorName: donorName,
        pledgeId: pledgeId,
        customerId: customerId,
        result: result,
        method: method,
        cardType: cardType,
        paymentNum: paymentNum,
        funded: funded,
        fundedDate: fundedDate,
        depositBatchId: depositBatchId
      });`;

const r2b = `      sumCharged += amountCharged;
      sumFees += fees;
      sumFundCharge += fundCharge;
      sumNet += net;

      filtered.push({
        id: refNum || ('TXN-' + (i + 2)),
        timestamp: formatDateEdt_(txDate),
        date: txDate ? Utilities.formatDate(txDate, Session.getScriptTimeZone() || 'America/New_York', 'yyyy-MM-dd HH:mm') : '',
        reference: refNum,
        amount: amountCharged,
        fees: fees,
        fundCharge: fundCharge,
        net: net,
        donorName: donorName,
        pledgeId: pledgeId,
        customerId: customerId,
        result: result,
        method: method,
        cardType: cardType,
        paymentNum: paymentNum,
        funded: funded,
        fundedDate: fundedDate,
        depositBatchId: depositBatchId
      });`;

replaceBlock('2b. getTransactionsMaster_ row push', s2b, r2b);

const s2c = `      summary: {
        count: total,
        totalCharged: Math.round(sumCharged * 100) / 100,
        totalFees: Math.round(sumFees * 100) / 100,
        totalNet: Math.round(sumNet * 100) / 100
      }`;

const r2c = `      summary: {
        count: total,
        totalCharged: Math.round(sumCharged * 100) / 100,
        totalFees: Math.round(sumFees * 100) / 100,
        totalFundCharge: Math.round(sumFundCharge * 100) / 100,
        totalNet: Math.round(sumNet * 100) / 100
      }`;

replaceBlock('2c. getTransactionsMaster_ summary', s2c, r2c);

// 3. recordPledgePayment
const s3 = `    var txSheet = ss.getSheetByName('Transactions');
    if (!txSheet) {
      txSheet = ss.insertSheet('Transactions');
      txSheet.appendRow([
        'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Net', 'Donor Name', 'Pledge ID',
        'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date'
      ]);
      txSheet.getRange('1:1').setFontWeight('bold');
    }

    // Determine payment number
    var paymentNum = data.paymentNum || '';
    if (!paymentNum) {
      // Count existing transactions for this pledge
      var txLastRow = txSheet.getLastRow();
      if (txLastRow >= 2) {
        var txPledgeIds = txSheet.getRange(2, 7, txLastRow - 1, 1).getValues().flat();
        var existingCount = 0;
        for (var t = 0; t < txPledgeIds.length; t++) {
          if (String(txPledgeIds[t] || '').trim() === data.pledgeId) existingCount++;
        }
        paymentNum = String(existingCount + 1);
      } else {
        paymentNum = '1';
      }
    }

    var rpFee = parseFloat(data.fee) || 0;
    var rpNet = paymentAmount - rpFee;
    txSheet.appendRow([
      paymentDate,        // A: Timestamp
      refNum,             // B: Reference
      paymentAmount,      // C: Amount Charged
      rpFee,              // D: Fees
      rpNet,              // E: Net
      donor,              // F: Donor Name
      data.pledgeId,      // G: Pledge ID
      customerId,         // H: Customer ID
      'Manual',           // I: Result
      method,             // J: Method
      '',                 // K: Card Type
      paymentNum,         // L: Payment #
      'Pending',          // M: Funded
      ''                  // N: Funded Date
    ]);`;

const r3 = `    var txSheet = ss.getSheetByName('Transactions');
    if (!txSheet) {
      txSheet = ss.insertSheet('Transactions');
      txSheet.appendRow([
        'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Fund Charge', 'Net', 'Donor Name', 'Pledge ID',
        'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date'
      ]);
      txSheet.getRange('1:1').setFontWeight('bold');
    } else {
      ensureTransactionFundChargeCol_(txSheet);
    }

    var colMap = getTransactionColMap_(txSheet);

    // Determine payment number
    var paymentNum = data.paymentNum || '';
    if (!paymentNum) {
      // Count existing transactions for this pledge
      var txLastRow = txSheet.getLastRow();
      if (txLastRow >= 2 && colMap.pledgeId !== -1) {
        var txPledgeIds = txSheet.getRange(2, colMap.pledgeId + 1, txLastRow - 1, 1).getValues().flat();
        var existingCount = 0;
        for (var t = 0; t < txPledgeIds.length; t++) {
          if (String(txPledgeIds[t] || '').trim() === data.pledgeId) existingCount++;
        }
        paymentNum = String(existingCount + 1);
      } else {
        paymentNum = '1';
      }
    }

    var rpFee = parseFloat(data.fee) || 0;
    var rpFundCharge = calculateFundCharge(method, paymentAmount, ss);
    var rpNet = paymentAmount - rpFee - rpFundCharge;

    var rowArray = buildTransactionRowArray_(colMap, {
      timestamp: paymentDate,
      reference: refNum,
      amount: paymentAmount,
      fees: rpFee,
      fundCharge: rpFundCharge,
      net: rpNet,
      donorName: donor,
      pledgeId: data.pledgeId,
      customerId: customerId,
      result: 'Manual',
      method: method,
      cardType: '',
      paymentNum: paymentNum,
      funded: 'Pending',
      fundedDate: ''
    });

    txSheet.appendRow(rowArray);`;

replaceBlock('3. recordPledgePayment', s3, r3);

// 4. updateScheduledPayment
const s4 = `          // Create Transaction
          var refNum = 'MANUAL-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 1000);

          var txSheet = ss.getSheetByName('Transactions');
          if (!txSheet) {
            txSheet = ss.insertSheet('Transactions');
            txSheet.appendRow([
              'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Net', 'Donor Name', 'Pledge ID',
              'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date'
            ]);
            txSheet.getRange('1:1').setFontWeight('bold');
          }

          var mpFee = calculateFee(data.method || 'Other', perPaymentAmt, ss);
          var mpNet = perPaymentAmt - mpFee;
          txSheet.appendRow([
            new Date(),          // A: Timestamp
            refNum,              // B: Reference
            perPaymentAmt,       // C: Amount Charged
            mpFee,               // D: Fees
            mpNet,               // E: Net
            donor,               // F: Donor Name
            pledgeId,            // G: Pledge ID
            customerId,          // H: Customer ID
            'Manual',            // I: Result
            data.method || 'Manual', // J: Method
            '',                  // K: Card Type
            spPayNum,            // L: Payment #
            'Pending',           // M: Funded
            ''                   // N: Funded Date
          ]);`;

const r4 = `          // Create Transaction
          var refNum = 'MANUAL-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 1000);

          var txSheet = ss.getSheetByName('Transactions');
          if (!txSheet) {
            txSheet = ss.insertSheet('Transactions');
            txSheet.appendRow([
              'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Fund Charge', 'Net', 'Donor Name', 'Pledge ID',
              'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date'
            ]);
            txSheet.getRange('1:1').setFontWeight('bold');
          } else {
            ensureTransactionFundChargeCol_(txSheet);
          }

          var colMap = getTransactionColMap_(txSheet);

          var mpFee = calculateFee(data.method || 'Other', perPaymentAmt, ss);
          var mpFundCharge = calculateFundCharge(data.method || 'Other', perPaymentAmt, ss);
          var mpNet = perPaymentAmt - mpFee - mpFundCharge;

          var rowArray = buildTransactionRowArray_(colMap, {
            timestamp: new Date(),
            reference: refNum,
            amount: perPaymentAmt,
            fees: mpFee,
            fundCharge: mpFundCharge,
            net: mpNet,
            donorName: donor,
            pledgeId: pledgeId,
            customerId: customerId,
            result: 'Manual',
            method: data.method || 'Manual',
            cardType: '',
            paymentNum: spPayNum,
            funded: 'Pending',
            fundedDate: ''
          });

          txSheet.appendRow(rowArray);`;

replaceBlock('4. updateScheduledPayment', s4, r4);

// 5. markTransactionFunded
const s5 = `    var lastRow = txSheet.getLastRow();
    var refs = txSheet.getRange(2, 2, lastRow - 1, 1).getValues(); // col B: Reference

    for (var i = 0; i < refs.length; i++) {
      if (String(refs[i][0] || '').trim() === data.transactionRef) {
        var txRow = i + 2;
        var fundedDate = new Date();
        txSheet.getRange(txRow, 13).setValue('Cleared');   // M: Funded
        txSheet.getRange(txRow, 14).setValue(fundedDate);  // N: Funded Date
        return {
          status: 'success',
          transactionRef: data.transactionRef,
          fundedDate: formatDateEdt_(fundedDate)
        };
      }
    }`;

const r5 = `    var colMap = getTransactionColMap_(txSheet, ['reference', 'funded', 'fundedDate']);
    var lastRow = txSheet.getLastRow();
    var refs = txSheet.getRange(2, colMap.reference + 1, lastRow - 1, 1).getValues();

    for (var i = 0; i < refs.length; i++) {
      if (String(refs[i][0] || '').trim() === data.transactionRef) {
        var txRow = i + 2;
        var fundedDate = new Date();
        txSheet.getRange(txRow, colMap.funded + 1).setValue('Cleared');
        txSheet.getRange(txRow, colMap.fundedDate + 1).setValue(fundedDate);
        return {
          status: 'success',
          transactionRef: data.transactionRef,
          fundedDate: formatDateEdt_(fundedDate)
        };
      }
    }`;

replaceBlock('5. markTransactionFunded', s5, r5);

// 6. bulkMarkFunded
const s6 = `    var lastRow = txSheet.getLastRow();
    var allData = txSheet.getRange(2, 1, lastRow - 1, 14).getValues(); // cols A-N
    var fundedDate = new Date();
    var refsToFind = {};
    for (var r = 0; r < data.transactionRefs.length; r++) {
      refsToFind[data.transactionRefs[r]] = true;
    }

    var updatedCount = 0;
    for (var i = 0; i < allData.length; i++) {
      var ref = String(allData[i][1] || '').trim(); // col B
      if (refsToFind[ref]) {
        allData[i][12] = 'Cleared';    // col M: Funded
        allData[i][13] = fundedDate;   // col N: Funded Date
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      txSheet.getRange(2, 1, allData.length, 14).setValues(allData);
    }`;

const r6 = `    var colMap = getTransactionColMap_(txSheet, ['reference', 'funded', 'fundedDate']);
    var lastRow = txSheet.getLastRow();
    var lastCol = txSheet.getLastColumn();
    var allData = txSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var fundedDate = new Date();
    var refsToFind = {};
    for (var r = 0; r < data.transactionRefs.length; r++) {
      refsToFind[data.transactionRefs[r]] = true;
    }

    var updatedCount = 0;
    for (var i = 0; i < allData.length; i++) {
      var ref = String(allData[i][colMap.reference] || '').trim();
      if (refsToFind[ref]) {
        allData[i][colMap.funded] = 'Cleared';
        allData[i][colMap.fundedDate] = fundedDate;
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      txSheet.getRange(2, 1, allData.length, lastCol).setValues(allData);
    }`;

replaceBlock('6. bulkMarkFunded', s6, r6);

// 7. ensureTransactionDepositCol_
const s7 = `function ensureTransactionDepositCol_(txSheet) {
  if (!txSheet) return;
  var lastCol = txSheet.getLastColumn();
  if (lastCol < 15) {
    txSheet.getRange(1, 15).setValue('Deposit Batch ID');
    txSheet.getRange(1, 15).setFontWeight('bold');
  } else {
    var col15Header = String(txSheet.getRange(1, 15).getValue() || '').trim();
    if (!col15Header) {
      txSheet.getRange(1, 15).setValue('Deposit Batch ID');
      txSheet.getRange(1, 15).setFontWeight('bold');
    }
  }
}`;

const r7 = `function ensureTransactionDepositCol_(txSheet) {
  if (!txSheet) return;
  var colMap = getTransactionColMap_(txSheet, []);
  if (colMap.depositBatchId === -1) {
    var newCol = txSheet.getLastColumn() + 1;
    txSheet.getRange(1, newCol).setValue('Deposit Batch ID');
    txSheet.getRange(1, newCol).setFontWeight('bold');
    txSheet.setColumnWidth(newCol, 150);
  }
}`;

replaceBlock('7. ensureTransactionDepositCol_', s7, r7);

// 8. createDepositBatchMaster_
const s8 = `    var lastRow = txSheet.getLastRow();
    var lastCol = Math.max(15, txSheet.getLastColumn());
    var txData = txSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    var refsToFind = {};
    for (var r = 0; r < data.transactionRefs.length; r++) {
      refsToFind[String(data.transactionRefs[r]).trim()] = true;
    }

    var matchedCount = 0;
    var totalGross = 0;
    var totalFees = 0;
    var fundedDate = new Date();

    for (var i = 0; i < txData.length; i++) {
      var ref = String(txData[i][1] || '').trim(); // col B: Reference
      if (refsToFind[ref]) {
        var charged = parseFloat(txData[i][2]) || 0; // col C: Amount Charged
        var fee = parseFloat(txData[i][3]) || 0;     // col D: Fees
        txData[i][12] = 'Cleared';                   // col M: Funded
        txData[i][13] = fundedDate;                  // col N: Funded Date
        txData[i][14] = batchId;                     // col O: Deposit Batch ID
        totalGross += charged;
        totalFees += fee;
        matchedCount++;
      }
    }

    if (matchedCount === 0) {
      return { status: 'error', message: 'None of the specified transactions were found.' };
    }

    // Write back updated transactions
    txSheet.getRange(2, 1, txData.length, lastCol).setValues(txData);

    var totalNet = totalGross - totalFees;
    var depDateVal = data.depositDate ? new Date(data.depositDate) : fundedDate;

    // Append to Deposits tab
    // [Batch ID, Date Created, Deposit Date, Transaction Count, Gross Amount, Total Fees, Net Transferred, Target Account, Transfer Ref, Memo, Created By, Status]
    depSheet.appendRow([
      batchId,
      fundedDate,
      depDateVal,
      matchedCount,
      Math.round(totalGross * 100) / 100,
      Math.round(totalFees * 100) / 100,
      Math.round(totalNet * 100) / 100,
      data.targetAccount || '',
      data.transferRef || '',
      data.memo || '',
      callerEmail || '',
      'Completed'
    ]);`;

const r8 = `    var colMap = getTransactionColMap_(txSheet, ['reference', 'amount', 'fees', 'net', 'funded', 'fundedDate', 'depositBatchId']);
    var lastRow = txSheet.getLastRow();
    var lastCol = txSheet.getLastColumn();
    var txData = txSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    var refsToFind = {};
    for (var r = 0; r < data.transactionRefs.length; r++) {
      refsToFind[String(data.transactionRefs[r]).trim()] = true;
    }

    var matchedCount = 0;
    var totalGross = 0;
    var totalFees = 0;
    var totalNet = 0;
    var fundedDate = new Date();

    for (var i = 0; i < txData.length; i++) {
      var ref = String(txData[i][colMap.reference] || '').trim();
      if (refsToFind[ref]) {
        var charged = parseFloat(txData[i][colMap.amount]) || 0;
        var fee = parseFloat(txData[i][colMap.fees]) || 0;
        var storedNet = parseFloat(txData[i][colMap.net]) || 0;
        txData[i][colMap.funded] = 'Cleared';
        txData[i][colMap.fundedDate] = fundedDate;
        txData[i][colMap.depositBatchId] = batchId;
        totalGross += charged;
        totalFees += fee;
        totalNet += storedNet; // Literal sum of stored Net across legacy and new rows
        matchedCount++;
      }
    }

    if (matchedCount === 0) {
      return { status: 'error', message: 'None of the specified transactions were found.' };
    }

    // Write back updated transactions
    txSheet.getRange(2, 1, txData.length, lastCol).setValues(txData);

    var depDateVal = data.depositDate ? new Date(data.depositDate) : fundedDate;

    // Append to Deposits tab
    // [Batch ID, Date Created, Deposit Date, Transaction Count, Gross Amount, Total Fees, Net Transferred, Target Account, Transfer Ref, Memo, Created By, Status]
    depSheet.appendRow([
      batchId,
      fundedDate,
      depDateVal,
      matchedCount,
      Math.round(totalGross * 100) / 100,
      Math.round(totalFees * 100) / 100,
      Math.round(totalNet * 100) / 100,
      data.targetAccount || '',
      data.transferRef || '',
      data.memo || '',
      callerEmail || '',
      'Completed'
    ]);`;

replaceBlock('8. createDepositBatchMaster_', s8, r8);

// 9. reverseDepositBatchMaster_
const s9 = `    if (txSheet && txSheet.getLastRow() >= 2) {
      var lastRow = txSheet.getLastRow();
      var lastCol = Math.max(15, txSheet.getLastColumn());
      var txData = txSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

      for (var i = 0; i < txData.length; i++) {
        var txBatchId = String(txData[i][14] || '').trim(); // col O
        if (txBatchId === batchIdToReverse) {
          txData[i][12] = ''; // col M: Funded
          txData[i][13] = ''; // col N: Funded Date
          txData[i][14] = ''; // col O: Deposit Batch ID
          reversedCount++;
        }
      }

      if (reversedCount > 0) {
        txSheet.getRange(2, 1, txData.length, lastCol).setValues(txData);
      }
    }`;

const r9 = `    if (txSheet && txSheet.getLastRow() >= 2) {
      var colMap = getTransactionColMap_(txSheet, ['funded', 'fundedDate', 'depositBatchId']);
      var lastRow = txSheet.getLastRow();
      var lastCol = txSheet.getLastColumn();
      var txData = txSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

      for (var i = 0; i < txData.length; i++) {
        var txBatchId = String(txData[i][colMap.depositBatchId] || '').trim();
        if (txBatchId === batchIdToReverse) {
          txData[i][colMap.funded] = '';
          txData[i][colMap.fundedDate] = '';
          txData[i][colMap.depositBatchId] = '';
          reversedCount++;
        }
      }

      if (reversedCount > 0) {
        txSheet.getRange(2, 1, txData.length, lastCol).setValues(txData);
      }
    }`;

replaceBlock('9. reverseDepositBatchMaster_', s9, r9);

// 10. getReconciliationDataMaster_
const s10 = `    if (txSheet && txSheet.getLastRow() >= 2) {
      var lastRow = txSheet.getLastRow();
      var txData = txSheet.getRange(2, 1, lastRow - 1, Math.max(14, txSheet.getLastColumn())).getValues();
      for (var t = 0; t < txData.length; t++) {
        var tr = txData[t];
        var result = String(tr[8] || '').trim().toLowerCase();
        // Skip failed transactions
        if (result === 'failed' || result === 'declined' || result === 'error') continue;

        var net = parseFloat(tr[4]) || 0;
        var isCleared = String(tr[12] || '').trim().toLowerCase() === 'cleared';

        totalTxnCount++;
        totalTxnNet += net;

        if (isCleared) {
          fundedCount++;
          fundedNet += net;
        } else {
          pendingCount++;
          pendingNet += net;
        }
      }
    }`;

const r10 = `    if (txSheet && txSheet.getLastRow() >= 2) {
      var colMap = getTransactionColMap_(txSheet, ['net']);
      var lastRow = txSheet.getLastRow();
      var txData = txSheet.getRange(2, 1, lastRow - 1, txSheet.getLastColumn()).getValues();
      for (var t = 0; t < txData.length; t++) {
        var tr = txData[t];
        var result = colMap.result !== -1 ? String(tr[colMap.result] || '').trim().toLowerCase() : '';
        // Skip failed transactions
        if (result === 'failed' || result === 'declined' || result === 'error') continue;

        var net = colMap.net !== -1 ? (parseFloat(tr[colMap.net]) || 0) : 0;
        var isCleared = colMap.funded !== -1 ? (String(tr[colMap.funded] || '').trim().toLowerCase() === 'cleared') : false;

        totalTxnCount++;
        totalTxnNet += net;

        if (isCleared) {
          fundedCount++;
          fundedNet += net;
        } else {
          pendingCount++;
          pendingNet += net;
        }
      }
    }`;

replaceBlock('10. getReconciliationDataMaster_', s10, r10);

// 11. logLinkClickMaster_
const s11 = `function logLinkClickMaster_(data) {
  try {
    var campaignId = data.campaignId || data.campaign || data.campaignCode || 'general';
    var sheetId = getCampaignSheetId(campaignId);
    if (!sheetId) {
      Logger.log('logLinkClickMaster_ could not find sheet for campaign: ' + campaignId);
      return { status: 'error', message: 'Campaign sheet not found' };
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName('LinkClicks');
    if (!sheet) {
      sheet = ss.insertSheet('LinkClicks');
      sheet.getRange('A1:G1').setValues([[
        'Timestamp', 'First Name', 'Last Name',
        'Email', 'Link Clicked', 'Campaign', 'Amount'
      ]]);
      formatHeaderRow_(sheet, 'A1:G1');
    } else {
      // Ensure header row includes Amount column
      if (sheet.getLastColumn() < 7) {
        sheet.getRange(1, 7).setValue('Amount');
        formatHeaderRow_(sheet, 'A1:G1');
      }
    }

    var amt = parseFloat(data.amount) || '';
    sheet.appendRow([
      new Date(),
      String(data.firstName || '').trim(),
      String(data.lastName || '').trim(),
      String(data.email || '').trim(),
      String(data.linkClicked || data.link || '').trim(),
      String(data.campaignName || campaignId),
      amt
    ]);

    if (amt && sheet.getLastRow() >= 2) {
      sheet.getRange(sheet.getLastRow(), 7).setNumberFormat('$#,##0.00');
    }

    return { status: 'success' };
  } catch (err) {
    Logger.log('logLinkClickMaster_ error: ' + err.toString());
    return { status: 'error', message: err.toString() };
  }
}`;

const r11 = `function logLinkClickMaster_(data) {
  try {
    var campaignId = data.campaignId || data.campaign || data.campaignCode || 'general';
    var sheetId = getCampaignSheetId(campaignId);
    if (!sheetId) {
      Logger.log('logLinkClickMaster_ could not find sheet for campaign: ' + campaignId);
      return { status: 'error', message: 'Campaign sheet not found' };
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName('LinkClicks');
    if (!sheet) {
      sheet = ss.insertSheet('LinkClicks');
      sheet.getRange('A1:H1').setValues([[
        'Click ID', 'Timestamp', 'First Name', 'Last Name',
        'Email', 'Link Clicked', 'Campaign', 'Amount'
      ]]);
      formatHeaderRow_(sheet, 'A1:H1');
      sheet.setColumnWidth(1, 180);
    } else {
      var firstH = String(sheet.getRange(1, 1).getValue() || '').trim().toLowerCase();
      if (firstH !== 'click id' && firstH !== 'clickid' && firstH !== 'pk') {
        sheet.insertColumnBefore(1);
        sheet.getRange(1, 1).setValue('Click ID');
        sheet.getRange(1, 1).setFontWeight('bold');
        sheet.setColumnWidth(1, 180);
      }
      if (sheet.getLastColumn() < 8) {
        sheet.getRange(1, 8).setValue('Amount');
        sheet.getRange(1, 8).setFontWeight('bold');
      }
    }

    var amt = parseFloat(data.amount) || '';
    var clickId = String(data.clickId || data.clickPk || '').trim();
    if (!clickId) {
      var campPrefix = String(campaignId || 'CAMP').toUpperCase().replace(/[^A-Z0-9]/g, '');
      clickId = 'LC-' + (campPrefix || 'CAMP') + '-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMddHHmmss') + '-' + Math.floor(1000 + Math.random() * 9000);
    }

    sheet.appendRow([
      clickId,
      new Date(),
      String(data.firstName || '').trim(),
      String(data.lastName || '').trim(),
      String(data.email || '').trim(),
      String(data.linkClicked || data.link || '').trim(),
      String(data.campaignName || campaignId),
      amt
    ]);

    if (amt && sheet.getLastRow() >= 2) {
      sheet.getRange(sheet.getLastRow(), 8).setNumberFormat('$#,##0.00');
    }

    return { status: 'success', clickId: clickId };
  } catch (err) {
    Logger.log('logLinkClickMaster_ error: ' + err.toString());
    return { status: 'error', message: err.toString() };
  }
}`;

replaceBlock('11. logLinkClickMaster_', s11, r11);

// 12. resendReceipt
const s12 = `    // Get transaction reference
    var transactionRef = '';
    var txSheet = campaignSS.getSheetByName('Transactions');
    if (txSheet && txSheet.getLastRow() >= 2) {
      var txData = txSheet.getRange(2, 1, txSheet.getLastRow() - 1, 14).getValues();
      for (var t = 0; t < txData.length; t++) {
        if (String(txData[t][6] || '').trim() === data.pledgeId) {
          transactionRef = String(txData[t][1] || '').trim();
          break;
        }
      }
    }`;

const r12 = `    // Get transaction reference
    var transactionRef = '';
    var txSheet = campaignSS.getSheetByName('Transactions');
    if (txSheet && txSheet.getLastRow() >= 2) {
      var colMap = getTransactionColMap_(txSheet, ['reference', 'pledgeId']);
      var txData = txSheet.getRange(2, 1, txSheet.getLastRow() - 1, txSheet.getLastColumn()).getValues();
      for (var t = 0; t < txData.length; t++) {
        if (String(txData[t][colMap.pledgeId] || '').trim() === data.pledgeId) {
          transactionRef = String(txData[t][colMap.reference] || '').trim();
          break;
        }
      }
    }`;

replaceBlock('12. resendReceipt', s12, r12);

// 13. logTransactionMaster
const s13 = `function logTransactionMaster(ss, pledgeId, customerId, donorName, amount, paymentResult, paymentNum, fee) {
  try {
    var sheet = ss.getSheetByName('Transactions');
    if (!sheet) {
      sheet = ss.insertSheet('Transactions');
      sheet.appendRow([
        'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Net', 'Donor Name', 'Pledge ID',
        'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date'
      ]);
      sheet.getRange('1:1').setFontWeight('bold');
    }

    var isGatewayTx = paymentResult.xResult === 'A';
    var funded = isGatewayTx ? 'Pending' : '';
    var txFee = parseFloat(fee) || 0;
    var txNet = amount - txFee;

    sheet.appendRow([
      new Date(),                                    // A: Timestamp
      paymentResult.xRefNum || '',                   // B: Reference
      amount,                                        // C: Amount Charged
      txFee,                                         // D: Fees
      txNet,                                         // E: Net
      donorName || '',                               // F: Donor Name
      pledgeId || '',                                // G: Pledge ID
      customerId || '',                              // H: Customer ID
      paymentResult.xResult || 'Manual',             // I: Result
      paymentResult.xMaskedCardNumber || '',          // J: Method
      paymentResult.xCardType || '',                  // K: Card Type
      paymentNum || '',                              // L: Payment #
      funded,                                        // M: Funded
      ''                                             // N: Funded Date
    ]);
  } catch (err) {
    Logger.log('logTransactionMaster failed: ' + err.toString());
  }
}`;

const r13 = `function logTransactionMaster(ss, pledgeId, customerId, donorName, amount, paymentResult, paymentNum, fee, fundCharge) {
  try {
    var sheet = ss.getSheetByName('Transactions');
    if (!sheet) {
      sheet = ss.insertSheet('Transactions');
      sheet.appendRow([
        'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Fund Charge', 'Net', 'Donor Name', 'Pledge ID',
        'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date'
      ]);
      sheet.getRange('1:1').setFontWeight('bold');
    } else {
      ensureTransactionFundChargeCol_(sheet);
    }

    var colMap = getTransactionColMap_(sheet);

    var isGatewayTx = paymentResult.xResult === 'A' || paymentResult.xResult === 'Approved';
    var funded = isGatewayTx ? 'Pending' : '';
    var txFee = parseFloat(fee) || 0;
    var txFundCharge = (fundCharge !== undefined && fundCharge !== null) ? parseFloat(fundCharge) : calculateFundCharge(paymentResult.xCardType || paymentResult.method || 'Credit Card', amount, ss);
    if (isNaN(txFundCharge)) txFundCharge = 0;
    var txNet = amount - txFee - txFundCharge;

    var rowArray = buildTransactionRowArray_(colMap, {
      timestamp: new Date(),
      reference: paymentResult.xRefNum || '',
      amount: amount,
      fees: txFee,
      fundCharge: txFundCharge,
      net: txNet,
      donorName: donorName || '',
      pledgeId: pledgeId || '',
      customerId: customerId || '',
      result: paymentResult.xResult || 'Manual',
      method: paymentResult.xMaskedCardNumber || '',
      cardType: paymentResult.xCardType || '',
      paymentNum: paymentNum || '',
      funded: funded,
      fundedDate: ''
    });

    sheet.appendRow(rowArray);
  } catch (err) {
    Logger.log('logTransactionMaster failed: ' + err.toString());
  }
}`;

replaceBlock('13. logTransactionMaster', s13, r13);

// 14. loadFeeSchedule_ and calculateFundCharge
const s14 = `function loadFeeSchedule_(ss) {
  var ssId = ss.getId();
  if (_feeScheduleCaches[ssId]) return _feeScheduleCaches[ssId];
  try {
    var sheet = ss.getSheetByName('Fee_Config');
    if (!sheet) {
      // Auto-create with comprehensive defaults
      sheet = ss.insertSheet('Fee_Config');
      sheet.appendRow(['Method', 'Rate', 'Flat Fee']);
      var defaults = getMasterFeeDefaults_();
      for (var d = 0; d < defaults.length; d++) {
        sheet.appendRow(defaults[d]);
      }
      sheet.getRange('A1:C1').setFontWeight('bold');
      sheet.setColumnWidth(1, 200);
      sheet.setColumnWidth(2, 80);
      sheet.setColumnWidth(3, 80);
      sheet.getRange('B2:B100').setNumberFormat('0.000');
      sheet.getRange('C2:C100').setNumberFormat('$#,##0.00');
      syncFeeConfigFromPledges_(ss, sheet);
      Logger.log('Created Fee_Config sheet for ' + ssId);
    }
    if (sheet.getLastRow() < 2) {
      _feeScheduleCaches[ssId] = { 'Credit Card': { rate: 0.029, flat: 0.30 } };
      return _feeScheduleCaches[ssId];
    }
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
    var schedule = {};
    for (var i = 0; i < data.length; i++) {
      var method = String(data[i][0] || '').trim();
      if (method) {
        schedule[method] = {
          rate: parseFloat(data[i][1]) || 0,
          flat: parseFloat(data[i][2]) || 0
        };
      }
    }
    _feeScheduleCaches[ssId] = schedule;
    return schedule;
  } catch (e) {
    Logger.log('loadFeeSchedule_ error: ' + e.toString());
    _feeScheduleCaches[ssId] = { 'Credit Card': { rate: 0.029, flat: 0.30 } };
    return _feeScheduleCaches[ssId];
  }
}`;

const r14 = `function loadFeeSchedule_(ss) {
  var ssId = ss.getId();
  if (_feeScheduleCaches[ssId]) return _feeScheduleCaches[ssId];
  try {
    var sheet = ss.getSheetByName('Fee_Config');
    if (!sheet) {
      // Auto-create with comprehensive defaults
      sheet = ss.insertSheet('Fee_Config');
      sheet.appendRow(['Method', 'Rate', 'Flat Fee', 'Fund_Charge']);
      var defaults = getMasterFeeDefaults_();
      for (var d = 0; d < defaults.length; d++) {
        sheet.appendRow(defaults[d]);
      }
      sheet.getRange('A1:D1').setFontWeight('bold');
      sheet.setColumnWidth(1, 200);
      sheet.setColumnWidth(2, 80);
      sheet.setColumnWidth(3, 80);
      sheet.setColumnWidth(4, 100);
      sheet.getRange('B2:B100').setNumberFormat('0.00%');
      sheet.getRange('C2:C100').setNumberFormat('$#,##0.00');
      sheet.getRange('D2:D100').setNumberFormat('0.00%');
      syncFeeConfigFromPledges_(ss, sheet);
      Logger.log('Created Fee_Config sheet for ' + ssId);
    } else {
      // Ensure column 4 Fund_Charge exists
      if (sheet.getLastColumn() < 4) {
        sheet.getRange(1, 4).setValue('Fund_Charge');
        sheet.getRange(1, 4).setFontWeight('bold');
        sheet.setColumnWidth(4, 100);
        if (sheet.getLastRow() >= 2) {
          sheet.getRange(2, 4, sheet.getLastRow() - 1, 1).setValue(0.01);
          sheet.getRange(2, 4, sheet.getLastRow() - 1, 1).setNumberFormat('0.00%');
        }
      }
    }
    if (sheet.getLastRow() < 2) {
      _feeScheduleCaches[ssId] = { 'Credit Card': { rate: 0.029, flat: 0.30, fundCharge: 0.01 } };
      return _feeScheduleCaches[ssId];
    }
    var numCols = Math.min(sheet.getLastColumn(), 4);
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, numCols).getValues();
    var schedule = {};
    for (var i = 0; i < data.length; i++) {
      var method = String(data[i][0] || '').trim();
      if (method) {
        var rawFc = numCols >= 4 ? data[i][3] : undefined;
        var fc = (rawFc !== undefined && rawFc !== null && String(rawFc).trim() !== '' && !isNaN(rawFc)) ? parseFloat(rawFc) : 0.01;
        schedule[method] = {
          rate: parseFloat(data[i][1]) || 0,
          flat: parseFloat(data[i][2]) || 0,
          fundCharge: fc
        };
      }
    }
    _feeScheduleCaches[ssId] = schedule;
    return schedule;
  } catch (e) {
    Logger.log('loadFeeSchedule_ error: ' + e.toString());
    _feeScheduleCaches[ssId] = { 'Credit Card': { rate: 0.029, flat: 0.30, fundCharge: 0.01 } };
    return _feeScheduleCaches[ssId];
  }
}

/**
 * Calculates the NC Fund Charge for a given transaction method and amount.
 *
 * @param {string} method - Payment method or card brand
 * @param {number} amount - Gross amount charged
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} [ss] - Campaign spreadsheet
 * @returns {number} Fund charge rounded to 2 decimal places
 */
function calculateFundCharge(method, amount, ss) {
  var amt = parseFloat(amount) || 0;
  if (amt <= 0) return 0;
  var schedule;
  if (ss) {
    schedule = loadFeeSchedule_(ss);
  } else {
    schedule = { 'Credit Card': { rate: 0.029, flat: 0.30, fundCharge: 0.01 } };
  }
  var rate = 0.01;
  if (schedule && schedule[method] && schedule[method].fundCharge !== undefined) {
    rate = schedule[method].fundCharge;
  } else {
    var ml = (method || '').toLowerCase();
    if (ml.startsWith('daf') && schedule && schedule['DAF'] && schedule['DAF'].fundCharge !== undefined) {
      rate = schedule['DAF'].fundCharge;
    } else if ((/^\d/.test(method) || ml.includes('visa') || ml.includes('mastercard') || ml.includes('card') || ml.includes('amex') || ml.includes('american express') || ml.includes('discover') || ml.includes('diners') || ml.includes('jcb')) && schedule && schedule['Credit Card'] && schedule['Credit Card'].fundCharge !== undefined) {
      rate = schedule['Credit Card'].fundCharge;
    } else if (ml.includes('matbia') && schedule && schedule['Matbia'] && schedule['Matbia'].fundCharge !== undefined) {
      rate = schedule['Matbia'].fundCharge;
    }
  }
  return Math.round(amt * rate * 100) / 100;
}`;

replaceBlock('14. loadFeeSchedule_ and calculateFundCharge', s14, r14);

const s14b = `    var added = Object.keys(newMethods);
    for (var k = 0; k < added.length; k++) {
      feeSheet.appendRow([added[k], 0, 0]);
    }`;

const r14b = `    var added = Object.keys(newMethods);
    for (var k = 0; k < added.length; k++) {
      feeSheet.appendRow([added[k], 0, 0, 0.01]);
    }`;

replaceBlock('14b. syncFeeConfigFromPledges_ 4-cols', s14b, r14b);

// 15. processBookkeeperPayment
const s15 = `    var fee = parseFloat(data.fee) || 0;
    var net = amount - fee;
    var method = data.method || 'Manual';

    // Generate transaction reference
    var refNum = 'BK-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 1000);

    // Create Transaction row
    var txSheet = ss.getSheetByName('Transactions');
    if (!txSheet) {
      txSheet = ss.insertSheet('Transactions');
      txSheet.appendRow([
        'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Net', 'Donor Name', 'Pledge ID',
        'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date'
      ]);
      txSheet.getRange('1:1').setFontWeight('bold');
    }

    txSheet.appendRow([
      new Date(),              // A: Timestamp
      refNum,                  // B: Reference
      amount,                  // C: Amount Charged
      fee,                     // D: Fees
      net,                     // E: Net
      donor,                   // F: Donor Name
      data.pledgeId,           // G: Pledge ID
      customerId,              // H: Customer ID
      'Bookkeeper',            // I: Result
      method,                  // J: Method
      '',                      // K: Card Type
      String(data.paymentNum || '1'), // L: Payment #
      'Pending',               // M: Funded
      ''                       // N: Funded Date
    ]);`;

const r15 = `    var fee = parseFloat(data.fee) || 0;
    var method = data.method || 'Manual';
    var fundCharge = calculateFundCharge(method, amount, ss);
    var net = amount - fee - fundCharge;

    // Generate transaction reference
    var refNum = 'BK-' + Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 1000);

    // Create Transaction row
    var txSheet = ss.getSheetByName('Transactions');
    if (!txSheet) {
      txSheet = ss.insertSheet('Transactions');
      txSheet.appendRow([
        'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Fund Charge', 'Net', 'Donor Name', 'Pledge ID',
        'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date'
      ]);
      txSheet.getRange('1:1').setFontWeight('bold');
    } else {
      ensureTransactionFundChargeCol_(txSheet);
    }

    var colMap = getTransactionColMap_(txSheet);

    var rowArray = buildTransactionRowArray_(colMap, {
      timestamp: new Date(),
      reference: refNum,
      amount: amount,
      fees: fee,
      fundCharge: fundCharge,
      net: net,
      donorName: donor,
      pledgeId: data.pledgeId,
      customerId: customerId,
      result: 'Bookkeeper',
      method: method,
      cardType: '',
      paymentNum: String(data.paymentNum || '1'),
      funded: 'Pending',
      fundedDate: ''
    });

    txSheet.appendRow(rowArray);`;

replaceBlock('15. processBookkeeperPayment', s15, r15);

// 16. provisionCampaignSheet
const s16 = `    // ── Tab 2: Transactions (14 cols - KSY Schema) ──
    var txnSheet = campaignSS.getSheetByName('Transactions');
    if (!txnSheet) txnSheet = campaignSS.insertSheet('Transactions');
    txnSheet.getRange('A1:N1').setValues([[
      'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Net',
      'Donor Name', 'Pledge ID', 'Customer ID', 'Result', 'Method',
      'Card Type', 'Payment #', 'Funded', 'Funded Date'
    ]]);
    formatHeaderRow_(txnSheet, 'A1:N1');
    txnSheet.getRange('C2:E1000').setNumberFormat('$#,##0.00');

    // ── Tab 3: Customers (11 cols) ──
    var custSheet = campaignSS.getSheetByName('Customers');
    if (!custSheet) custSheet = campaignSS.insertSheet('Customers');
    custSheet.getRange('A1:K1').setValues([[
      'Customer ID', 'First Name', 'Last Name', 'Email',
      'Phone', 'Street', 'City', 'State',
      'Zip', 'Created Date', 'Source'
    ]]);
    formatHeaderRow_(custSheet, 'A1:K1');

    // ── Tab 4: Scheduled Payments (13 cols - KSY Schema) ──
    var schedSheet = campaignSS.getSheetByName('Scheduled Payments');
    if (!schedSheet) schedSheet = campaignSS.insertSheet('Scheduled Payments');
    schedSheet.getRange('A1:M1').setValues([[
      'DateSubmitted', 'Recurring ID', 'Pledge ID', 'Customer ID',
      'Donor Name', 'USD Amount', 'Total Pledge', 'Frequency',
      'Count', 'Sequence', 'DateDue', 'Status', 'Transaction Ref'
    ]]);
    formatHeaderRow_(schedSheet, 'A1:M1');
    schedSheet.getRange('F2:G1000').setNumberFormat('$#,##0.00');

    // ── Tab 5: Teams (7 cols - KSY Schema) ──
    var teamsSheet = campaignSS.getSheetByName('Teams');
    if (!teamsSheet) teamsSheet = campaignSS.insertSheet('Teams');
    teamsSheet.getRange('A1:G1').setValues([[
      'Team ID', 'Team Name', 'Team Contact Name',
      'Team Contact Email', 'Notify on New Donation', 'Team Goal', 'Campaign'
    ]]);
    formatHeaderRow_(teamsSheet, 'A1:G1');
    teamsSheet.getRange('F2:F100').setNumberFormat('$#,##0.00');

    // ── Tab 6: LinkClicks (7 cols) ──
    var clicksSheet = campaignSS.getSheetByName('LinkClicks');
    if (!clicksSheet) clicksSheet = campaignSS.insertSheet('LinkClicks');
    clicksSheet.getRange('A1:G1').setValues([[
      'Timestamp', 'First Name', 'Last Name',
      'Email', 'Link Clicked', 'Campaign', 'Amount'
    ]]);
    formatHeaderRow_(clicksSheet, 'A1:G1');

    // ——— Tab 7: Fee_Config (3 cols - Fee Schedule) ———
    var feeSheet = campaignSS.getSheetByName('Fee_Config');
    if (!feeSheet) {
      feeSheet = campaignSS.insertSheet('Fee_Config');
      feeSheet.getRange('A1:C1').setValues([['Method', 'Rate', 'Flat Fee']]);
      var feeDefaults = getMasterFeeDefaults_(ss);
      feeSheet.getRange(2, 1, feeDefaults.length, 3).setValues(feeDefaults);
    }
    formatHeaderRow_(feeSheet, 'A1:C1');
    feeSheet.getRange('B2:B100').setNumberFormat('0.00%');
    feeSheet.getRange('C2:C100').setNumberFormat('$#,##0.00');`;

const r16 = `    // ── Tab 2: Transactions (15 cols - KSY Schema with Fund Charge) ──
    var txnSheet = campaignSS.getSheetByName('Transactions');
    if (!txnSheet) {
      txnSheet = campaignSS.insertSheet('Transactions');
      txnSheet.getRange('A1:O1').setValues([[
        'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Fund Charge', 'Net',
        'Donor Name', 'Pledge ID', 'Customer ID', 'Result', 'Method',
        'Card Type', 'Payment #', 'Funded', 'Funded Date'
      ]]);
      formatHeaderRow_(txnSheet, 'A1:O1');
      txnSheet.getRange('C2:F1000').setNumberFormat('$#,##0.00');
    } else {
      ensureTransactionFundChargeCol_(txnSheet);
    }

    // ── Tab 3: Customers (11 cols) ──
    var custSheet = campaignSS.getSheetByName('Customers');
    if (!custSheet) custSheet = campaignSS.insertSheet('Customers');
    custSheet.getRange('A1:K1').setValues([[
      'Customer ID', 'First Name', 'Last Name', 'Email',
      'Phone', 'Street', 'City', 'State',
      'Zip', 'Created Date', 'Source'
    ]]);
    formatHeaderRow_(custSheet, 'A1:K1');

    // ── Tab 4: Scheduled Payments (13 cols - KSY Schema) ──
    var schedSheet = campaignSS.getSheetByName('Scheduled Payments');
    if (!schedSheet) schedSheet = campaignSS.insertSheet('Scheduled Payments');
    schedSheet.getRange('A1:M1').setValues([[
      'DateSubmitted', 'Recurring ID', 'Pledge ID', 'Customer ID',
      'Donor Name', 'USD Amount', 'Total Pledge', 'Frequency',
      'Count', 'Sequence', 'DateDue', 'Status', 'Transaction Ref'
    ]]);
    formatHeaderRow_(schedSheet, 'A1:M1');
    schedSheet.getRange('F2:G1000').setNumberFormat('$#,##0.00');

    // ── Tab 5: Teams (7 cols - KSY Schema) ──
    var teamsSheet = campaignSS.getSheetByName('Teams');
    if (!teamsSheet) teamsSheet = campaignSS.insertSheet('Teams');
    teamsSheet.getRange('A1:G1').setValues([[
      'Team ID', 'Team Name', 'Team Contact Name',
      'Team Contact Email', 'Notify on New Donation', 'Team Goal', 'Campaign'
    ]]);
    formatHeaderRow_(teamsSheet, 'A1:G1');
    teamsSheet.getRange('F2:F100').setNumberFormat('$#,##0.00');

    // ── Tab 6: LinkClicks (8 cols) ──
    var clicksSheet = campaignSS.getSheetByName('LinkClicks');
    if (!clicksSheet) {
      clicksSheet = campaignSS.insertSheet('LinkClicks');
      clicksSheet.getRange('A1:H1').setValues([[
        'Click ID', 'Timestamp', 'First Name', 'Last Name',
        'Email', 'Link Clicked', 'Campaign', 'Amount'
      ]]);
      formatHeaderRow_(clicksSheet, 'A1:H1');
      clicksSheet.setColumnWidth(1, 180);
    } else {
      var firstH = String(clicksSheet.getRange(1, 1).getValue() || '').trim().toLowerCase();
      if (firstH !== 'click id' && firstH !== 'clickid' && firstH !== 'pk') {
        clicksSheet.insertColumnBefore(1);
        clicksSheet.getRange(1, 1).setValue('Click ID');
        clicksSheet.getRange(1, 1).setFontWeight('bold');
        clicksSheet.setColumnWidth(1, 180);
      }
      if (clicksSheet.getLastColumn() < 8) {
        clicksSheet.getRange(1, 8).setValue('Amount');
        clicksSheet.getRange(1, 8).setFontWeight('bold');
      }
    }

    // ——— Tab 7: Fee_Config (4 cols - Fee Schedule) ———
    var feeSheet = campaignSS.getSheetByName('Fee_Config');
    if (!feeSheet) {
      feeSheet = campaignSS.insertSheet('Fee_Config');
      feeSheet.getRange('A1:D1').setValues([['Method', 'Rate', 'Flat Fee', 'Fund_Charge']]);
      var feeDefaults = getMasterFeeDefaults_(ss);
      feeSheet.getRange(2, 1, feeDefaults.length, 4).setValues(feeDefaults);
      formatHeaderRow_(feeSheet, 'A1:D1');
      feeSheet.setColumnWidth(1, 200);
      feeSheet.setColumnWidth(2, 80);
      feeSheet.setColumnWidth(3, 80);
      feeSheet.setColumnWidth(4, 100);
      feeSheet.getRange('B2:B100').setNumberFormat('0.00%');
      feeSheet.getRange('C2:C100').setNumberFormat('$#,##0.00');
      feeSheet.getRange('D2:D100').setNumberFormat('0.00%');
    } else {
      if (feeSheet.getLastColumn() < 4) {
        feeSheet.getRange(1, 4).setValue('Fund_Charge');
        feeSheet.getRange(1, 4).setFontWeight('bold');
        feeSheet.setColumnWidth(4, 100);
        if (feeSheet.getLastRow() >= 2) {
          feeSheet.getRange(2, 4, feeSheet.getLastRow() - 1, 1).setValue(0.01);
          feeSheet.getRange(2, 4, feeSheet.getLastRow() - 1, 1).setNumberFormat('0.00%');
        }
      }
    }`;

replaceBlock('16. provisionCampaignSheet', s16, r16);

// 17. campaignTabs in initializeSpreadsheets
const s17 = `      {
        name: 'Transactions',
        headers: [
          'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Net', 'Donor Name', 'Pledge ID',
          'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date'
        ]
      },
      {
        name: 'Customers',
        headers: [
          'Customer ID', 'First Name', 'Last Name', 'Email', 'Phone',
          'Street', 'City', 'State', 'Zip', 'Created Date', 'Source'
        ]
      },
      {
        name: 'Scheduled Payments',
        headers: [
          'DateSubmitted', 'Recurring ID', 'Pledge ID', 'Customer ID', 'Donor Name',
          'USD Amount', 'Total Pledge', 'Frequency',
          'Count', 'Sequence', 'DateDue', 'Status', 'Transaction Ref'
        ]
      },
      {
        name: 'Teams',
        headers: [
          'Team ID', 'Team Name', 'Team Contact Name',
          'Team Contact Email', 'Notify on New Donation', 'Team Goal', 'Campaign'
        ]
      },
      {
        name: 'LinkClicks',
        headers: [
          'Timestamp', 'First Name', 'Last Name', 'Email', 'Link Clicked', 'Campaign', 'Amount'
        ]
      },
      {
        name: 'Fee_Config',
        headers: [
          'Method', 'Rate', 'Flat Fee'
        ]
      },`;

const r17 = `      {
        name: 'Transactions',
        headers: [
          'Timestamp', 'Reference', 'Amount Charged', 'Fees', 'Fund Charge', 'Net', 'Donor Name', 'Pledge ID',
          'Customer ID', 'Result', 'Method', 'Card Type', 'Payment #', 'Funded', 'Funded Date'
        ]
      },
      {
        name: 'Customers',
        headers: [
          'Customer ID', 'First Name', 'Last Name', 'Email', 'Phone',
          'Street', 'City', 'State', 'Zip', 'Created Date', 'Source'
        ]
      },
      {
        name: 'Scheduled Payments',
        headers: [
          'DateSubmitted', 'Recurring ID', 'Pledge ID', 'Customer ID', 'Donor Name',
          'USD Amount', 'Total Pledge', 'Frequency',
          'Count', 'Sequence', 'DateDue', 'Status', 'Transaction Ref'
        ]
      },
      {
        name: 'Teams',
        headers: [
          'Team ID', 'Team Name', 'Team Contact Name',
          'Team Contact Email', 'Notify on New Donation', 'Team Goal', 'Campaign'
        ]
      },
      {
        name: 'LinkClicks',
        headers: [
          'Click ID', 'Timestamp', 'First Name', 'Last Name', 'Email', 'Link Clicked', 'Campaign', 'Amount'
        ]
      },
      {
        name: 'Fee_Config',
        headers: [
          'Method', 'Rate', 'Flat Fee', 'Fund_Charge'
        ]
      },`;

replaceBlock('17. campaignTabs initializeSpreadsheets', s17, r17);

// Write patched Code.gs
fs.writeFileSync(filePath, code, 'utf8');

// Validate syntax
new vm.Script(code, { filename: filePath });
console.log('🎉 ALL 17 CODE.GS PATCHES APPLIED AND SYNTAX VERIFIED!');
