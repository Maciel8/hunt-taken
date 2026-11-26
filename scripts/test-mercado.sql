-- Teste: viagem paga/grátis, oficina direta e mercado da comunidade (retenção, sorteio, trava de preço, lote, comissões, cooldowns).
-- Roda como Testador (comprador) e Bielzin (vendedor) dentro de UMA transação desfeita no fim: nada fica gravado.
\set ON_ERROR_STOP 1
begin;
select setseed(0.7);
create temp table r(k text, v text) on commit drop; grant all on r to authenticated;
select id as tid, user_id as tuid from characters where name = 'Testador' \gset
select id as bid, user_id as buid from characters where name = 'Bielzin' \gset
create or replace function pg_temp.as_(u uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
update characters set task = 'idle', hunt_id = null where id in (:'tid', :'bid'); update hunt_sessions set status = 'encerrada' where character_id in (:'tid', :'bid') and status = 'ativa';
update wallets set gold = 1000000, gems = 10 where character_id in (:'tid', :'bid');
delete from market_requests;

-- 1. viagem: caçada do coração longe = recusa; Mensageiro (travel_city) cobra 2 diamantes e nenhum gold
select id as hid from hunts where city_id is null order by id limit 1 \gset
update characters set x = 4000, y = 4000, pos_at = now() where id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
do $$ begin perform start_hunt((select id from hunts where city_id is null order by id limit 1)); insert into r values ('v1_coracao_longe', 'COMEÇOU (erro)'); exception when others then insert into r values ('v1_coracao_longe', sqlerrm); end $$;
reset role; update characters set x = 52, y = 42, pos_at = now(), city_id = (select id from cities where heart), ring = 1 where id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
select travel_city('khazad') ->> 'cost' as tc \gset
reset role;
insert into r select 'v2_mensageiro', format('custo %s gemas %s gold %s', :'tc', gems, gold) from wallets where character_id = :'tid';

-- 2. oficina direta: minério + carvão → barra (1 etapa); barras + madeira → espada (1 etapa)
select stack_add(:'tid', 'minerio_cobre', 60, 4), stack_add(:'tid', 'carvao', 60, 4), stack_add(:'tid', 'barra_ferro', 60, 6), stack_add(:'tid', 'tabua_carvalho', 60, 4);
delete from craft_jobs where character_id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
select (craft_start('barra_cobre_direta', 'segura', 1, '[]') ->> 'job') as j1 \gset
reset role; update craft_jobs set started_at = started_at - interval '1 minute' where character_id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
select (craft_start('forjar_espada', 'segura', 1, '[{"t":"barra_ferro"},{"t":"tabua_carvalho"}]') ->> 'job') as j2 \gset
reset role; update craft_jobs set ready_at = now() - interval '1 s', started_at = started_at - interval '1 minute' where character_id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
insert into r select 'o1_barra_direta', coalesce(craft_finish(:'j1') -> 'result' ->> 't', 'falhou');
insert into r select 'o2_espada_direta', coalesce(craft_finish(:'j2') -> 'result' ->> 'name', 'falhou');
reset role; update craft_jobs set started_at = started_at - interval '1 minute' where character_id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
select (craft_start('forjar_picareta', 'segura', 1, '[{"t":"barra_ferro"},{"t":"tabua_carvalho"}]') ->> 'job') as j3 \gset
reset role; update craft_jobs set ready_at = now() - interval '1 s' where character_id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
select craft_finish(:'j3') -> 'result' as pk \gset
insert into r select 'o2b_picareta_direta', format('%s tier %s', :'pk'::jsonb ->> 'tool', :'pk'::jsonb ->> 'tier');
reset role; insert into r select 'o3_tela_simples_sem_triturar', count(*)::text from recipes where simple and id like 'triturar_%';

-- 3. mercado: Bielzin anuncia 10 peixes a 100 gold cada
update wallets set gold = 1000000 where character_id in (:'tid', :'bid');
select stack_add(:'bid', 'peixe_comum', 50, 10);
set local role authenticated; select pg_temp.as_(:'buid');
select market_list(null, 'peixe_comum', 50, 10, 100, 'gold') is not null as ok1 \gset
reset role; select id as lid from market_listings where seller_character_id = :'bid' and status = 'aberto' and template_id = 'peixe_comum' \gset
set local role authenticated; select pg_temp.as_(:'buid');
do $$ begin perform market_list(null, 'peixe_comum', 50, 1, 90, 'gold'); insert into r values ('m1_um_por_item', 'ANUNCIOU (erro)'); exception when others then insert into r values ('m1_um_por_item', sqlerrm); end $$;
do $$ begin perform market_edit_price((select id from market_listings where template_id = 'peixe_comum' and status = 'aberto' limit 1), 80); insert into r values ('m2_preco_30min', 'MUDOU (erro)'); exception when others then insert into r values ('m2_preco_30min', sqlerrm); end $$;
-- retenção de 2 min
set local role authenticated; select pg_temp.as_(:'tuid');
do $$ begin perform market_buy((select id from market_listings where template_id = 'peixe_comum' and status = 'aberto' limit 1), 100, 3); insert into r values ('m3_retencao', 'COMPROU (erro)'); exception when others then insert into r values ('m3_retencao', sqlerrm); end $$;
-- janela do sorteio: entra na fila e não paga ainda
reset role; update market_listings set release_at = now() - interval '1 s' where id = :'lid';
set local role authenticated; select pg_temp.as_(:'tuid');
insert into r select 'm4_sorteio_fila', market_buy(:'lid', 100, 3) ->> 'pending';
reset role; insert into r select 'm4_nao_pagou', gold::text from wallets where character_id = :'tid';
update market_listings set release_at = now() - interval '10 s' where id = :'lid';
set local role authenticated; select pg_temp.as_(:'tuid');
insert into r select 'm5_sorteio_ganhou', market_resolve(:'lid') ->> 'won';
reset role;
insert into r select 'm5_pagou_300', (1000000 - gold)::text from wallets where character_id = :'tid';
insert into r select 'm6_vendedor_recebe', (gold - 1000000)::text from wallets where character_id = :'bid';
insert into r select 'm6_comissao_esperada', (300 - market_fee(:'bid', 'gold', 300, false))::text;
-- trava de preço: o vendedor sobe o preço; quem aceitou 100 é recusado
update market_listings set unit_price = 150, price = 150 * qty, price_changed_at = now() where id = :'lid';
set local role authenticated; select pg_temp.as_(:'tuid');
do $$ begin perform market_buy((select id from market_listings where template_id = 'peixe_comum' and status = 'aberto' limit 1), 100, 2); insert into r values ('m7_trava', 'COMPROU (erro)'); exception when others then insert into r values ('m7_trava', sqlerrm); end $$;
-- lote: mais um anúncio barato e compra em lote dos mais baratos (60 → depois 150)
reset role; select stack_add(:'tid', 'peixe_comum', 50, 0);
select id as fid, user_id as fuid from characters where name = 'ferrarizin' \gset
select stack_add(:'fid', 'peixe_comum', 55, 4);
set local role authenticated; select pg_temp.as_(:'fuid');
select market_list(null, 'peixe_comum', 55, 4, 60, 'gold') is not null as ok2 \gset
reset role; update market_listings set release_at = now() - interval '10 s' where template_id = 'peixe_comum' and status = 'aberto';
set local role authenticated; select pg_temp.as_(:'tuid');
select market_buy_bulk('peixe_comum', 0, 6, 150, 'gold') as bulk \gset
insert into r select 'm8_lote', format('%s un em %s anúncios por %s', :'bulk'::jsonb ->> 'bought', :'bulk'::jsonb ->> 'listings', :'bulk'::jsonb ->> 'spent');
-- comissão em gemas por faixa (equipamento de 10.000 gemas, sem desconto: 65 + 450 + 375 = 890)
reset role; insert into r select 'm9_faixas', (market_fee(:'tid', 'gems', 10000, true) = floor(890 - 10000 * greatest(0, cfgn('market','sale_fee_pct') - market_fee_pct(:'tid')) / 100))::text;
-- reanunciar logo depois de sair: espera 30 min
update market_listings set status = 'vendido' where seller_character_id = :'bid' and status = 'aberto';
select stack_add(:'bid', 'peixe_comum', 50, 2);
set local role authenticated; select pg_temp.as_(:'buid');
do $$ begin perform market_list(null, 'peixe_comum', 50, 2, 100, 'gold'); insert into r values ('m10_reanunciar', 'ANUNCIOU (erro)'); exception when others then insert into r values ('m10_reanunciar', sqlerrm); end $$;
-- loja do NPC: 500 poções numa compra (na capital)
reset role; update characters set x = 6, y = 6, task = 'idle', pos_at = now() where id = :'tid'; select pots as p0 from characters where id = :'tid' \gset
set local role authenticated; select pg_temp.as_(:'tuid');
select buy_shop('potion', 500) is not null as ok3 \gset
reset role; insert into r select 'm11_loja_500', (pots - :p0)::text from characters where id = :'tid';

reset role;
select k || ' => ' || coalesce(v, 'NULL') from r order by k;
rollback;
