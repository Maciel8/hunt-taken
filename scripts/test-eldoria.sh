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
rest "inventory?character_id=eq.$CID&container=eq.bag" -X DELETE >/dev/null   # conta de teste: mochila vazia (as rodadas anteriores enchem de itens fabricados)
adm give_starter_tools "{\"cid\":\"$CID\"}" >/dev/null   # devolve as ferramentas iniciais
echo "== fase 3: reinos, regiões e criaturas"
check "7 reinos (com o Reino Espiritual)" "$(rest 'realms?select=id' | jq length)" "7"
check "Eldoria aberto" "$(rest 'realms?id=eq.eldoria&select=open' | jq '.[0].open')" "true"
check "área mítica existe" "$(rest 'world_regions?tier=eq.mitica&select=id' | jq -r '.[0].id')" "ancestrais"
check "acampamento goblin na região campos" "$(rest 'hunts?id=eq.goblins&select=wregion' | jq -r '.[0].wregion')" "campos"
check "toda criatura tem família" "$(rest 'creatures?family=is.null&select=id' | jq length)" "0"
echo "  curva: $(rest 'creatures?select=id,level,hp,exp&order=level&limit=6' | jq -c '[.[] | "\(.id) n\(.level) hp\(.hp) xp\(.exp)"]')"
B=$(rpc bestiary_view); check "bestiário lista criaturas" "$( [ "$(echo "$B" | jq length)" -ge 20 ] && echo sim)" "sim"
echo "  drops do lobo: $(echo "$B" | jq -c '[.[] | select(.id=="lobo") | .drops[] | "\(.name) \(.chance)"]')"
echo "== fase 3: caça gera material e conta abate"
rest "inventory_stacks?character_id=eq.$CID&template_id=in.(couro_cru,osso,couro)" -X DELETE >/dev/null   # conta de teste: zera pra medir
K0=$(rest "character_kills?character_id=eq.$CID&creature_id=eq.lobo&select=kills" | jq '.[0].kills // 0')
C0=$(rpc get_state | jq '[.stacks[] | select(.t=="couro_cru") | .qty] | add // 0')
HID=$(rest "hunts?creature_id=eq.lobo&select=id&limit=1" | jq -r '.[0].id')
rpc return_home >/dev/null 2>&1
R=$(rpc start_hunt "{\"p_hunt\":\"$HID\"}"); echo "  start_hunt $HID: $(echo "$R" | jq -c '.message // "ok"' | cut -c1-120)"
rest "characters?id=eq.$CID" -X PATCH -d '{"last_simulated_at":"'"$(date -u -v-2H +%Y-%m-%dT%H:%M:%SZ)"'"}' >/dev/null
R=$(rpc simulate); echo "  simulate: $(echo "$R" | jq -c '.message // (.report | {kills, drops: [.drops[]? | select(.mat) | "\(.q)x \(.template)"]})' 2>/dev/null | cut -c1-300)"
K1=$(rest "character_kills?character_id=eq.$CID&creature_id=eq.lobo&select=kills" | jq '.[0].kills // 0')
C1=$(rpc get_state | jq '[.stacks[] | select(.t=="couro_cru") | .qty] | add // 0')
check "abates de lobo subiram" "$( [ "$K1" -gt "$K0" ] && echo sim)" "sim"; echo "  lobos $K0 -> $K1 · couro cru $C0 -> $C1"
W=$(rpc get_state | jq ".carry"); echo "  carga depois da caça: $W"; check "caiu couro cru" "$( [ "$C1" -gt "$C0" ] && echo sim)" "sim"
rpc return_home >/dev/null 2>&1
echo "== fase 3: couro e armadura forjada"
rest "character_professions" -X POST -H "Prefer: resolution=merge-duplicates" -d "[{\"character_id\":\"$CID\",\"profession_id\":\"caca\",\"level\":10,\"exp\":0}]" >/dev/null
rest "inventory_stacks" -X POST -H "Prefer: resolution=merge-duplicates" -d "{\"character_id\":\"$CID\",\"template_id\":\"couro_cru\",\"purity\":50,\"qty\":8}" >/dev/null
rest "inventory_stacks" -X POST -H "Prefer: resolution=merge-duplicates" -d "{\"character_id\":\"$CID\",\"template_id\":\"barra_ferro\",\"purity\":55,\"qty\":2}" >/dev/null
done_job() { rest "craft_jobs?id=eq.$1" -X PATCH -d '{"ready_at":"2020-01-01T00:00:00Z"}' >/dev/null; rpc craft_finish "{\"p_job\":\"$1\"}"; }
for i in 1 2 3 4; do sleep 0.6; J=$(rpc craft_start '{"p_recipe":"curtir_couro","p_technique":"padrao","p_qty":1}' | jq -r '.job // .message'); R=$(done_job "$J"); echo "  curtir: $(echo "$R" | jq -c '.result // .message' | cut -c1-120)"; done
sleep 0.6; J=$(rpc craft_start '{"p_recipe":"forjar_armadura","p_choices":[null,{"t":"barra_ferro"}]}' | jq -r '.job // .message'); echo "  job armadura: $J"
R=$(done_job "$J"); echo "  armadura: $(echo "$R" | jq -c '.result // .message' | cut -c1-260)"
check "armadura tem defesa" "$(echo "$R" | jq '(.result.def // 0) > 0')" "true"
echo "== fase 3: guardião mítico"
R=$(rpc mythic_action '{"p_action":"requisitos"}'); echo "  requisitos: $(echo "$R" | jq -c '{level,ents,power,power_ref}')"
R=$(rpc mythic_action '{"p_action":"desafiar"}'); check "sem 30 ents não desafia" "$(echo "$R" | jq -r '.message' | cut -c1-24)" "prove seu valor: derrote"
[ $FAIL = 0 ] && echo "TUDO OK" || echo "HOUVE FALHAS"
