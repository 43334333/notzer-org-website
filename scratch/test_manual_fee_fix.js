const assert = require('assert');

function resolveFeeScheduleEntry_(method, schedule) {
  if (!schedule || typeof schedule !== 'object') return null;

  var ml = (method || '').toLowerCase().trim();
  if (!ml) return null;

  // 1. DAF Brand mappings (from Cardknox xCardType or user input)
  // The Donors Fund
  if (ml.includes('donors') || ml.includes('tdf')) {
    if (schedule['DAF - The Donors Fund']) return schedule['DAF - The Donors Fund'];
    if (schedule['The Donors Fund']) return schedule['The Donors Fund'];
    if (schedule['DonorsFund']) return schedule['DonorsFund'];
    if (schedule['DAF']) return schedule['DAF'];
  }

  // OJC Fund
  if (ml.includes('ojc')) {
    if (schedule['DAF - OJCF']) return schedule['DAF - OJCF'];
    if (schedule['DAF - OJC']) return schedule['DAF - OJC'];
    if (schedule['OJC Fund']) return schedule['OJC Fund'];
    if (schedule['OJCF']) return schedule['OJCF'];
    if (schedule['OJC']) return schedule['OJC'];
    if (schedule['DAF']) return schedule['DAF'];
  }

  // Pledger
  if (ml.includes('pledger')) {
    if (schedule['DAF - Pledger']) return schedule['DAF - Pledger'];
    if (schedule['Pledger']) return schedule['Pledger'];
    if (schedule['DAF']) return schedule['DAF'];
  }

  // Matbia (DAF or payment method) - 'DAF - Matbia' takes precedence over 'Matbia'
  if (ml.includes('matbia')) {
    if (schedule['DAF - Matbia']) return schedule['DAF - Matbia'];
    if (schedule['Matbia']) return schedule['Matbia'];
    if (schedule['DAF']) return schedule['DAF'];
  }

  // Generic DAF fallback
  if (ml.startsWith('daf')) {
    if (schedule['DAF']) return schedule['DAF'];
    for (var k in schedule) {
      if (k.toLowerCase().startsWith('daf')) return schedule[k];
    }
  }

  // 2. Direct exact match
  if (schedule[method]) return schedule[method];

  // 3. Case-insensitive direct match
  for (var key in schedule) {
    if (key.toLowerCase().trim() === ml) {
      return schedule[key];
    }
  }

  // 4. Manual and offline payment handling
  // If no explicit 'Manual' row exists, fall back to 'Other' or standard zero-fee offline defaults
  if (ml === 'manual' || ml.includes('manual') || ml === 'offline') {
    if (schedule['Manual']) return schedule['Manual'];
    if (schedule['Other']) return schedule['Other'];
    var fallbackFc = (schedule['Other'] && schedule['Other'].fundCharge !== undefined && schedule['Other'].fundCharge !== null)
      ? schedule['Other'].fundCharge : 0.01;
    return { rate: 0.00, flat: 0.00, fundCharge: fallbackFc };
  }

  // 5. Standard Credit / Debit Card brand & card type detection
  // Specifically matches card numbers/prefixes (/^\d/), major brands, and card descriptors.
  var isCardMethod = /^\d/.test(ml) ||
    ml.includes('visa') || ml.includes('mastercard') || ml.includes('mc') ||
    ml.includes('amex') || ml.includes('american express') ||
    ml.includes('discover') || ml.includes('diners') || ml.includes('jcb') ||
    ml.includes('unionpay') || ml.includes('carte blanche') || ml.includes('maestro') ||
    ml.includes('card') || ml.includes('credit') || ml.includes('debit') || ml.includes('prepaid');

  var isDafMethod = ml.includes('donors') || ml.includes('tdf') || ml.includes('ojc') ||
                    ml.includes('pledger') || ml.includes('matbia') || ml.startsWith('daf');

  // General credit/debit card types processed via Cardknox/Sola/USAePay fall back to campaign's Credit Card rate.
  // DAF cards are strictly excluded from this fallback and require explicit DAF fee rules.
  if (isCardMethod && !isDafMethod) {
    if (schedule['Credit Card']) return schedule['Credit Card'];
    if (schedule['Cardknox']) return schedule['Cardknox'];
    if (schedule['USAePay']) return schedule['USAePay'];
  }

  return null;
}

function calculateFee(method, amount, schedule) {
  var amt = parseFloat(amount) || 0;
  if (amt <= 0) return 0;
  var entry = resolveFeeScheduleEntry_(method, schedule);
  if (!entry) {
    throw new Error('No fee schedule entry configured for payment method: "' + method + '"');
  }
  return Math.round((amt * entry.rate + entry.flat) * 100) / 100;
}

function calculateFundCharge(method, amount, schedule) {
  var amt = parseFloat(amount) || 0;
  if (amt <= 0) return 0;
  var entry = resolveFeeScheduleEntry_(method, schedule);
  if (!entry) {
    throw new Error('No fee schedule entry configured for payment method: "' + method + '"');
  }
  var rate = (entry.fundCharge !== undefined && entry.fundCharge !== null) ? entry.fundCharge : 0.01;
  return Math.round(amt * rate * 100) / 100;
}

// Standard schedule WITHOUT 'Manual' row (representative schedule from live sheets)
const standardSchedule = {
  'Credit Card': { rate: 0.03, flat: 0.30, fundCharge: 0.01 },
  'Cardknox': { rate: 0.03, flat: 0.30, fundCharge: 0.01 },
  'Check': { rate: 0.00, flat: 0.00, fundCharge: 0.01 },
  'Zelle': { rate: 0.00, flat: 0.00, fundCharge: 0.01 },
  'PayPal': { rate: 0.029, flat: 0.30, fundCharge: 0.01 },
  'Wire Transfer': { rate: 0.00, flat: 0.00, fundCharge: 0.01 },
  'Cash': { rate: 0.00, flat: 0.00, fundCharge: 0.01 },
  'Other': { rate: 0.00, flat: 0.00, fundCharge: 0.01 }
};

// 1. Manual on standard schedule without Manual row
const feeManual = calculateFee('Manual', 100, standardSchedule);
const fcManual = calculateFundCharge('Manual', 100, standardSchedule);
console.log('Manual fee on $100:', feeManual, 'Fund charge:', fcManual);
assert.strictEqual(feeManual, 0.00, 'Manual fee must be 0.00, NOT 3.30!');
assert.strictEqual(fcManual, 1.00, 'Manual fund charge must be 1.00');

// 2. Offline receipt with omitted/empty method -> 'Manual'
const methodOmitted = '' || 'Manual';
const feeOmitted = calculateFee(methodOmitted, 100, standardSchedule);
const fcOmitted = calculateFundCharge(methodOmitted, 100, standardSchedule);
console.log('Omitted method fee on $100:', feeOmitted, 'Fund charge:', fcOmitted);
assert.strictEqual(feeOmitted, 0.00);
assert.strictEqual(fcOmitted, 1.00);

// 3. Other and Wire Transfer get $0 fee
assert.strictEqual(calculateFee('Other', 100, standardSchedule), 0.00);
assert.strictEqual(calculateFee('Wire Transfer', 100, standardSchedule), 0.00);

// 4. CorporateCard gets credit card fee ($3.30)
assert.strictEqual(calculateFee('CorporateCard', 100, standardSchedule), 3.30);
assert.strictEqual(calculateFundCharge('CorporateCard', 100, standardSchedule), 1.00);

// 5. Unconfigured DAF card (Pledger) throws fail-closed
assert.throws(() => {
  calculateFee('Pledger', 100, standardSchedule);
}, /No fee schedule entry configured for payment method: "Pledger"/);

// 6. Unknown method throws fail-closed
assert.throws(() => {
  calculateFee('SomeUnknownMethod', 100, standardSchedule);
}, /No fee schedule entry configured for payment method: "SomeUnknownMethod"/);

// 7. Explicit 'Manual' row with custom rate takes precedence
const customSchedule = {
  ...standardSchedule,
  'Manual': { rate: 0.01, flat: 0.50, fundCharge: 0.02 }
};
assert.strictEqual(calculateFee('Manual', 100, customSchedule), 1.50);
assert.strictEqual(calculateFundCharge('Manual', 100, customSchedule), 2.00);

console.log('All assertions PASSED successfully!');
