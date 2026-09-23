const https = require('https');

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzngv-LEqoOercDK5MfRtB8BpEFhH3sdnq16lyxzq2LN_8W0lUQpa-oUZB4CfGYE28y3g/exec';

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return resolve(fetchJson(res.headers.location));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({ error: 'Failed to parse JSON', raw: data });
                }
            });
        }).on('error', reject);
    });
}

async function run() {
    console.log('Calling fixMasterSheetHeadersAndGoal:');
    const res = await fetchJson(`${SCRIPT_URL}?action=fixMasterSheetHeadersAndGoal&adminKey=5786`);
    console.log(JSON.stringify(res, null, 2));

    console.log('\nQuerying getFeeConfigDefaults:');
    const defaults = await fetchJson(`${SCRIPT_URL}?action=getFeeConfigDefaults`);
    console.log(JSON.stringify(defaults, null, 2));
}

run().catch(console.error);
