import urllib.request
req = urllib.request.Request('https://www.usaepay.com/api/v2/customers', method='GET')
req.add_header('Authorization', 'Basic YWVTeWJtbWJnYWFOcFVRRU5kYzVTZEFPZ2RLOGhYaHc6czIvYWJjZGVmZ2hpai9iYjExMzQ1ODQzNzQyZGMyNjI1NWFiM2NkNjQwY2UzYTNiYjdjNTA5MDgwOTI2MGY2YmQ3Y2VlZDZhYmE5ZTFm')
try:
    with urllib.request.urlopen(req) as f:
        print(f.read().decode())
except Exception as e:
    print(e.read().decode() if hasattr(e, 'read') else e)
