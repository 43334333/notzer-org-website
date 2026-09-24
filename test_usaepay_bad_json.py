import urllib.request, json, base64
source_key = 'aeSybmmbgaaNpUQENdc5SdAOgdK8hXhw'
api_hash = 's2/abcdefghij/bb11345843742dc26255ab3cd640ce3a3bb7c5090809260f6bd7ceed6aba9e1f'
auth_header = 'Basic ' + base64.b64encode(f'{source_key}:{api_hash}'.encode()).decode()
req = urllib.request.Request('https://www.usaepay.com/api/v2/transactions', method='POST')
req.add_header('Content-Type', 'application/json')
req.add_header('Authorization', auth_header)
try:
    with urllib.request.urlopen(req, data=b'[{] BAD JSON') as f:
        print(f.read().decode())
except Exception as e:
    if hasattr(e, 'read'):
        print(f'HTTP Error {e.code}: {e.read().decode()}')
