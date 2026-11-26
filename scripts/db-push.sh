#!/usr/bin/env bash
# Aplica as migrations pendentes no projeto Supabase já linkado.
set -euo pipefail; cd "$(dirname "$0")/.."
SHARED="$HOME/Projetos/Biel/.env.maciel8"; if [ -f "$SHARED" ]; then set -a; source "$SHARED"; set +a; fi
export SUPABASE_ACCESS_TOKEN
supabase db push -p "$SUPABASE_DB_PASSWORD" --yes 2>&1 | tail -25
