const fs = require('fs');

const content = fs.readFileSync('apps-script-backend/Code.gs', 'utf8');
console.log('Includes CRLF?', content.includes('\r\n'));
console.log('Includes LF only?', !content.includes('\r\n') && content.includes('\n'));
