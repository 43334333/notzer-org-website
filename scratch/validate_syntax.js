const fs = require('fs');
const vm = require('vm');

const target = process.argv[2] || 'apps-script-backend/Code.gs';
try {
  const code = fs.readFileSync(target, 'utf8');
  new vm.Script(code, { filename: target });
  console.log(`✅ Syntax OK: ${target}`);
} catch (e) {
  console.error(`❌ Syntax ERROR: ${target}`);
  console.error(e.stack || e.message);
  process.exit(1);
}
