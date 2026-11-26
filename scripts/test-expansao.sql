-- Teste ponta a ponta da expansão completa, como dois jogadores (Testador e Bielzin) dentro de UMA transação desfeita no fim (rollback):
-- nada fica gravado. Forja, encantamento, Market 2.0, troca bilateral, carteira USDT + admin, clã 2.0, mundos e caça no Mundo 2.
\set ON_ERROR_STOP 1
begin;
create temp table r(k text, v text) on commit drop;
grant all on r to authenticated;
-- ===== preparação (como dono do banco) =====
select id as tid from characters where name = 'Testador' \gset
select id as bid, user_id as buid from characters where name = 'Bielzin' \gset
select user_id as tuid from characters where name = 'Testador' \gset
update wallets set gold = 500000, gems = 0 where character_id = :'tid';
insert into character_professions(character_id, profession_id, level, exp) values (:'tid','joalheria',40,0),(:'tid','ferraria',40,0),(:'tid','encantamento',60,0),(:'tid','carpintaria',30,0) on conflict (character_id, profession_id) do update set level = excluded.level;
select stack_add(:'tid','barra_prata',70,5), stack_add(:'tid','rubi',80,3), stack_add(:'tid','po_arcano',60,40), stack_add(:'tid','barra_ferro',60,20), stack_add(:'tid','tabua_carvalho',60,10), stack_add(:'tid','couro',60,5), stack_add(:'tid','fio_seda',60,6), stack_add(:'tid','diamante_bruto',80,2), stack_add(:'tid','essencia_sombria',60,4), stack_add(:'tid','safira',70,2);
update craft_jobs set status = 'cancelado' where character_id = :'tid' and status = 'ativo';
delete from inventory v using items i, item_templates t where v.item_id = i.id and i.template_id = t.id and v.character_id = :'tid' and v.container = 'bag' and t.slot is distinct from 'tool';   -- mochila sem itens (ferramentas ficam; tudo é desfeito no fim)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'tuid', 'role', 'authenticated')::text, true);
-- ===== forja: anel de prata com rubi =====
select (craft_start('forjar_anel','segura',1,'[{"t":"barra_prata"},{"t":"rubi"}]') ->> 'job') as j1 \gset
reset role; update craft_jobs set ready_at = now() - interval '1 s' where id = :'j1'; set local role authenticated;
insert into r select 'anel', (craft_finish(:'j1') -> 'result')::text;
-- arco
reset role; update craft_jobs set started_at = started_at - interval '1 minute' where character_id = :'tid'; set local role authenticated;
select (craft_start('fazer_arco','segura',1,'[{"t":"tabua_carvalho"},null,null]') ->> 'job') as j2 \gset
reset role; update craft_jobs set ready_at = now() - interval '1 s' where id = :'j2'; set local role authenticated;
insert into r select 'arco', (craft_finish(:'j2') -> 'result')::text;
-- elmo
reset role; update craft_jobs set started_at = started_at - interval '1 minute' where character_id = :'tid'; set local role authenticated;
select (craft_start('forjar_elmo','segura',1,'[{"t":"barra_ferro"},null]') ->> 'job') as j3 \gset
reset role; update craft_jobs set ready_at = now() - interval '1 s' where id = :'j3'; set local role authenticated;
insert into r select 'elmo', (craft_finish(:'j3') -> 'result' ->> 'name');
-- anel com barra de ferro deve falhar (barra nobre)
reset role; update craft_jobs set started_at = started_at - interval '1 minute' where character_id = :'tid'; set local role authenticated;
do $$ begin perform craft_start('forjar_anel','segura',1,'[{"t":"barra_ferro"},{"t":"rubi"}]'); insert into r values ('anel_ferro','PASSOU (erro)'); exception when others then insert into r values ('anel_ferro_bloqueado', sqlerrm); end $$;
-- ===== encantamento: prefixo 2x (nível II) + sufixo de fogo =====
reset role;
select (select id from items i join inventory v on v.item_id = i.id where v.character_id = (select id from characters where name='Testador') and i.template_id = 'elmo_forjado' order by i.created_at desc limit 1) as elmo \gset
set local role authenticated;
insert into r select 'ench1', (item_action(:'elmo','encantar','{"ench":"pre_fio"}') ->> 'tier');
insert into r select 'ench2', (item_action(:'elmo','encantar','{"ench":"pre_fio"}') ->> 'tier');
insert into r select 'ench3', (item_action(:'elmo','encantar','{"ench":"suf_chama"}') ->> 'tier');
insert into r select 'elmo_fx', (select roll -> 'ench_fx' from items where id = :'elmo')::text;
select equip_item(:'elmo') is not null;
insert into r select 'elem_stats', (stats_of(c) -> 'elem')::text from characters c where name = 'Testador';
insert into r select 'elem_vs_aranha(fraca a fogo)', elem_vs((select stats_of(c) -> 'elem' from characters c where name='Testador'), (select x from creatures x where id='aranha'))::text;
-- ===== Market: pilha anunciada por Testador, comprada por Bielzin =====
insert into r select 'list_stack', (list_stack('barra_ferro',60,5,1000,'gold') is not null)::text;
reset role;
select (select id from market_listings where seller_character_id = (select id from characters where name='Testador') and status='aberto' and item_id is null order by created_at desc limit 1) as lid \gset
set local role authenticated;
reset role; update wallets set gold = 100000, gems = 5000 where character_id = :'bid'; set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'buid', 'role', 'authenticated')::text, true);
select buy_listing(:'lid') is not null;
reset role; insert into r select 'buy_stack', (select qty::text from inventory_stacks where character_id = :'bid' and template_id = 'barra_ferro' and purity = 60); set local role authenticated;
-- ordem de compra de Bielzin, cumprida por Testador
insert into r select 'buy_order', (create_buy_order('po_arcano', 10, 30, 'gold', 50, 0) is not null)::text;
reset role;
select (select id from market_buy_orders where buyer_id = (select id from characters where name='Bielzin') and status = 'aberta' order by created_at desc limit 1) as ordid \gset
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'tuid', 'role', 'authenticated')::text, true);
select fulfill_buy_order(:'ordid', 10, 60, null) is not null;
reset role; insert into r select 'fulfill', (select status || ' ' || filled from market_buy_orders where id = :'ordid'); set local role authenticated;
insert into r select 'market_stats_po', (market_view2() -> 'stats' -> 'po_arcano')::text;
-- ===== troca bilateral: Testador dá rubi + 100 gold, Bielzin dá 2000 gemas =====
select (trade_open('Bielzin') ->> 'trade') as trid \gset
select trade_set(:'trid', '{}', '[{"t":"rubi","purity":80,"qty":1}]', 100, 0) is not null;
select set_config('request.jwt.claims', json_build_object('sub', :'buid', 'role', 'authenticated')::text, true);
select trade_set(:'trid', '{}', '[]', 0, 2000) is not null;
do $$ begin perform trade_confirm((select id from trades where status='aberta' and mode='bilateral' order by created_at desc limit 1), 0); insert into r values ('versao_velha','PASSOU (erro)'); exception when others then insert into r values ('versao_velha_bloqueada', sqlerrm); end $$;
select trade_confirm(:'trid', 2) is not null;
select set_config('request.jwt.claims', json_build_object('sub', :'tuid', 'role', 'authenticated')::text, true);
select trade_confirm(:'trid', 2) is not null;
insert into r select 'troca', (select status from trades where id = :'trid') || ' gemas Testador=' || (select gems from wallets where character_id = (select id from characters where name='Testador'));
-- ===== carteira: depósito confirmado pelo admin, saque pedido e pago =====
reset role; update game_config set value = jsonb_set(value, '{receive,polygon}', '"0x2222222222222222222222222222222222222222"') where key = 'p2e'; set local role authenticated;
insert into r select 'deposito', (create_deposit('p6500','polygon','0xabc123def456') -> 'deposits' -> 0 ->> 'status');
select set_config('request.jwt.claims', json_build_object('sub', :'buid', 'role', 'authenticated')::text, true);
reset role;
select (select id from deposit_requests where status='pending' order by created_at desc limit 1) as did \gset
set local role authenticated;
insert into r select 'admin_confirma', (admin_deposit(:'did','confirmar') -> 'treasury' ->> 'usdt_balance');
select set_config('request.jwt.claims', json_build_object('sub', :'tuid', 'role', 'authenticated')::text, true);
reset role; update characters set created_at = now() - interval '4 days' where name = 'Testador'; set local role authenticated;
insert into r select 'sacavel', withdrawable_gems((select id from characters where name='Testador'))::text;
insert into r select 'saque', (request_usdt_withdrawal(1000,'polygon','0x1111111111111111111111111111111111111111') -> 'withdrawals' -> 0 ->> 'usdt');
do $$ begin perform request_usdt_withdrawal(1000,'trc20','enderecoerrado'); insert into r values ('saque_endereco_errado','PASSOU (erro)'); exception when others then insert into r values ('endereco_bloqueado', sqlerrm); end $$;
select set_config('request.jwt.claims', json_build_object('sub', :'buid', 'role', 'authenticated')::text, true);
reset role;
select (select id from withdrawal_requests where status='pending' order by created_at desc limit 1) as wid \gset
set local role authenticated;
insert into r select 'admin_paga', (admin_withdrawal(:'wid','pagar','0xdeadbeefcafe0001') -> 'treasury')::text;
-- ===== clã 2.0 =====
select set_config('request.jwt.claims', json_build_object('sub', :'tuid', 'role', 'authenticated')::text, true);
select create_clan('Teste Atomico','TAT','teste','gold') is not null;
select clan_vault_action('depositar', '{"gold":200000}') is not null;
select clan_vault_action('depositar', '{"t":"barra_ferro","purity":60,"qty":10}') is not null;
reset role; select stack_add(:'tid','tabua_comum',50,40), stack_add(:'tid','pedra',50,60); set local role authenticated;
select clan_vault_action('depositar', '{"t":"tabua_comum","purity":50,"qty":20}') is not null;
select clan_vault_action('depositar', '{"t":"pedra","purity":50,"qty":30}') is not null;
insert into r select 'construir_quartel', (clan_vault_action('construir', '{"building":"quartel"}') -> 'buildings')::text;
insert into r select 'imposto', (clan_vault_action('imposto', '{"pct":10}') ->> 'tax_pct');
reset role; select stack_add(:'tid','tabua_comum',50,10), stack_add(:'tid','barra_ferro',50,5); set local role authenticated;
insert into r select 'suprimentos', (clan_vault_action('suprimentos') -> 'fort')::text;
-- ===== mundos =====
do $$ begin perform travel_world(2); insert into r values ('viagem_sem_req','PASSOU (erro)'); exception when others then insert into r values ('viagem_bloqueada', sqlerrm); end $$;
reset role; update characters set level = 120 where name = 'Testador'; select stack_add(:'tid','selo_eldoria',100,1); set local role authenticated;
insert into r select 'viagem', (travel_world(2) -> 'world' ->> 'name');
insert into r select 'chefes_mundo2', (select string_agg(x ->> 'name', ', ') from jsonb_array_elements(world_boss_action('lista')) x);
-- caça no mundo 2 (2 h)
select start_hunt('lobos') is not null;
reset role; update characters set last_simulated_at = now() - interval '2 hours' where name = 'Testador'; set local role authenticated;
insert into r select 'sim_mundo2', (select jsonb_build_object('kills', x -> 'kills', 'exp', x -> 'exp', 'gold', x -> 'gold', 'tax', x -> 'tax', 'events', x -> 'events')::text from (select simulate() x) y);
reset role; insert into r select 'vault_gold_apos_imposto', (select gold::text from clan_vault where clan_id = (select clan_id from clan_members where character_id = (select id from characters where name='Testador')));
set local role authenticated;
insert into r select 'get_state_ok', (get_state() ?& array['world','usdt_equiv','clan_extra','market_news'])::text;
insert into r select 'npc_budget', (npc_budget_view() ->> 'left');
reset role;
select k || ' => ' || left(v, 300) from r;
rollback;
