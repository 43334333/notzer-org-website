const https = require('https');
https.get('https://cdn.cardknox.com/ifields/3.4.2602.2001/ifield.htm', res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('ifield.htm length:', data.length);
    // Find scripts or logic inside ifield.htm
    console.log(data.substring(0, 1500));
  });
});
