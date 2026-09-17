#!/usr/bin/env bash
# One-shot TDF sandbox /Create contract probe. Never targets production.
# Usage: bash scratch/test_tdf_sandbox.sh [amount]
# Credentials, card, and CVV are requested interactively; never paste them into a command line.
set -euo pipefail
set +x
umask 077

base_url='https://api.tdfcharitable.org/thedonorsfund/integration'
account_number='2578754'
amount="${1:-1.00}"

command -v python3 >/dev/null || { printf 'python3 is required.\n' >&2; exit 1; }
command -v curl >/dev/null || { printf 'curl is required.\n' >&2; exit 1; }
python3 - "$amount" <<'PY'
from decimal import Decimal, InvalidOperation
import sys
try:
    amount = Decimal(sys.argv[1])
except InvalidOperation:
    sys.exit('Amount must be a decimal number.')
if not (Decimal('0') < amount <= Decimal('5')) or amount.as_tuple().exponent < -2:
    sys.exit('Amount must be greater than $0, at most $5, with no more than two decimal places.')
PY

api_key="${TDF_SANDBOX_API_KEY:-}"
validation_token="${TDF_SANDBOX_VALIDATION_TOKEN:-}"
if [[ ! -t 0 ]]; then
  printf 'Run interactively to enter sandbox credentials, test card, and CVV. No request sent.\n' >&2
  exit 1
fi
if [[ -z "$api_key" ]]; then
  read -r -p 'TDF sandbox Api-Key: ' api_key
fi
if [[ -z "$validation_token" ]]; then
  read -r -s -p 'TDF sandbox Validation-Token: ' validation_token
  printf '\n'
fi
if [[ ! "$api_key" =~ ^[A-Za-z0-9_-]+$ || ! "$validation_token" =~ ^[A-Za-z0-9_-]+$ ]]; then
  printf 'Sandbox Api-Key and Validation-Token must be set to valid values. No request sent.\n' >&2
  exit 1
fi

read -r -s -p 'TDF sandbox test card number: ' card_number
printf '\n'
read -r -s -p 'TDF sandbox test card CVV: ' card_cvv
printf '\n'
if [[ ! "$card_number" =~ ^[0-9]{16}$ || ! "$card_cvv" =~ ^[0-9]{3,4}$ ]]; then
  printf 'Expected a 16-digit card and a 3- or 4-digit CVV. No request sent.\n' >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'unset card_number card_cvv TDF_TEST_CARD TDF_TEST_CVV TDF_SANDBOX_VALIDATION_TOKEN; rm -f "$tmp_dir/response.json" "$tmp_dir/curl.conf"; rmdir "$tmp_dir"' EXIT

export TDF_TEST_CARD="$card_number" TDF_TEST_CVV="$card_cvv"
unset card_number card_cvv
emit_payload() {
python3 - "$account_number" "$amount" <<'PY'
import json, os, sys
payload = {
    'accountNumber': sys.argv[1],
    'amount': float(sys.argv[2]),
    'donor': os.environ['TDF_TEST_CARD'],
    'donorAuthorization': os.environ['TDF_TEST_CVV'],
    'purposeType': 'Other',
    'purposeNote': 'Notzer Chesed controlled sandbox integration test',
}
print(json.dumps(payload, separators=(',', ':')))
PY
}

cat >"$tmp_dir/curl.conf" <<EOF
url = "$base_url/Create"
request = "POST"
header = "Accept: application/json"
header = "Content-Type: application/json"
header = "Api-Key: $api_key"
header = "Validation-Token: $validation_token"
EOF
unset api_key validation_token

printf 'Submitting one %s USD grant to account %s on TDF SANDBOX only. No automatic retry.\n' "$amount" "$account_number"
if ! http_status="$(emit_payload | curl --silent --show-error --max-time 30 --output "$tmp_dir/response.json" --write-out '%{http_code}' --config "$tmp_dir/curl.conf" --data-binary @-)"; then
  printf 'Transport failure; outcome may be unknown. Do not retry until TDF confirms status.\n' >&2
  exit 2
fi
unset TDF_TEST_CARD TDF_TEST_CVV

python3 - "$tmp_dir/response.json" "$http_status" <<'PY'
import json, re, sys
status = sys.argv[2]
try:
    with open(sys.argv[1], encoding='utf-8') as f:
        body = json.load(f)
except (OSError, ValueError):
    print(json.dumps({'httpStatus': status, 'body': 'non-JSON or empty', 'outcome': 'unresolved'}))
    sys.exit(2)
if not isinstance(body, dict):
    print(json.dumps({'httpStatus': status, 'bodyType': type(body).__name__, 'outcome': 'unresolved'}))
    sys.exit(2)
nested = body.get('data') if isinstance(body.get('data'), dict) else {}
confirmation = nested.get('confirmationNumber') or body.get('confirmationNumber')
transaction = nested.get('transactionId') or body.get('transactionId')
safe_confirmation = str(confirmation) if confirmation is not None and re.fullmatch(r'\d{1,12}', str(confirmation)) else None
safe_transaction = str(transaction) if transaction is not None and re.fullmatch(r'[0-9a-fA-F-]{36}', str(transaction)) else None
error_code = body.get('errorCode')
result = {
    'httpStatus': status,
    'responseKeys': sorted(body.keys()),
    'dataKeys': sorted(nested.keys()),
    'statusCode': body.get('statusCode') if isinstance(body.get('statusCode'), int) else None,
    'errorCode': error_code if isinstance(error_code, int) else None,
    'confirmationNumber': safe_confirmation,
    'transactionId': safe_transaction,
    'outcome': 'confirmed_accepted' if status.startswith('2') and safe_confirmation and not body.get('error') and not error_code else 'unresolved_or_rejected',
}
print(json.dumps(result, separators=(',', ':')))
if result['outcome'] != 'confirmed_accepted':
    print('Do not automatically retry. Check TDF grant status before any second submission.', file=sys.stderr)
    sys.exit(2)
PY
