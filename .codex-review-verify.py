from pathlib import Path
import re, subprocess, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def lines(path):
    return Path(path).read_text(encoding='utf-8', errors='replace').splitlines()

code = lines('apps-script-backend/Code.gs')
print('--- master key helper ---')
for i in range(45, 58):
    safe = re.sub(r"(['\"])[A-Za-z0-9_-]{12,}\1", r"\1[REDACTED]\1", code[i-1].strip())
    print(f'{i}: {safe}')

print('--- protected route positions ---')
for a,b in [(140,180),(255,278),(575,600)]:
    for i in range(a,b+1):
        line=code[i-1]
        if line.strip(): print(f'{i}: {line.strip()}')

print('--- literal 5786 occurrences outside .git ---')
for p in Path('.').rglob('*'):
    if not p.is_file() or '.git' in p.parts or p.name.startswith('.codex-review'):
        continue
    try: text=p.read_text(encoding='utf-8', errors='ignore')
    except OSError: continue
    for n,line in enumerate(text.splitlines(),1):
        if '5786' in line:
            print(f'{p.as_posix()}:{n}:{line.strip()[:200]}')
