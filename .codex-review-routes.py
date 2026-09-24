from pathlib import Path
import re, sys, hashlib
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

for rel in ['apps-script-backend/Code.gs', 'apps-script-backend/.clasp-master/Code.gs', 'apps-script-backend/deploy-gas.ps1']:
    p = Path(rel)
    if not p.exists():
        continue
    print(f'--- {rel} sha256={hashlib.sha256(p.read_bytes()).hexdigest()[:16]} ---')
    lines = p.read_text(encoding='utf-8', errors='replace').splitlines()
    if rel.endswith('Code.gs'):
        ranges = [(45,290), (310,370), (570,610), (1465,1600)]
        terms = ('setProperty', 'adminKey', 'getFeeConfig', 'processBookkeeperPayment', 'authenticateRequest',
                 'authenticateFromPost', 'getCampaigns', 'isSuper', 'cardknoxServerKey', 'usaepaySourceKey',
                 'usaepayPin', 'fallbackCkServerKey', 'fallbackUeSourceKey', 'fallbackUePin', 'wallKey')
    else:
        ranges = [(1, len(lines))]
        terms = ('Code.gs', '.clasp-master', 'Copy-Item', 'clasp push', '--rootDir')
    seen = set()
    for a,b in ranges:
        for i in range(max(a-1,0), min(b,len(lines))):
            if i in seen or not any(t.lower() in lines[i].lower() for t in terms):
                continue
            seen.add(i)
            safe = re.sub(r"(adminKey\s*===?\s*)(['\"])[^'\"]+\2", r"\1\2[REDACTED]\2", lines[i].strip())
            safe = re.sub(r"(['\"])[A-Za-z0-9_-]{24,}\1", r"\1[REDACTED]\1", safe)
            print(f'{i+1}: {safe}')
