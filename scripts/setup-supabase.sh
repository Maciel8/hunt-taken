#!/usr/bin/env bash
# Cria (ou reusa) o projeto hunt-taken no Supabase da organização Maciel8, aplica as migrations e grava as chaves em .env.local.
set -euo pipefail
cd "$(dirname "$0")/.."
SHARED="$HOME/Projetos/Biel/.env.maciel8"; if [ -f "$SHARED" ]; then set -a; source "$SHARED"; set +a; fi
: "${SUPABASE_ACCESS_TOKEN:?}" "${SUPABASE_DB_PASSWORD:?}" "${SUPABASE_ORG_ID:?}"
export SUPABASE_ACCESS_TOKEN
NAME="hunt-taken"; REGION="${SUPABASE_REGION:-sa-east-1}"
REF=$(supabase projects list -o json | jq -r --arg n "$NAME" '(if type=="object" then .projects else . end)[] | select(.name==$n) | .id' | head -1)
if [ -z "$REF" ]; then
  echo "Criando projeto $NAME em $REGION (org $SUPABASE_ORG_ID)..."
  supabase projects create "$NAME" --org-id "$SUPABASE_ORG_ID" --db-password "$SUPABASE_DB_PASSWORD" --region "$REGION" -o json > /tmp/sb-ht.json
  REF=$(jq -r '.id' /tmp/sb-ht.json)
  for i in $(seq 1 60); do ST=$(supabase projects list -o json | jq -r --arg r "$REF" '(if type=="object" then .projects else . end)[] | select(.id==$r) | .status'); [ "$ST" = "ACTIVE_HEALTHY" ] && break; sleep 10; done
fi
echo "Projeto: $REF"
supabase link --project-ref "$REF" -p "$SUPABASE_DB_PASSWORD" >/dev/null
supabase db push -p "$SUPABASE_DB_PASSWORD" --yes
KEYS=$(supabase projects api-keys --project-ref "$REF" -o json)
ANON=$(echo "$KEYS" | jq -r '.[] | select(.name=="anon") | .api_key')
printf 'SUPABASE_URL=https://%s.supabase.co\nSUPABASE_ANON_KEY=%s\nSUPABASE_REF=%s\n' "$REF" "$ANON" "$REF" > .env.local
# config público do cliente (anon key é pública por desenho; RLS protege os dados)
printf 'export const SUPABASE_URL = "https://%s.supabase.co";\nexport const SUPABASE_ANON_KEY = "%s";\n' "$REF" "$ANON" > js/config.js
echo "ok: js/config.js escrito"
