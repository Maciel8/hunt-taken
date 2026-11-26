#!/usr/bin/env bash
# Roda scripts/test-expansao.sql direto no Postgres (transação com rollback: não grava nada) e confere os resultados.
set -uo pipefail; cd "$(dirname "$0")/.."
set -a; source "$HOME/Projetos/Biel/.env.maciel8"; source .env.local; set +a
OUT=$(for h in aws-0-sa-east-1.pooler.supabase.com aws-1-sa-east-1.pooler.supabase.com; do PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "host=$h port=5432 dbname=postgres user=postgres.$SUPABASE_REF sslmode=require connect_timeout=8" -X -q -A -t -f scripts/test-expansao.sql 2>&1 && break; done)
echo "$OUT" | grep "=>" | cut -c1-200
FAIL=0; want() { if echo "$OUT" | grep -q -- "$2"; then echo "  ok  $1"; else echo "  FALHOU $1 (esperava: $2)"; FAIL=1; fi; }
echo "== conferência"
want "anel forjado com gema" '^anel => .*"name": "Anel de prata com rubi'
want "arco forjado" '^arco => .*"wtype": "arco"'
want "elmo forjado" '^elmo => Elmo de ferro'
want "anel só com barra nobre" '^anel_ferro_bloqueado => essa receita pede barra nobre'
want "encanto sobe pro nível II" '^ench2 => 2'
want "sufixo de fogo" '^elmo_fx => .*"elem_fogo"'
want "dano elemental nos status" '^elem_stats => {"fogo"'
want "venda de pilha no Market" '^buy_stack => 5'
want "ordem de compra cumprida" '^fulfill => cumprida 10'
want "trava dupla recusa versão velha" '^versao_velha_bloqueada => a oferta mudou'
want "troca bilateral concluída" '^troca => aceita gemas Testador=2000'
want "admin confirma depósito (85% no fundo)" '^admin_confirma => 42.50'
want "saque calcula USDT com taxa" '^saque => 9.50'
want "endereço inválido recusado" '^endereco_bloqueado =>'
want "admin paga saque" '^admin_paga => .*"usdt_balance": 33.00'
want "construção do clã" '^construir_quartel => {"quartel": 1}'
want "imposto do clã" '^imposto => 10'
want "Forte Cinzento dominado" '^suprimentos => .*"mine": true'
want "viagem sem requisito bloqueada" '^viagem_bloqueada => Frostheim e Solkar pede nível 100'
want "viagem pro Mundo 2" '^viagem => Frostheim e Solkar'
want "caça off-line a 45%" '^sim_mundo2 => .*rendimento de 45%'
want "imposto vai pro cofre" '^vault_gold_apos_imposto => [0-9]'
want "estado com campos novos" '^get_state_ok => true'
[ $FAIL = 0 ] && echo "TUDO OK" || echo "HOUVE FALHAS"
