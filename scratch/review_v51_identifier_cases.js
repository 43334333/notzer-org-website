const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('apps-script-backend/Code.gs', 'utf8');
const context = { TDF_SAFE_CODE_MESSAGES_: {} };
vm.createContext(context);
vm.runInContext(source, context);

const candidates = [
  '1234567890123456',
  '1234-5678-9012-3456',
  '1234.5678.9012.3456',
  'req-1234',
  'f97f27a2-aa4a-4a81-b482-6170ab0062a7'
];
for (const value of candidates) {
  console.log(JSON.stringify({
    input: value,
    sanitized: context.sanitizeRequestId_(value),
    diagnostic: context.formatSafeDiagnosticSummary_(400, 0, 'PIN abc1234xyz', value)
  }));
}
