const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('apps-script-backend/Code.gs', 'utf8');

function extract(name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('Missing ' + name);
  const tail = source.slice(start);
  const match = /\r?\n}\r?\n/.exec(tail);
  if (!match) throw new Error('Missing end for ' + name);
  return tail.slice(0, match.index + match[0].length);
}

const context = { TDF_SAFE_CODE_MESSAGES_: {} };
vm.createContext(context);
vm.runInContext(
  extract('sanitizeRequestId_') + '\n' +
  extract('formatSafeDiagnosticSummary_') + '\n' +
  extract('createDafGrant'),
  context
);

const panLike = '1234567890123456';
const pinLike = '1234';
const validReq = 'req-valid-uuid-5678';

const summaryWithPan = context.formatSafeDiagnosticSummary_(400, 0, 'PIN abc1234xyz', panLike);
const summaryWithPin = context.formatSafeDiagnosticSummary_(400, 0, 'raw message', pinLike);
const summaryWithValid = context.formatSafeDiagnosticSummary_(400, 0, 'raw message', validReq);

const base = {
  campaignId: 'kfw87', amount: 5, cardNumber: panLike,
  donorName: 'Security Probe', email: 'probe@example.com',
  submissionId: 'probe-1', cardPin: '1234'
};
const noToken = context.createDafGrant(base);
const honeypot = context.createDafGrant({ ...base, website: 'bot', turnstileToken: 'fake' });

const report = {
  summaryWithPan,
  includesRawMessage: summaryWithPan.includes('abc1234xyz'),
  includesPanLikeRequestId: summaryWithPan.includes(panLike),
  includesPinLikeRequestId: summaryWithPin.includes(pinLike),
  includesValidRequestId: summaryWithValid.includes(validReq),
  noTokenOutcome: noToken.outcome,
  honeypotOutcome: honeypot.outcome
};

console.log(JSON.stringify(report, null, 2));

if (
  report.includesPanLikeRequestId ||
  report.includesPinLikeRequestId ||
  !report.includesValidRequestId ||
  report.noTokenOutcome !== 'BOT_CHECK_FAILED' ||
  report.honeypotOutcome !== 'BOT_CHECK_FAILED'
) {
  console.error('FAIL: Verification checks did not pass expected security invariant.');
  process.exit(1);
}

console.log('SUCCESS: All security gates verified (zero secrets in diagnostic summary, fail-closed bot checks).');
