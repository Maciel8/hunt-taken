#!/usr/bin/env bash
# Deploy de pré-visualização na Vercel (não mexe na produção). Imprime a URL.
set -euo pipefail
cd "$(dirname "$0")/.."
SHARED="$HOME/Projetos/Biel/.env.maciel8"; if [ -f "$SHARED" ]; then set -a; source "$SHARED"; set +a; fi
SCOPE=""; [ -n "${VERCEL_SCOPE:-}" ] && SCOPE="--scope $VERCEL_SCOPE"
vercel deploy --yes --token "$VERCEL_TOKEN" $SCOPE 2>&1 | grep -oE "https://hunt-taken-[a-z0-9-]+\.vercel\.app" | tail -1
