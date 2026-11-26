#!/usr/bin/env bash
# Configura o Auth do projeto: URL do site e redirecionamentos permitidos (links de confirmação e recuperação).
set -euo pipefail; cd "$(dirname "$0")/.."
SHARED="$HOME/Projetos/Biel/.env.maciel8"; set -a; source "$SHARED"; source .env.local; set +a
curl -s -X PATCH "https://api.supabase.com/v1/projects/$SUPABASE_REF/config/auth" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"site_url":"https://hunt-taken.vercel.app","uri_allow_list":"https://hunt-taken.vercel.app,https://hunt-taken.vercel.app/*,https://*-gabrielmacoliveira-1020s-projects.vercel.app/*,http://localhost:*","mailer_autoconfirm":false,"security_update_password_require_reauthentication":false}' | jq -c '{site_url, mailer_autoconfirm, uri_allow_list}'
