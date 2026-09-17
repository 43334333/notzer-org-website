import json
import urllib.error
import urllib.request
from pathlib import Path

profile = json.loads((Path.home() / '.gemini/config/clasp-profiles/notzer_org.clasprc.json').read_text(encoding='utf-8'))
token = profile['tokens']['default']['access_token']
url = 'https://docs.google.com/spreadsheets/d/1w8Z265dphSMlc6GTkonYZ79rIEHh16DgFnXAQfgh0IE/export?format=xlsx'
request = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
try:
    with urllib.request.urlopen(request, timeout=25) as response:
        print(json.dumps({'httpStatus': response.status, 'contentType': response.headers.get('Content-Type'), 'contentLength': response.headers.get('Content-Length')}))
except urllib.error.HTTPError as error:
    print(json.dumps({'httpStatus': error.code, 'contentType': error.headers.get('Content-Type')}))
