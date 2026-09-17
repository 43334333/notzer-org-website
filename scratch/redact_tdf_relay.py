"""Remove production TDF credential patterns from ignored relay files without printing values."""
from pathlib import Path
import re

root = Path('.agent-relay')
for path in sorted(root.glob('*.md')):
    original = path.read_text(encoding='utf-8')
    cleaned, token_count = re.subn(r'\btdf_[0-9a-f]{32}\b', '[REDACTED: rotate token]', original, flags=re.I)
    if path.name.startswith('038-'):
        cleaned = re.sub(r'^\*\*Test Card\*\*:.*$', '**Test Card**: official TDF test card ending 6587 (details supplied by owner)', cleaned, flags=re.M)
        cleaned = re.sub(r'^\*\*Credentials\*\*:.*$', '**Credentials**: production Api-Key and Validation-Token used; values removed and token rotation required', cleaned, flags=re.M)
        cleaned = cleaned.replace('### 1. Execution Summary & Credential Isolation', '### 1. Execution Summary & Credential Handling')
        cleaned = cleaned.replace('The test card credentials and validation token were held purely in volatile process memory and **never written to disk, shell history, git repositories, sheets, or persistent logs**.', 'The test card and Validation-Token were exposed in the original relay and command transcript. This workspace relay is redacted; rotate the production token and review external transcript/artifact retention.')
        cleaned = cleaned.replace('The runner script immediately deleted itself post-execution (`Runner securely deleted`).', 'The runner was reported deleted after execution, but its source and command transcript contained the token; deletion does not erase those records.')
        if 'Security redaction note' not in cleaned:
            cleaned = '**Security redaction note (2026-09-17):** Live token and test-card details removed from this relay. The original command transcript and AGY artifacts require separate containment.\n\n' + cleaned
    if cleaned != original:
        path.write_text(cleaned, encoding='utf-8')
        print(f'{path.name}: redacted {token_count} token-pattern occurrence(s)')
