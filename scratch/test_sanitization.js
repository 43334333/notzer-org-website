const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync('apps-script-backend/Code.gs', 'utf8');
const sandbox = {
  console: console,
  Logger: { log: console.log },
  Utilities: { formatDate: () => '20260917', getUuid: () => 'test-uuid' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'test-secret' }) },
  CacheService: {
    getScriptCache: () => {
      const store = {};
      return {
        get: (k) => store[k] || null,
        put: (k, v, exp) => { store[k] = String(v); }
      };
    }
  }
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

// 1. Test sanitizeRequestId_ directly
const tests = [
  { input: '1234567890123456', expected: '', desc: '16-digit PAN' },
  { input: '4111111111111', expected: '', desc: '13-digit PAN' },
  { input: '1234567890123456789', expected: '', desc: '19-digit PAN' },
  { input: '1234', expected: '', desc: '4-digit PIN' },
  { input: '123', expected: '', desc: '3-digit PIN' },
  { input: 'card-1234567890123456', expected: '', desc: 'Embedded PAN in string' },
  { input: 'bad req; drop', expected: '', desc: 'Illegal characters' },
  { input: 'a'.repeat(65), expected: '', desc: 'Over length limit' },
  { input: 'f97f27a2-aa4a-4a81-b482-6170ab0062a7', expected: 'f97f27a2-aa4a-4a81-b482-6170ab0062a7', desc: 'Valid UUID' },
  { input: '0HN4B9L2K8P01:00000001', expected: '0HN4B9L2K8P01:00000001', desc: 'Valid ASP.NET Trace ID' },
  { input: 'req-abc_123.test', expected: 'req-abc_123.test', desc: 'Valid opaque request ID' },
  { input: '', expected: '', desc: 'Empty input' },
  { input: null, expected: '', desc: 'Null input' }
];

for (const t of tests) {
  const actual = sandbox.sanitizeRequestId_(t.input);
  assert.strictEqual(actual, t.expected, `Failed on ${t.desc}: got "${actual}", expected "${t.expected}"`);
  console.log(`[PASS] sanitizeRequestId_: ${t.desc} -> "${actual}"`);
}

// 2. Test formatSafeDiagnosticSummary_ with PAN/PIN requestId
const diagWithPan = sandbox.formatSafeDiagnosticSummary_(400, 0, 'PIN abc1234xyz', '1234567890123456');
assert.ok(!diagWithPan.includes('1234567890123456'), 'PAN must NOT be in diagnostic summary');
assert.ok(!diagWithPan.includes('Req:'), 'Req: must NOT be added for rejected PAN');
console.log('[PASS] formatSafeDiagnosticSummary_ with PAN requestId rejected successfully:', diagWithPan);

const diagWithPin = sandbox.formatSafeDiagnosticSummary_(400, 0, 'raw', '1234');
assert.ok(!diagWithPin.includes('1234'), 'PIN must NOT be in diagnostic summary');
assert.ok(!diagWithPin.includes('Req:'), 'Req: must NOT be added for rejected PIN');
console.log('[PASS] formatSafeDiagnosticSummary_ with PIN requestId rejected successfully:', diagWithPin);

const diagWithValidReq = sandbox.formatSafeDiagnosticSummary_(400, 0, 'raw', 'req-valid-uuid-1234');
assert.ok(diagWithValidReq.includes('Req: req-valid-uuid-1234'), 'Valid opaque request ID must be retained');
console.log('[PASS] formatSafeDiagnosticSummary_ with valid request ID retained successfully:', diagWithValidReq);

console.log('\nALL REQUEST ID SANITIZATION TESTS PASSED CLEANLY.');
