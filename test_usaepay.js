const crypto = require('crypto');
const sourceKey = 'aeSybmmbgaaNpUQENdc5SdAOgdK8hXhw';
const pin = '';
const seed = 'abcdefghij';
const prehash = sourceKey + seed + pin;
const apihash = 's2/' + seed + '/' + crypto.createHash('sha256').update(prehash).digest('hex');
const authKey = Buffer.from(sourceKey + ':' + apihash).toString('base64');
console.log('Auth header:', 'Basic ' + authKey);
