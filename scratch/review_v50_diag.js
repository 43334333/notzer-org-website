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
vm.runInContext(extract('formatSafeDiagnosticSummary_') + '\n' + extract('createDafGrant'), context);
const panLike = '1234567890123456';
const summary = context.formatSafeDiagnosticSummary_(400, 0, 'PIN abc1234xyz', panLike);
const base = {
  campaignId: 'kfw87', amount: 5, cardNumber: panLike,
  donorName: 'Security Probe', email: 'probe@example.com',
  submissionId: 'probe-1', cardPin: '1234'
};
const noToken = context.createDafGrant(base);
const honeypot = context.createDafGrant({ ...base, website: 'bot', turnstileToken: 'fake' });
console.log(JSON.stringify({summary, includesRawMessage: summary.includes('abc1234xyz'), includesPanLikeRequestId: summary.includes(panLike), noTokenOutcome: noToken.outcome, honeypotOutcome: honeypot.outcome}));
if (noToken.outcome !== 'BOT_CHECK_FAILED' || honeypot.outcome !== 'BOT_CHECK_FAILED' || !summary.includes(panLike)) process.exit(1);
