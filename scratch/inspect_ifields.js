const https = require('https');
https.get('https://cdn.cardknox.com/ifields/3.4.2602.2001/ifields.min.js', res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(data.substring(45500, 47000));
  });
});
