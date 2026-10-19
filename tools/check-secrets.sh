#!/usr/bin/env bash
# Fails if anything that looks like an API key or private key is tracked in git.
# The repo is public (GitHub Pages), so a leaked key is a leaked key. Run before pushing;
# CI runs it on every push too.
set -euo pipefail
cd "$(dirname "$0")/.."
PATTERNS=(
  'AIza[0-9A-Za-z_-]{35}'                    # Google API keys (classic)
  'AQ\.[A-Za-z0-9_-]{40,}'                   # Google API keys (new format)
  'sk-(proj-)?[A-Za-z0-9_-]{20,}'            # OpenAI
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  '(api[_-]?key|secret|token)["'"'"']?\s*[:=]\s*["'"'"'][A-Za-z0-9_./+-]{24,}["'"'"']'
)
found=0
for p in "${PATTERNS[@]}"; do
  if git grep -n -I -E -e "$p" -- . ':!vendor' ':!tools/check-secrets.sh'; then found=1; fi
done
if [ "$found" -ne 0 ]; then
  echo "Possible secret found. Remove it, rotate the key, and keep keys in env/secrets only." >&2
  exit 1
fi
echo "No secrets found."
