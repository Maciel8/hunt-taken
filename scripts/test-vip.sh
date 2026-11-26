#!/usr/bin/env bash
# Teste do VIP e do Passe de Batalha (SQL em transação desfeita, nada fica gravado).
set -uo pipefail; cd "$(dirname "$0")/.."
set -a; source "$HOME/Projetos/Biel/.env.maciel8"; source .env.local; set +a
FAIL=0
OUT=$(PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "host=aws-0-sa-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.$SUPABASE_REF sslmode=require connect_timeout=8" -X -q -A -t -f scripts/test-vip.sql 2>&1)
echo "$OUT" | grep -E "=>|ERRO|ERROR" | cut -c1-200
want() { if echo "$OUT" | grep -q -- "$2"; then echo "  ok  $1"; else echo "  FALHOU $1 (esperava: $2)"; FAIL=1; fi; }
echo "== critérios"
want "VIP 30 + 30 = 60 dias (renovar soma)" '^v1_vip_dias => 60$'
want "VIP custa 10 💎 cada 30 dias" '^v1_vip_custo => 20$'
want "VIP dá +50% de exp" '^v2_exp_vip => 1.5'
want "Passe: resgata o Dia 1" '^p1_dia => 1$'
want "Passe: dá o gold do dia" '^p1_gold => true'
want "Passe: um resgate por dia" '^p2_duas_vezes => você já resgatou hoje'
want "Passe: sequência chega no Dia 7 ⭐" '^p3_sequencia => true'
want "Passe: faltou um dia, volta pro Dia 1" '^p4_faltou => 1$'
want "Premium entrega o prêmio premium (3 dias de VIP)" '^p5_premium_vip => 3$'
want "VIP ganho no passe" '^p5_vip_ganho => 3$'
want "Premium acumula até 90 dias" '^p6_max90 => o Passe Premium acumula no máximo 90'
want "boost do passe soma com o VIP" '^b1_vip_mais_boost => 2.0'
want "Passe só a partir do nível 10" '^p7_nivel => o Passe libera no nível 10'
want "sem diamantes, sem VIP" '^v3_sem_gemas => o VIP de 60 dias custa 17'
[ $FAIL = 0 ] && echo "TUDO OK" || { echo "HOUVE FALHAS"; exit 1; }
