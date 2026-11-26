#!/usr/bin/env bash
# Publica o protótipo na Vercel (projeto hunt-taken) usando o token compartilhado da Maciel8.
set -euo pipefail
cd "$(dirname "$0")/.."
SHARED="$HOME/Projetos/Biel/.env.maciel8"
if [ -f "$SHARED" ]; then set -a; source "$SHARED"; set +a; fi
: "${VERCEL_TOKEN:?defina VERCEL_TOKEN}"
SCOPE=""; [ -n "${VERCEL_SCOPE:-}" ] && SCOPE="--scope $VERCEL_SCOPE"
printf '{"v":"%s"}' "$(date +%s)" > version.json
vercel link --yes --token "$VERCEL_TOKEN" $SCOPE --project hunt-taken >/dev/null
vercel deploy --prod --yes --token "$VERCEL_TOKEN" $SCOPE 2>&1 | grep -E "https://[a-z0-9.-]*vercel.app" | tail -1
echo "== projetos na conta"
vercel project ls --token "$VERCEL_TOKEN" $SCOPE 2>&1 | tail -n +1
