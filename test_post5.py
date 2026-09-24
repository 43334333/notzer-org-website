import urllib.request, json, base64
fake_auth = base64.b64encode(b'FakeKey1234567890123456789012345:s2/abcdefghij/90b').decode('utf-8')
req = urllib.request.Request('https://www.usaepay.com/api/v2/transactions', method='POST')
req.add_header('Content-Type', 'application/json')
req.add_header('Authorization', 'Basic ' + fake_auth)
data = json.dumps({'command': 'cc:sale', 'amount': '5000.00', 'creditcard': {'number': '4111111111111111', 'expiration': '1225'}}).encode()
try:
    with urllib.request.urlopen(req, data=data) as f:
        print(f.read().decode())
except Exception as e:
    print(e.read().decode() if hasattr(e, 'read') else e)
