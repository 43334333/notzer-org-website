const fs = require('fs');
const vm = require('vm');

const filePath = 'apps-script-backend/Code.gs';
let code = fs.readFileSync(filePath, 'utf8');

function replaceExactlyOnce(target, replacement, label) {
  const count = code.split(target).length - 1;
  if (count === 0) {
    throw new Error(`Target not found for: ${label}`);
  }
  if (count > 1) {
    throw new Error(`Target found ${count} times (expected 1) for: ${label}`);
  }
  code = code.replace(target, replacement);
  console.log(`✅ Replaced: ${label}`);
}

// 1. Add getTransactionColMap_, ensureTransactionFundChargeCol_, buildTransactionRowArray_
// Place right before getTransactionsMaster_
const target1 = `// ============================================================
// TRANSACTIONS — READ FROM TAB 2 TRANSACTIONS
// ============================================================`;

const replacement1 = `// ============================================================
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

replaceExactlyOnce(target1, replacement1, 'Mapping helpers');

// Write back and validate syntax
fs.writeFileSync(filePath, code, 'utf8');
new vm.Script(code, { filename: filePath });
console.log('✅ Mapping helpers verified!');
