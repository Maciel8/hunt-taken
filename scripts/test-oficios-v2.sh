#!/usr/bin/env bash
# Roda scripts/test-oficios-v2.sql (transação com rollback: não grava nada) e confere os 20 critérios de aceite.
set -uo pipefail; cd "$(dirname "$0")/.."
set -a; source "$HOME/Projetos/Biel/.env.maciel8"; source .env.local; set +a
OUT=$(for h in aws-0-sa-east-1.pooler.supabase.com aws-1-sa-east-1.pooler.supabase.com; do PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "host=$h port=5432 dbname=postgres user=postgres.$SUPABASE_REF sslmode=require connect_timeout=8" -X -q -A -t -f scripts/test-oficios-v2.sql 2>&1 && break; done)
echo "$OUT" | grep -E "=>|ERRO|ERROR" | cut -c1-200
FAIL=0; want() { if echo "$OUT" | grep -q -- "$2"; then echo "  ok  $1"; else echo "  FALHOU $1 (esperava: $2)"; FAIL=1; fi; }
echo "== critérios"
want "1 lojas separadas" '^c01_lojas => 13'
want "2 ferreiro não vende poção" '^c02_ferreiro_sem_pocao => true'
want "2 alquimista não vende picareta" '^c02_alquimista_sem_picareta => true'
want "2 ferreiro recusa poção" '^c02_ferreiro_recusa_pocao => essa loja não vende isso'
want "3 minerar pedra bruta" '^c03_minerou_pedra => pedra_comum'
want "4/7 processar 1.000 pedras" '^c07_lote_1000 => 1000 processadas'
want "5 pode não dar nada" '^c05_pode_nao_dar_nada => true'
want "5 pode dar minério" '^c05_achou_minerio => true'
want "6 pedras removidas" '^c06_pedras_consumidas => 0'
want "8 minério vira barra" '^c08_barra_ferro => barra_ferro'
want "9 produz aço" '^c09_aco => barra_aco'
want "10 espada de ferro" '^c10_espada_ferro => Espada de ferro'
want "11/12 espada de aço com chifre" '^c11_espada_aco => Espada de aço com empunhadura de chifre de javali'
want "12 chifre tratado" '^c12_chifre_tratado => chifre_javali_t'
want "13 materiais mudam atributos" '^c13_atributos_diferentes => true'
want "14 lapidou gema" '^c14_lapidou => rubi'
want "15 gema no equipamento" '^c15_gema_no_equipamento => Rubi'
want "16 equipamentos na mochila" '^c16_na_mochila => 2'
want "17 equipa" '^c17_equipou => true'
want "17 anuncia" '^c17_anunciou => true'
want "18 estado persiste" '^c18_estado => true'
want "19 lote não duplica" '^c19_lote_uma_vez => lote já entregue'
want "19 fabricação não duplica" '^c19_craft_uma_vez => trabalho já finalizado'
want "20 material novo sem receita nova" '^c20_material_novo => Espada de teste'
[ $FAIL = 0 ] && echo "TUDO OK" || echo "HOUVE FALHAS"
