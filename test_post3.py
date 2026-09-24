import urllib.request, json
req = urllib.request.Request('https://www.usaepay.com/api/v2/transactions', method='POST')
req.add_header('Content-Type', 'application/json')
req.add_header('Authorization', 'Basic YWVTeWJtbWJnYWFOcFVRRU5kYzVTZEFPZ2RLOGhYaHc6czIvYWJjZGVmZ2hpai9iYjExMzQ1ODQzNzQyZGMyNjI1NWFiM2NkNjQwY2UzYTNiYjdjNTA5MDgwOTI2MGY2YmQ3Y2VlZDZhYmE5ZTFm')
data = json.dumps({'command': 'cc:authonly', 'amount': '5000.00', 'creditcard': {'number': '4111111111111111', 'expiration': '1225'}}).encode()
try:
    with urllib.request.urlopen(req, data=data) as f:
        print(f.read().decode())
except Exception as e:
    print(e.read().decode() if hasattr(e, 'read') else e)
