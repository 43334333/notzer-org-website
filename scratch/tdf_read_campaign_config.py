"""Read only kfw87 TDF config metadata from a Drive XLSX export in memory.

Never prints API keys, Validation-Tokens, or workbook contents.
"""
import io
import json
import os
import re
import sys
import urllib.request
import urllib.error
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

PROFILE = Path.home() / '.gemini/config/clasp-profiles/notzer_org.clasprc.json'
MASTER_ID = '1w8Z265dphSMlc6GTkonYZ79rIEHh16DgFnXAQfgh0IE'
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'p': 'http://schemas.openxmlformats.org/package/2006/relationships'}

def cell_text(cell, strings):
    kind = cell.get('t')
    if kind == 'inlineStr':
        return ''.join(node.text or '' for node in cell.findall('.//m:t', NS))
    value = cell.find('m:v', NS)
    if value is None:
        return ''
    return strings[int(value.text)] if kind == 's' else value.text or ''

def column_index(reference):
    letters = re.match(r'[A-Z]+', reference).group()
    number = 0
    for letter in letters:
        number = number * 26 + ord(letter) - ord('A') + 1
    return number - 1

def get_campaign_row():
    profile = json.loads(PROFILE.read_text(encoding='utf-8'))
    access_token = profile['tokens']['default']['access_token']
    url = f'https://www.googleapis.com/drive/v3/files/{MASTER_ID}/export?mimeType=application%2Fvnd.openxmlformats-officedocument.spreadsheetml.sheet'
    request = urllib.request.Request(url, headers={'Authorization': f'Bearer {access_token}'})
    try:
        with urllib.request.urlopen(request, timeout=35) as response:
            workbook_bytes = response.read()
    except urllib.error.HTTPError as error:
        try:
            detail = json.loads(error.read().decode('utf-8'))['error']
            raise RuntimeError(f'Drive export HTTP {error.code}: {detail.get("status", "unknown")} / {detail.get("message", "")[:180]}') from None
        except (KeyError, ValueError):
            raise RuntimeError(f'Drive export HTTP {error.code}') from None
    with zipfile.ZipFile(io.BytesIO(workbook_bytes)) as archive:
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        relationships = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        rels = {item.get('Id'): item.get('Target') for item in relationships.findall('p:Relationship', NS)}
        sheet_node = next((sheet for sheet in workbook.findall('m:sheets/m:sheet', NS) if sheet.get('name') == 'Campaigns'), None)
        if sheet_node is None:
            raise RuntimeError('Campaigns tab not found')
        target = rels[sheet_node.get(f"{{{NS['r']}}}id")].lstrip('/')
        sheet_path = target if target.startswith('xl/') else f'xl/{target}'
        strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared = ET.fromstring(archive.read('xl/sharedStrings.xml'))
            strings = [''.join(node.text or '' for node in item.findall('.//m:t', NS)) for item in shared.findall('m:si', NS)]
        sheet = ET.fromstring(archive.read(sheet_path))
        for row in sheet.findall('m:sheetData/m:row', NS):
            cells = {column_index(cell.get('r')): cell_text(cell, strings)
                     for cell in row.findall('m:c', NS)}
            if cells.get(0, '').strip().lower() == 'kfw87':
                return {
                    'rowNumber': int(row.get('r')),
                    'campaignId': cells.get(0),
                    'accountNumber': cells.get(23, ''),
                    'apiKey': cells.get(24, ''),
                    'validationToken': cells.get(25, ''),
                    'environment': cells.get(26, ''),
                }
    raise RuntimeError('kfw87 row not found')

if __name__ == '__main__':
    row = get_campaign_row()
    print(json.dumps({
        'rowNumber': row['rowNumber'],
        'campaignId': row['campaignId'],
        'accountNumber': row['accountNumber'],
        'apiKeyPresent': bool(row['apiKey']),
        'validationTokenPresent': bool(row['validationToken']),
        'environment': row['environment'],
    }, separators=(',', ':')))
