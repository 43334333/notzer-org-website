const https = require('https');
https.get('https://cdn.cardknox.com/ifields/3.4.2602.2001/ifield-engine.min.js', res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    let idx = data.indexOf('donors');
    console.log(data.substring(Math.max(0, idx - 400), Math.min(data.length, idx + 400)));
  });
});
