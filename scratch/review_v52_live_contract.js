const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync('apps-script-backend/Code.gs', 'utf8');
const context = { Logger: { log() {} } };
vm.createContext(context);
vm.runInContext(source, context);

let capturedPayload;
context.TdfClient_._request = (_config, method, endpoint, payload) => {
  if (endpoint === '/Create') {
    capturedPayload = payload;
    return { status: 200, body: JSON.stringify({
      data: { confirmationNumber: 130561871, transactionId: null, status: 'Approved' },
      error: null, errorCode: 0, statusCode: 200
    }) };
  }
  if (endpoint === '/Grant/Details/130561871') {
    return { status: 200, body: JSON.stringify({
      amount: 1, charity: 'NOTZER CHESED', grantStatus: 'Approved', confirmationNumber: 130561871
    }) };
  }
  throw new Error('Unexpected endpoint ' + endpoint);
};
const result = context.TdfClient_.createGrant(
  { baseUrl: 'https://example.invalid', charityAccountNumber: '2578754' },
  { cardNumber: '6599000000000000', cardPin: '111', amount: 1, designation: 'Notzer Chesed controlled test' }
);
assert.strictEqual(result.outcome, 'CONFIRMED_ACCEPTED');
assert.strictEqual(result.confirmationNumber, '130561871');
assert.strictEqual(result.transactionId, '');
assert.strictEqual(capturedPayload.accountNumber, '2578754');
assert.strictEqual(capturedPayload.amount, 1);
assert.deepStrictEqual(Object.keys(capturedPayload).sort(), ['accountNumber','amount','donor','donorAuthorization','purposeNote','purposeType'].sort());
const details = context.TdfClient_.getGrantDetails({}, '130561871');
assert.strictEqual(details.status, 'Approved');
console.log(JSON.stringify({ createOutcome: result.outcome, confirmationNumber: result.confirmationNumber, detailsStatus: details.status, requestFields: Object.keys(capturedPayload) }));
