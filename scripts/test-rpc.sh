#!/usr/bin/env bash
# Testa o fluxo no servidor com um usuário de teste: cria/confirma usuário (admin), loga, cria personagem, inicia hunt, simula.
set -euo pipefail; cd "$(dirname "$0")/.."
SHARED="$HOME/Projetos/Biel/.env.maciel8"; set -a; source "$SHARED"; source .env.local; set +a
export SUPABASE_ACCESS_TOKEN
SERVICE=$(supabase projects api-keys --project-ref "$SUPABASE_REF" -o json | jq -r '.[] | select(.name=="service_role") | .api_key')
EMAIL="${1:-$HT_TEST_EMAIL}"; PASS="$HT_TEST_PASSWORD"
# cria usuário confirmado (idempotente: ignora se já existe)
curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"email_confirm\":true}" | jq -r '.id // .msg // .message' | head -1
TOKEN=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | jq -r '.access_token')
[ "$TOKEN" != "null" ] || { echo "login falhou"; exit 1; }
rpc() { local body="${2:-}"; [ -n "$body" ] || body="{}"; curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/$1" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$body"; }
echo "== get_state"; rpc get_state | jq -c '{c: .character.name, lvl: .character.level, gold: .gold}'
echo "== create_character"; rpc create_character '{"p_name":"Testador","p_vocation":"knight","p_kingdom":"grey"}' | jq -c '.message // {c: .character.name, gold: .gold}'
echo "== start_hunt ratos"; rpc start_hunt '{"p_hunt":"ratos"}' | jq -c '.message // {task: .character.task, hunt: .character.hunt_id, session: .session.id}'
echo "== simulate (imediato)"; rpc simulate | jq -c '.'
echo "== set_behavior"; rpc set_behavior '{"p":{"postura":"agressiva","pocao":60,"objetivo":"gold"}}' | jq -c '.'
echo "== market_view"; rpc market_view | jq -c 'if type=="array" then length else . end'
echo "== buy_shop potion x5"; rpc buy_shop '{"p_tpl":"potion","p_qty":2}' | jq -c '.message // {pots: .character.pots, gold: .gold}'
echo "== world_tick (deve ser negado ao usuário? não: é security definer sem grant) "; rpc world_tick | jq -c '.message // .'
echo "== estado final"; rpc get_state | jq -c '{lvl: .character.level, exp: .character.exp, gold: .gold, task: .character.task, hs: .hunt_state.ratos, presence: .presence, rivals: (.rivals|length), events: (.events|length)}'
