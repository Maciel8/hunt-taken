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
rest "craft_jobs?character_id=eq.$CID&status=eq.ativo" -X PATCH -d '{"status":"cancelado"}' >/dev/null; rest "gather_jobs?character_id=eq.$CID&status=eq.ativo" -X PATCH -d '{"status":"cancelado"}' >/dev/null
rest "inventory?character_id=eq.$CID&container=eq.bag" -X DELETE >/dev/null   # conta de teste: mochila vazia (as rodadas anteriores enchem de itens fabricados)
adm give_starter_tools "{\"cid\":\"$CID\"}" >/dev/null   # devolve as ferramentas iniciais
rest "inventory_stacks?character_id=eq.$CID" -X DELETE >/dev/null   # conta de teste: começa sem materiais (a carga cheia bloquearia a coleta)
echo "== fase 1: atributos e classe"
S=$(rpc get_state); echo "  classe $(echo "$S" | jq -r .class.name) · pontos livres $(echo "$S" | jq .points_free) · dps $(echo "$S" | jq .stats.dps) · hp $(echo "$S" | jq .stats.hp)"
P=$(echo "$S" | jq .points_free)
if [ "$P" -gt 0 ]; then R=$(rpc spend_points '{"p":{"for":1}}'); check "gastar 1 ponto em força" "$(echo "$R" | jq '.points_free')" "$((P-1))"; fi
R=$(rpc spend_points "{\"p\":{\"for\":9999}}"); check "não gasta mais pontos que tem" "$(echo "$R" | jq -r .message)" "pontos insuficientes"
echo "== fase 2: coleta"
NODE=$(rest "resource_nodes?kind=eq.rocha&select=id&limit=1" | jq -r '.[0].id')
J=$(rpc gather_start "{\"p_node\":\"$NODE\"}"); JID=$(echo "$J" | jq -r .job); echo "  coleta em $NODE leva $(echo "$J" | jq .seconds) s"
R=$(rpc gather_finish "{\"p_job\":\"$JID\"}"); check "não termina antes do tempo" "$(echo "$R" | jq -r .message)" "ainda não terminou"
rest "gather_jobs?id=eq.$JID" -X PATCH -d '{"ready_at":"2020-01-01T00:00:00Z"}' >/dev/null
R=$(rpc gather_finish "{\"p_job\":\"$JID\"}"); echo "  recebeu: $(echo "$R" | jq -c '[.got[] | "\(.q)x \(.t) \(.purity)%"]')"
# a mesma coleta finalizada cinco vezes ao mesmo tempo: só uma pode valer
R=$(seq 5 | xargs -P5 -I{} curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/gather_finish" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"p_job\":\"$JID\"}" | grep -o "coleta já finalizada" | wc -l | tr -d " "); check "finalizar 5x em paralelo não duplica" "$R" "5"
echo "== fase 2: cadeia de refino (materiais de teste dados pelo servidor)"
for t in minerio_ferro:60:20 carvao:50:30 tora_carvalho:50:6; do IFS=: read tpl pur q <<<"$t"; rest "inventory_stacks" -X POST -H "Prefer: resolution=merge-duplicates" -d "{\"character_id\":\"$CID\",\"template_id\":\"$tpl\",\"purity\":$pur,\"qty\":$q}" >/dev/null; done
rest "character_professions" -X POST -H "Prefer: resolution=merge-duplicates" -d "[{\"character_id\":\"$CID\",\"profession_id\":\"metalurgia\",\"level\":15,\"exp\":0},{\"character_id\":\"$CID\",\"profession_id\":\"carpintaria\",\"level\":15,\"exp\":0},{\"character_id\":\"$CID\",\"profession_id\":\"ferraria\",\"level\":15,\"exp\":0}]" >/dev/null
adm add_gold "{\"cid\":\"$CID\",\"amt\":5000,\"why\":\"teste\"}" >/dev/null
done_job() { rest "craft_jobs?id=eq.$1" -X PATCH -d '{"ready_at":"2020-01-01T00:00:00Z"}' >/dev/null; rpc craft_finish "{\"p_job\":\"$1\"}"; }
for i in 1 2 3 4 5; do sleep 0.6; J=$(rpc craft_start '{"p_recipe":"triturar_ferro","p_technique":"padrao","p_qty":1}' | jq -r .job); R=$(done_job "$J"); echo "  triturar: $(echo "$R" | jq -c '.result // .fail')"; done
CONC=$(rpc get_state | jq -c '[.stacks[] | select(.t=="concentrado_ferro")]'); echo "  concentrado: $CONC"
for i in 1 2 3 4 5 6 7 8 9; do sleep 0.6; P=$(rpc get_state | jq '[.stacks[] | select(.t=="concentrado_ferro")][0].purity'); [ "$P" = "null" ] && break; J=$(rpc craft_start "{\"p_recipe\":\"fundir_ferro\",\"p_technique\":\"segura\",\"p_qty\":1,\"p_choices\":[{\"purity\":$P}]}" | jq -r '.job // .message'); R=$(done_job "$J"); echo "  fundir: $(echo "$R" | jq -c '.result // .fail // .message')"; done
J=$(rpc craft_start '{"p_recipe":"serrar_carvalho","p_qty":2}' | jq -r .job); done_job "$J" >/dev/null
# reserva: o refino pode falhar (técnica padrão tem 8%); garante barras pras 4 peças sem depender de sorte
rest "inventory_stacks" -X POST -H "Prefer: resolution=merge-duplicates" -d "{\"character_id\":\"$CID\",\"template_id\":\"barra_ferro\",\"purity\":61,\"qty\":2}" >/dev/null
BARS=$(rpc get_state | jq -c '[.stacks[] | select(.cat=="barra")]'); echo "  barras: $BARS"
pick() { rpc get_state | jq -c "[.stacks[] | select(.cat==\"$1\")][0] | {t}"; }
for part in lamina:3:barra guarda:1:barra pomo:1:barra; do IFS=: read p q cat <<<"$part"; sleep 0.6; CH=$(pick $cat $q); J=$(rpc craft_start "{\"p_recipe\":\"forjar_$p\",\"p_choices\":[$CH]}" | jq -r '.job // .message'); R=$(done_job "$J"); echo "  $p: $(echo "$R" | jq -c '.result | {quality, power, mat}? // .message // .fail')"; done
sleep 0.6; CH=$(pick madeira 1); J=$(rpc craft_start "{\"p_recipe\":\"fazer_empunhadura\",\"p_choices\":[$CH]}" | jq -r '.job // .message'); done_job "$J" >/dev/null
INV=$(rpc get_state | jq -c '.inventory'); part() { echo "$INV" | jq -r "[.[] | select(.roll.part==\"$1\")][0].id"; }
CHO="[{\"item\":\"$(part lamina)\"},{\"item\":\"$(part guarda)\"},{\"item\":\"$(part empunhadura)\"},{\"item\":\"$(part pomo)\"}]"
sleep 0.6; J=$(rpc craft_start "{\"p_recipe\":\"montar_espada\",\"p_choices\":$CHO}" | jq -r '.job // .message'); R=$(done_job "$J")
SW=$(echo "$R" | jq -c '.result | {name, dmin, dmax, aspd, crit, dur, quality, rarity, sockets, maker}'); echo "  ESPADA: $SW"
SID=$(echo "$R" | jq -r .result.id); check "espada tem fabricante" "$(echo "$R" | jq -r .result.maker)" "Testador"
R=$(rpc item_action "{\"p_item\":\"$SID\",\"p_action\":\"aprimorar\"}"); echo "  aprimorar +1: $(echo "$R" | jq -c '{ok, chance} // .message')"
R=$(rpc equip_item "{\"p_item\":\"$SID\"}"); check "equipar a espada" "$(echo "$R" | jq -r '[.inventory[] | select(.container=="equip" and .slot=="weapon")][0].id')" "$SID"
echo "  dps com a espada: $(echo "$R" | jq .stats.dps)"
R=$(rpc sell_stack '{"p_tpl":"carvao","p_purity":50,"p_qty":2}'); echo "  vender 2 carvão: $(echo "$R" | jq '.gold // .message') gold"
echo "== simulação de raridade (300.000 tentativas num veio de ferro, nível 80, ferramenta 4)"
curl -s --max-time 120 -X POST "$SUPABASE_URL/rest/v1/rpc/balance_sim_node" -H "apikey: $SERVICE" -H "Authorization: Bearer $SERVICE" -H "Content-Type: application/json" -d '{"p_table":"veio_ferro","p_attempts":300000,"p_prof":80,"p_tier":4,"p_luck":0}' | jq -c '.counts // .'
[ $FAIL = 0 ] && echo "TUDO OK" || echo "HOUVE FALHAS"
