#!/usr/bin/env bash
# Teste do continente: validação do mapa (Node) + regras do servidor (SQL em transação desfeita, nada fica gravado).
set -uo pipefail; cd "$(dirname "$0")/.."
set -a; source "$HOME/Projetos/Biel/.env.maciel8"; source .env.local; set +a
FAIL=0; TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT
echo "== mapa (Node)"
node scripts/check-world.mjs "$TMPD/tmp-zone-points.csv" || FAIL=1
echo "== servidor (SQL, rollback)"
OUT=$(cd "$TMPD" && for h in aws-0-sa-east-1.pooler.supabase.com aws-1-sa-east-1.pooler.supabase.com; do PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "host=$h port=5432 dbname=postgres user=postgres.$SUPABASE_REF sslmode=require connect_timeout=8" -X -q -A -t -f "$OLDPWD/scripts/test-continente.sql" 2>&1 && break; done)
echo "$OUT" | grep -E "=>|ERRO|ERROR" | cut -c1-200
want() { if echo "$OUT" | grep -q -- "$2"; then echo "  ok  $1"; else echo "  FALHOU $1 (esperava: $2)"; FAIL=1; fi; }
echo "== critérios"
want "zona igual no cliente e no servidor" '^t01_zona_igual => 400/400'
want "interiores são seguros" '^t01_interior_seguro => 1'
want "anel 1 na cidade" '^t02_anel1 => 1'
want "teleporte recusado" '^t02_teleporte_recusado => false'
want "PvP não liga em zona segura" '^t03_pvp_em_seguro => zona segura'
want "anel 2" '^t04_anel2 => 2'
want "liga PvP no anel 2" '^t04_pvp_ligado => true'
want "anel 2 exige os dois com PvP" '^t05_sem_consentimento => os dois precisam'
want "duelo resolvido no servidor" '^t06_duelo => resolvido'
want "perdedor volta pra cidade" '^t06_perdedor_na_cidade => 1:valen'
want "perde 10% do gold no anel 2" '^t06_gold_10pct => true'
want "item vai pro vencedor" '^t06_item_mudou => true'
want "duelo registrado" '^t06_log => 1'
want "recarga entre duelos" '^t07_recarga => recuperando'
want "60 s sem combate pra desligar" '^t08_desligar_em_combate => em combate'
want "anel 3 é PvP total" '^t09_anel3_forcado => 3'
want "mesma dupla sem prêmio" '^t09_sem_premio_repetido => false'
want "não ataca o próprio clã" '^t10_mesmo_cla => não dá pra atacar o próprio clã'
want "banco só na cidade" '^t11_banco_fora => o banco fica nas cidades'
want "deposita" '^t11_depositou => 1000'
want "saca" '^t11_sacou => 600'
want "peixe +35% em Valen" '^t12_valen_peixe => 1.35'
want "viagem chega em Khazad" '^t13_viagem => khazad'
want "viagem custa 2 diamantes e nenhum gold" '^t13_custo => 2 gemas, 0 gold'
want "barra +30% em Khazad" '^t13_preco_khazad => 1.3$'
want "refino −20% em Khazad" '^t13_refino_khazad => 0.8'
want "poção mais barata em Sylvana" '^t14_pocao_sylvana_mais_barata => true'
want "encantamento V só em Nocthar" '^t15_trava_encanto_v => true'
want "bônus de anel na caça" '^t15_simulate_aneis => true'
want "caça no anel 3 rende" '^t16_caca_anel3 => true'
want "depósito exclusivo do clã dono" '^t17_exclusivo => depósito exclusivo'
want "6 cidades" '^t18_cidades_view => 6'
want "dono do anel 3 aparece" '^t18_dono_valen => DVX'
want "barqueiro: travessia 15 gold" '^t19_travessia => 15$'
want "barqueiro: viagem longa 50-250" '^t19_viagem_longa => true'
want "barqueiro só no píer" '^t19_longe_do_pier => fale com o barqueiro'
want "caçada no continente exige estar na área" '^t16_caca_longe => vá até a área de caça'
want "viagem rápida custa 2 diamantes" '^t20_viagem_rapida => 2$'
want "diamantes descontados" '^t20_gemas_depois => 1$'
want "sem diamantes: recusa" '^t20_sem_gemas => a viagem rápida custa 2'
want "sem diamantes: nada cobrado" '^t20_gemas_intactas => 1$'
want "mapa aberto: longe não luta" '^t21_longe => chegue mais perto'
want "mapa aberto: luta resolvida" '^t21_luta => \(true\|false\)'
want "mapa aberto: criatura morta" '^t21_morta => essa criatura já foi derrotada'
want "chefe: precisa ir ao covil" '^t22_longe => vá até o covil'
want "chefe: log por rodada" '^t22_log => true'
want "chefe: sem repetir na hora" '^t22_repetir => \(.*volta pra você\|recupere-se\)'
want "cotação igual à venda" '^t23_cotacao_igual => true'
want "mercado: cotação = venda" '^t24_mercado_cotacao => true'
[ $FAIL = 0 ] && echo "TUDO OK" || { echo "HOUVE FALHA"; exit 1; }
