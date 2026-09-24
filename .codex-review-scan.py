from pathlib import Path
import re
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

root = Path('.')
paths = sorted(root.rglob('Code.gs'))
print('--- Code.gs files ---')
for p in paths:
    print(p.as_posix(), p.stat().st_size)

patterns = [
    r"action\s*===?\s*['\"]setProperty['\"]",
    r"5786",
    r"processBookkeeperPayment",
    r"action\s*===?\s*['\"]getFeeConfig['\"]",
    r"function\s+getCampaigns\s*\(",
    r"usaepayPin|fallbackCkServerKey|cardknoxKey|serverKey",
]
for p in paths:
    lines = p.read_text(encoding='utf-8', errors='replace').splitlines()
    print(f'--- matches: {p.as_posix()} ---')
    for pat in patterns:
        hits = [(i + 1, line.strip()) for i, line in enumerate(lines) if re.search(pat, line, re.I)]
        print(pat, 'count=', len(hits), 'lines=', [n for n, _ in hits[:20]])

    for marker in ('function doGet(', 'function doPost(', 'function getCampaigns('):
        starts = [i for i, line in enumerate(lines) if marker in line]
        for start in starts[:3]:
            print(f'### {marker} at {start+1}')
            limit = min(len(lines), start + (220 if marker == 'function doGet(' else 140))
            for i in range(start, limit):
                line = lines[i]
                if any(x.lower() in line.lower() for x in ('setproperty', 'processbookkeeperpayment', 'getfeeconfig', 'getcampaigns', 'usaepaypin', 'fallbackckserverkey', 'cardknoxkey', 'serverkey', 'super_admin')):
                    safe = re.sub(r"(adminKey\s*===?\s*)(['\"])[^'\"]+\2", r"\1\2[REDACTED]\2", line.strip())
                    safe = re.sub(r"(['\"])[A-Za-z0-9_-]{24,}\1", r"\1[REDACTED]\1", safe)
                    print(f'{i+1}: {safe}')

    for a, b, label in ((330, 405, 'doPost auth area'), (1508, 1640, 'getCampaigns area')):
        if len(lines) < a:
            continue
        print(f'### {label} {a}-{min(b, len(lines))}')
        for i in range(a - 1, min(b, len(lines))):
            line = lines[i]
            if line.strip():
                safe = re.sub(r"(adminKey\s*===?\s*)(['\"])[^'\"]+\2", r"\1\2[REDACTED]\2", line.rstrip())
                safe = re.sub(r"(['\"])[A-Za-z0-9_-]{24,}\1", r"\1[REDACTED]\1", safe)
                print(f'{i+1}: {safe}')
