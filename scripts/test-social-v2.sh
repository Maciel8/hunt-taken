#!/usr/bin/env bash
# Teste ponta a ponta das fases 1 e 2 no servidor real, com a conta de teste.
# Usa a chave de serviço só pra adiantar relógios de trabalho (ready_at) e dar materiais de teste; todo o resto passa pelas RPCs de jogador.
set -uo pipefail; cd "$(dirname "$0")/.."
SHARED="$HOME/Projetos/Biel/.env.maciel8"; set -a; source "$SHARED"; source .env.local; set +a; export SUPABASE_ACCESS_TOKEN
SERVICE=$(supabase projects api-keys --project-ref "$SUPABASE_REF" -o json | jq -r '.[] | select(.name=="service_role") | .api_key')
TOKEN=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{"email":"'"$HT_TEST_EMAIL"'","password":"'"$HT_TEST_PASSWORD"'"}' | jq -r '.access_token')
rpc() { local body="${2:-}"; [ -n "$body" ] || body="{}"; curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/$1" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$body"; }
adm() { curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/$1" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" -H "Content-Type: application/json" -d "$2"; }
rest() { curl -s "$SUPABASE_URL/rest/v1/$1" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" -H "Content-Type: application/json" "${@:2}"; }
FAIL=0; check() { if [ "$2" = "$3" ]; then echo "  ok  $1"; else echo "  FALHOU $1: esperado $3, veio $2"; FAIL=1; fi; }
CID=$(rpc get_state | jq -r .character.id)
echo "== clã: pagar em gold ou gemas"
rest "wallets?character_id=eq.$CID" -X PATCH -d '{"gems":0}' >/dev/null
R=$(rpc create_clan '{"p_name":"Clã Teste","p_tag":"TST","p_desc":"teste","p_pay":"gemas"}'); check "sem gemas não funda" "$(echo "$R" | jq -r .message)" "fundar com gemas custa 10 gemas"
rest "wallets?character_id=eq.$CID" -X PATCH -d '{"gems":25}' >/dev/null
R=$(rpc create_clan '{"p_name":"Clã Teste","p_tag":"TST","p_desc":"teste","p_pay":"gemas"}'); check "funda com gemas" "$(echo "$R" | jq -r .clan.tag)" "TST"
check "cobrou 10 gemas" "$(rpc get_state | jq .gems)" "15"
R=$(rpc clan_action '{"p_action":"convidar","p_target":"NinguemAqui"}'); check "convidar nome inexistente" "$(echo "$R" | jq -r .message)" "jogador não encontrado"
R=$(rpc clan_action '{"p_action":"sair"}'); check "sair (desfaz clã)" "$(echo "$R" | jq -r '.clan')" "null"
echo "== clã: receber e aceitar convite"
CL=$(rest "clans" -X POST -H "Prefer: return=representation" -d '{"name":"Convite Teste","tag":"CVT"}' | jq -r '.[0].id')
rest "clan_invites" -X POST -d "{\"clan_id\":\"$CL\",\"character_id\":\"$CID\"}" >/dev/null
S=$(rpc get_state); check "convite aparece no estado" "$(echo "$S" | jq -r '.clan_invites[0].tag')" "CVT"
R=$(rpc clan_action "{\"p_action\":\"aceitar_convite\",\"p_target\":\"$CL\"}"); check "aceitou e entrou" "$(echo "$R" | jq -r .clan.tag)" "CVT"
check "convite apagado" "$(echo "$R" | jq '.clan_invites | length')" "0"
rpc clan_action '{"p_action":"sair"}' >/dev/null; rest "clans?id=eq.$CL" -X DELETE >/dev/null
echo "== nível sem limite"
L0=$(rpc get_state | jq .character.level)
rest "characters?id=eq.$CID" -X PATCH -d '{"level":120}' >/dev/null
S=$(rpc get_state); check "nível 120 aceito" "$(echo "$S" | jq .character.level)" "120"; echo "  pontos livres no 120: $(echo "$S" | jq .points_free) · dps $(echo "$S" | jq .stats.dps)"
rest "characters?id=eq.$CID" -X PATCH -d "{\"level\":$L0}" >/dev/null
[ $FAIL = 0 ] && echo "TUDO OK" || echo "HOUVE FALHAS"
