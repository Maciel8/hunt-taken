#!/usr/bin/env bash
# Teste de viagem, oficina direta e mercado da comunidade (SQL em transação desfeita, nada fica gravado).
set -uo pipefail; cd "$(dirname "$0")/.."
set -a; source "$HOME/Projetos/Biel/.env.maciel8"; source .env.local; set +a
FAIL=0
OUT=$(for h in aws-0-sa-east-1.pooler.supabase.com aws-1-sa-east-1.pooler.supabase.com; do PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "host=$h port=5432 dbname=postgres user=postgres.$SUPABASE_REF sslmode=require connect_timeout=8" -X -q -A -t -f scripts/test-mercado.sql 2>&1 && break; done)
echo "$OUT" | grep -E "=>|ERRO|ERROR" | cut -c1-200
want() { if echo "$OUT" | grep -q -- "$2"; then echo "  ok  $1"; else echo "  FALHOU $1 (esperava: $2)"; FAIL=1; fi; }
echo "== critérios"
want "caçada do coração longe: recusa" '^v1_coracao_longe => vá até a área de caça'
want "Mensageiro cobra 2 diamantes, nada de gold" '^v2_mensageiro => custo 2 gemas 8 gold 1000000'
want "barra direto do minério" '^o1_barra_direta => barra_cobre'
want "espada direto das barras" '^o2_espada_direta => Espada de'
want "picareta direto das barras" '^o2b_picareta_direta => picareta tier [1-9]'
want "tela simples sem etapa de triturar" '^o3_tela_simples_sem_triturar => 0'
want "um anúncio por item" '^m1_um_por_item => você já anuncia esse material'
want "preço muda a cada 30 min" '^m2_preco_30min => o preço só muda a cada 30 min'
want "retenção de 2 min" '^m3_retencao => esse anúncio libera em'
want "sorteio: entra na fila" '^m4_sorteio_fila => true'
want "sorteio: não paga antes" '^m4_nao_pagou => 1000000'
want "sorteio: ganhou" '^m5_sorteio_ganhou => true'
want "pagou 3 × 100" '^m5_pagou_300 => 300'
want "trava de preço" '^m7_trava => o vendedor aumentou o preço'
want "compra em lote pelos mais baratos" '^m8_lote => 6 un em 2 anúncios por 540'
want "comissão em gemas por faixa" '^m9_faixas => true'
want "reanunciar só depois de 30 min" '^m10_reanunciar => esse item saiu do mercado há pouco'
want "loja: 500 poções de uma vez" '^m11_loja_500 => 500'
S=$(echo "$OUT" | grep '^m6_vendedor_recebe' | cut -d' ' -f3); E=$(echo "$OUT" | grep '^m6_comissao_esperada' | cut -d' ' -f3)
if [ -n "$S" ] && [ "$S" = "$E" ]; then echo "  ok  vendedor recebe preço − comissão ($S)"; else echo "  FALHOU vendedor recebe ($S vs $E)"; FAIL=1; fi
[ $FAIL = 0 ] && echo "TUDO OK" || { echo "HOUVE FALHAS"; exit 1; }
