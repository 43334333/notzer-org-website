import urllib.request, urllib.parse, hashlib, time
source_key = 'aeSybmmbgaaNpUQENdc5SdAOgdK8hXhw'
pin = ''
seed = str(int(time.time())) + 'abcd'
prehash = f'{source_key}{seed}{pin}'
hash_val = 's2/' + seed + '/' + hashlib.sha256(prehash.encode()).hexdigest()

payload = {
    'UMkey': source_key,
    'UMhash': hash_val,
    'UMcommand': 'cc:sale',
    'UMamount': '5.00'
}

data = urllib.parse.urlencode(payload).encode()
req = urllib.request.Request('https://www.usaepay.com/gate', method='POST', data=data)
try:
    with urllib.request.urlopen(req) as f:
        print('NVP RESPONSE:', f.read().decode())
except Exception as e:
    if hasattr(e, 'read'):
        print(f'HTTP Error {e.code}: {e.read().decode()}')
