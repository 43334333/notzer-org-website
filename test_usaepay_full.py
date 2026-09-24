import urllib.request, json, base64

source_key = 'aeSybmmbgaaNpUQENdc5SdAOgdK8hXhw'
api_hash = 's2/abcdefghij/bb11345843742dc26255ab3cd640ce3a3bb7c5090809260f6bd7ceed6aba9e1f'
auth_header = 'Basic ' + base64.b64encode(f'{source_key}:{api_hash}'.encode()).decode()

payload = {
    'command': 'cc:sale',
    'amount': '5.00',
    'creditcard': {
        'number': '4111111111111111',  # Standard Visa Test Card
        'expiration': '1225'
    }
}

req = urllib.request.Request('https://www.usaepay.com/api/v2/transactions', method='POST')
req.add_header('Content-Type', 'application/json')
req.add_header('Authorization', auth_header)

print('--- RAW REQUEST TO USAEPAY ---')
print(f'POST https://www.usaepay.com/api/v2/transactions')
print(f'Authorization: {auth_header[:25]}...[REDACTED]')
print(f'Payload: {json.dumps(payload, indent=2)}')
print('\n--- RAW RESPONSE FROM USAEPAY ---')

try:
    with urllib.request.urlopen(req, data=json.dumps(payload).encode()) as f:
        print(f.read().decode())
except Exception as e:
    if hasattr(e, 'read'):
        print(f'HTTP Error {e.code}: {e.read().decode()}')
    else:
        print(e)
