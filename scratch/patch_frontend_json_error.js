const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const files = [
  'templates/donation-page/template.html',
  'campaigns/kfw87/index.html',
  'keren-hk-m-twersky.html',
  'keren-shlomo-yechiel.html'
];

function patchFile(relPath) {
  const filePath = path.join(repoRoot, relPath);
  let content = fs.readFileSync(filePath, 'utf8');

  const oldBlock = `return res.json().catch(function() { return { status: 'success' }; });
        }).then(function(json) {
            if (json && json.status === 'error') {
                throw new Error(json.message || 'Server error logging link click');
            }
            return json;`;

  const oldBlockCRLF = oldBlock.replace(/\n/g, '\r\n');

  const newBlock = `return res.json().catch(function() {
                throw new Error('Invalid server response (non-JSON)');
            });
        }).then(function(json) {
            if (!json || json.status === 'error') {
                throw new Error((json && json.message) || 'Server error logging link click');
            }
            return json;`;

  if (content.includes(oldBlock)) {
    content = content.replace(oldBlock, newBlock);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[OK] Patched (LF) ${relPath}`);
  } else if (content.includes(oldBlockCRLF)) {
    content = content.replace(oldBlockCRLF, newBlock.replace(/\n/g, '\r\n'));
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[OK] Patched (CRLF) ${relPath}`);
  } else {
    console.warn(`[WARN] Could not find oldBlock in ${relPath}`);
  }
}

files.forEach(patchFile);
