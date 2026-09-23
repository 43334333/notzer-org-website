import json
import urllib.request
from pathlib import Path

PROFILE = Path.home() / '.gemini/config/clasp-profiles/notzer_org.clasprc.json'

def get_token():
    profile = json.loads(PROFILE.read_text(encoding='utf-8'))
    return profile['tokens']['default']['access_token']

def check_spreadsheet(token, sheet_id, name):
    meta_url = f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}?fields=sheets.properties"
    req = urllib.request.Request(meta_url, headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            sheet_names = [s['properties']['title'] for s in data.get('sheets', [])]
            print(f"Spreadsheet '{name}' ({sheet_id}) sheets: {sheet_names}")
            if 'LinkClicks' in sheet_names:
                val_url = f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/LinkClicks!A1:Z5"
                v_req = urllib.request.Request(val_url, headers={'Authorization': f'Bearer {token}'})
                with urllib.request.urlopen(v_req) as v_resp:
                    v_data = json.loads(v_resp.read().decode('utf-8'))
                    print(f"  LinkClicks values: {v_data.get('values', [])}")
            else:
                print("  No LinkClicks sheet found")
    except Exception as e:
        print(f"Error checking {name}: {e}")

if __name__ == '__main__':
    token = get_token()
    MASTER_ID = '1w8Z265dphSMlc6GTkonYZ79rIEHh16DgFnXAQfgh0IE'
    check_spreadsheet(token, MASTER_ID, 'Master')
