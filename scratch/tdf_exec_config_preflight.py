"""Attempt an authorized Apps Script execution call; print no credential values."""
import json
import urllib.error
import urllib.request
from pathlib import Path

profile = json.loads((Path.home() / '.gemini/config/clasp-profiles/notzer_org.clasprc.json').read_text(encoding='utf-8'))
token = profile['tokens']['default']['access_token']
script_id = '1mxRpjIV3FwC_cR9Y1lasxZitHNQp2xISdRWxGpbMiWipbrjw8otWDrCF'
url = f'https://script.googleapis.com/v1/scripts/{script_id}:run'
body = json.dumps({'function': 'getTdfConfig_', 'parameters': ['kfw87'], 'devMode': True}).encode()
request = urllib.request.Request(url, data=body, headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}, method='POST')
try:
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.load(response)
except urllib.error.HTTPError as error:
    detail = json.loads(error.read().decode('utf-8')).get('error', {})
    print(json.dumps({'httpStatus': error.code, 'status': detail.get('status'), 'message': str(detail.get('message', ''))[:180]}))
    raise SystemExit(1)
if 'error' in result:
    detail = result['error']
    print(json.dumps({'executionError': True, 'errorType': detail.get('type'), 'message': str(detail.get('message', ''))[:180]}))
    raise SystemExit(1)
value = result.get('response', {}).get('result', {})
print(json.dumps({'returned': bool(value), 'enabled': value.get('enabled'), 'environment': value.get('environment'), 'baseUrl': value.get('baseUrl'), 'charityAccountNumber': value.get('charityAccountNumber'), 'apiKeyPresent': bool(value.get('apiKey')), 'validationTokenPresent': bool(value.get('validationToken'))}))
