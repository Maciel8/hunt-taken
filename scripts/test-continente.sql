-- Teste do continente: anéis, posição, PvP, banco, viagem, economia regional e especialidades das cidades.
-- Roda como jogadores (Testador e Bielzin) dentro de UMA transação desfeita no fim (rollback): nada fica gravado.
\set ON_ERROR_STOP 1
begin;
select setseed(0.42);
create temp table r(k text, v text) on commit drop; grant all on r to authenticated;
create temp table zpts(x int, y int, ring int, city text) on commit drop;
\copy zpts from 'tmp-zone-points.csv' csv
create temp table tpts(x2 int, y2 int, x3 int, y3 int) on commit drop;
\copy tpts from 'tmp-test-points.csv' csv
select x2, y2, x3, y3 from tpts \gset
select id as tid, user_id as tuid from characters where name = 'Testador' \gset
select id as bid, user_id as buid from characters where name = 'Bielzin' \gset
select set_config('t.bid', :'bid', false);
select x as vx, y as vy from cities where id = 'valen' \gset
update wallets set gold = 100000, banked = 0 where character_id in (:'tid', :'bid');
update characters set world_id = 1, task = 'idle', hunt_id = null, bless = false, pvp_mode = false, combat_at = null, pos_at = null, hp = 500 where id in (:'tid', :'bid');
delete from clan_members where character_id in (:'tid', :'bid');
update hunt_sessions set status = 'encerrada' where character_id in (:'tid', :'bid') and status = 'ativa';
-- um item comum na mochila do Bielzin (pra ver o item mudar de dono)
delete from inventory where character_id = :'bid' and container = 'bag';
with it as (insert into items(template_id, rarity, roll, origin) values ('capa', 0, '{}', 'teste') returning id) insert into inventory(item_id, character_id, container, idx) select id, :'bid', 'bag', 0 from it;
create or replace function pg_temp.as_(u uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create or replace function pg_temp.place(c uuid, px int, py int) returns void language sql as $$ update characters set x = px, y = py, pos_at = now() - interval '1 hour', ring = (zone_at(px, py)->>'ring')::int, city_id = zone_at(px, py)->>'city' where id = c $$;

-- 1. mesma zona no cliente (js/terrain.js) e no servidor (zone_at) em 400 pontos
insert into r select 't01_zona_igual', (select count(*) from zpts z where (zone_at(z.x, z.y)->>'ring')::int = z.ring and (z.ring = 4 or zone_at(z.x, z.y)->>'city' = z.city))::text || '/' || (select count(*) from zpts)::text;
insert into r select 't01_interior_seguro', (zone_at(20, 4830)->>'ring');

-- 2. posição: entra no anel 1 de Valen; teleporte é recusado
select pg_temp.place(:'tid', :vx + 2, :vy);
set local role authenticated; select pg_temp.as_(:'tuid');
insert into r select 't02_anel1', (report_position(:vx + 3, :vy) ->> 'ring');
insert into r select 't02_teleporte_recusado', (report_position(:vx + 900, :vy) ->> 'ok');
-- 3. PvP não liga em zona segura
do $$ begin perform pvp_toggle(true); insert into r values ('t03_pvp_em_seguro', 'LIGOU (erro)'); exception when others then insert into r values ('t03_pvp_em_seguro', sqlerrm); end $$;
-- 4. anel 2: liga PvP
reset role; select pg_temp.place(:'tid', :x2, :y2); select pg_temp.place(:'bid', :x2 + 2, :y2); update characters set pos_at = now() where id = :'bid';
set local role authenticated; select pg_temp.as_(:'tuid');
insert into r select 't04_anel2', (report_position(:x2, :y2) ->> 'ring');
insert into r select 't04_pvp_ligado', (pvp_toggle(true) ->> 'pvp');
-- 5. o outro com PvP desligado não pode ser atacado no anel 2
do $$ begin perform pvp_resolve(current_setting('t.bid')::uuid); insert into r values ('t05_sem_consentimento', 'ATACOU (erro)'); exception when others then insert into r values ('t05_sem_consentimento', sqlerrm); end $$;
-- 6. os dois ligados: duelo resolvido pelo servidor
reset role; update characters set pvp_mode = true, pos_at = now() where id = :'bid'; update characters set pos_at = now() where id = :'tid';
-- garante resultado previsível: Bielzin fica fraco (sem poções, vida baixa não muda poder; usa poder pelo nível)
update characters set level = 1, pots = 0 where id = :'bid';
set local role authenticated; select pg_temp.as_(:'tuid');
select pvp_resolve(:'bid') as duel \gset
reset role;
insert into r select 't06_duelo', case when (:'duel'::jsonb ->> 'won') is not null then 'resolvido' end;
insert into r select 't06_perdedor_na_cidade', (select ring::text || ':' || city_id from characters where id = (case when (:'duel'::jsonb ->> 'won')::boolean then :'bid'::uuid else :'tid'::uuid end));
insert into r select 't06_gold_10pct', ((:'duel'::jsonb ->> 'gold')::bigint = 10000)::text;
insert into r select 't06_item_mudou', ((:'duel'::jsonb ->> 'won')::boolean is false or exists (select 1 from inventory v join items i on i.id = v.item_id where v.character_id = :'tid' and i.template_id = 'capa' and i.origin = 'teste'))::text;
insert into r select 't06_log', (select count(*) from pvp_log where winner in (:'tid', :'bid'))::text;
-- 7. recarga entre duelos
update characters set pos_at = now(), x = :x2, y = :y2, ring = 2, pvp_mode = true where id in (:'tid', :'bid');
set local role authenticated; select pg_temp.as_(:'tuid');
do $$ begin perform pvp_resolve(current_setting('t.bid')::uuid); insert into r values ('t07_recarga', 'ATACOU (erro)'); exception when others then insert into r values ('t07_recarga', sqlerrm); end $$;
-- 8. desligar PvP logo depois de lutar: precisa de 60 s fora de combate
do $$ begin perform pvp_toggle(false); insert into r values ('t08_desligar_em_combate', 'DESLIGOU (erro)'); exception when others then insert into r values ('t08_desligar_em_combate', sqlerrm); end $$;
-- 9. mesma dupla logo em seguida: luta sem prêmio (anti-farm); anel 3 é PvP total mesmo com o outro desligado
reset role; update pvp_log set at = at - interval '1 minute' where attacker = :'tid';
select pg_temp.place(:'tid', :x3, :y3); select pg_temp.place(:'bid', :x3 + 2, :y3);
update characters set pos_at = now(), pvp_mode = false where id = :'bid'; update characters set pos_at = now() where id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
select pvp_resolve(:'bid') as duel3 \gset
reset role; insert into r select 't09_anel3_forcado', (select ring::text from pvp_log where attacker = :'tid' order by at desc, id desc limit 1); set local role authenticated; select pg_temp.as_(:'tuid');
insert into r select 't09_sem_premio_repetido', (:'duel3'::jsonb ->> 'rewarded');
-- 10. clã: no anel 3 não ataca o próprio clã
reset role;
insert into clans(name, tag, leader) values ('Teste Continente', 'TCX', :'tid') returning id as clid \gset
insert into clan_members(clan_id, character_id, role) values (:'clid', :'tid', 'lider'), (:'clid', :'bid', 'membro');
update pvp_log set at = at - interval '1 hour' where attacker = :'tid';
update characters set pos_at = now(), x = :x3, y = :y3, ring = 3 where id in (:'tid', :'bid');
set local role authenticated; select pg_temp.as_(:'tuid');
do $$ begin perform pvp_resolve(current_setting('t.bid')::uuid); insert into r values ('t10_mesmo_cla', 'ATACOU (erro)'); exception when others then insert into r values ('t10_mesmo_cla', sqlerrm); end $$;
-- 11. banco: só na cidade; depositar e sacar
do $$ begin perform bank_action('depositar', 10); insert into r values ('t11_banco_fora', 'DEPOSITOU (erro)'); exception when others then insert into r values ('t11_banco_fora', sqlerrm); end $$;
reset role; select pg_temp.place(:'tid', :vx, :vy + 3); update characters set pos_at = now() where id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
insert into r select 't11_depositou', (bank_action('depositar', 1000) ->> 'banked');
insert into r select 't11_sacou', (bank_action('sacar', 400) ->> 'banked');
-- 12. preço regional: barra vale +30% em Khazad, peixe +35% em Valen
reset role;
insert into r select 't12_valen_peixe', city_sell_mult(c, t)::text from characters c, item_templates t where c.id = :'tid' and t.id like 'peixe%' limit 1;
-- 13. viagem: Valen → Khazad custa 2 diamantes (viagem rápida), nenhum gold, e põe o personagem na praça
reset role; update wallets set gems = greatest(gems, 5) where character_id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
select (select gems from wallets where character_id = :'tid') as g0, (select gold from wallets where character_id = :'tid') as gd0 \gset
insert into r select 't13_viagem', (travel_city('khazad') ->> 'city');
insert into r select 't13_custo', format('%s gemas, %s gold', :g0 - (select gems from wallets where character_id = :'tid'), :gd0 - (select gold from wallets where character_id = :'tid'));
reset role;
insert into r select 't13_preco_khazad', city_sell_mult(c, t)::text from characters c, item_templates t where c.id = :'tid' and t.id = 'barra_ferro';
insert into r select 't13_refino_khazad', (city_bonus(c, 'refino'))::text from characters c where c.id = :'tid';
-- 14. Sylvana: poção mais barata que em Arken
update characters set pos_at = now(), x = (select x from cities where id = 'sylvana'), y = (select y from cities where id = 'sylvana'), ring = 1, city_id = 'sylvana' where id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
select (select gold from wallets where character_id = :'tid') as s0 \gset
select shop_buy('alquimista', 'potion', 10) is not null as ok1 \gset
select (select gold from wallets where character_id = :'tid') as s1 \gset
reset role; update characters set pos_at = now(), x = 52, y = 42, ring = 1, city_id = 'arken' where id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
select shop_buy('alquimista', 'potion', 10) is not null as ok2 \gset
select (select gold from wallets where character_id = :'tid') as s2 \gset
insert into r select 't14_pocao_sylvana_mais_barata', ((:s0 - :s1) < (:s1 - :s2))::text;
-- 15. encantamento nível V só em Nocthar (trava dentro da função) e bônus de anel na caça
reset role;
insert into r select 't15_trava_encanto_v', (position('só na Cidadela de Nocthar' in pg_get_functiondef('item_action'::regproc)) > 0)::text;
insert into r select 't15_simulate_aneis', (position('ring_drop' in pg_get_functiondef('simulate'::regproc)) > 0)::text;
-- 16. caçada no anel 3 de Valen roda no servidor
update characters set pos_at = now(), level = 60 where id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
do $$ begin perform start_hunt('valen_a3'); insert into r values ('t16_caca_longe', 'COMEÇOU (erro)'); exception when others then insert into r values ('t16_caca_longe', sqlerrm); end $$;
reset role; update characters set x = (select (rect->>'x')::int + 9 from hunts where id = 'valen_a3'), y = (select (rect->>'y')::int + 9 from hunts where id = 'valen_a3'), pos_at = now() where id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
select start_hunt('valen_a3') is not null as hs \gset
reset role; update characters set last_simulated_at = now() - interval '2 hours' where id = :'tid'; update hunt_sessions set started_at = started_at - interval '2 hours' where character_id = :'tid' and status = 'ativa';
set local role authenticated; select pg_temp.as_(:'tuid');
select simulate() as sim \gset
insert into r select 't16_caca_anel3', ((:'sim'::jsonb ->> 'kills')::int > 0)::text;
-- 17. depósito exclusivo do anel 3: outro clã domina → recusa
reset role;
insert into clans(name, tag, leader) values ('Dono de Valen', 'DVX', :'bid') returning id as cl2 \gset
delete from clan_members where character_id = :'bid'; insert into clan_members(clan_id, character_id, role) values (:'cl2', :'bid', 'lider');
insert into city_influence(city_id, clan_id, points) values ('valen', :'cl2', 50);
set local role authenticated; select pg_temp.as_(:'tuid');
do $$ begin perform gather_start((select id from resource_nodes where owner = 'city:valen' limit 1)); insert into r values ('t17_exclusivo', 'COLETOU (erro)'); exception when others then insert into r values ('t17_exclusivo', sqlerrm); end $$;
insert into r select 't18_cidades_view', jsonb_array_length(cities_view())::text;
insert into r select 't18_dono_valen', (select x -> 'owner' ->> 'tag' from jsonb_array_elements(cities_view()) x where x ->> 'id' = 'valen');
-- 19. barqueiro: atravessar a lagoa custa 15; viagem longa entre 50 e 250; longe do píer é recusado
reset role;
select id as pa, x as pax, y as pay, lake as plake from boat_ports where lake is not null and id like '%a' order by id limit 1 \gset
select id as pb from boat_ports where lake = :'plake' and id <> :'pa' limit 1 \gset
update characters set task = 'idle', hunt_id = null, x = :pax, y = :pay, pos_at = now() where id = :'tid'; update hunt_sessions set status = 'encerrada' where character_id = :'tid' and status = 'ativa';
set local role authenticated; select pg_temp.as_(:'tuid');
insert into r select 't19_travessia', (boat_travel(:'pa', :'pb') ->> 'cost');
reset role; update characters set x = :pax, y = :pay, pos_at = now() where id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
select (boat_travel(:'pa', 'valen_porto') ->> 'cost')::int as longcost \gset
insert into r select 't19_viagem_longa', (:longcost between 50 and 250)::text;
do $$ begin perform boat_travel((select id from boat_ports where lake is not null and id like '%a' order by id limit 1), 'valen_porto'); insert into r values ('t19_longe_do_pier', 'EMBARCOU (erro)'); exception when others then insert into r values ('t19_longe_do_pier', sqlerrm); end $$;
-- 20. viagem rápida: 2 diamantes, só cobra se acontecer; sem diamantes é recusada e nada é cobrado
reset role; update characters set task = 'idle', hunt_id = null where id = :'tid'; update hunt_sessions set status = 'encerrada' where character_id = :'tid' and status = 'ativa';
update wallets set gems = 3 where character_id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
insert into r select 't20_viagem_rapida', (fast_travel('city', 'khazad') -> 'travel' ->> 'cost');
reset role; insert into r select 't20_gemas_depois', gems::text from wallets where character_id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
do $$ begin perform fast_travel('city', 'solkar'); insert into r values ('t20_sem_gemas', 'VIAJOU (erro)'); exception when others then insert into r values ('t20_sem_gemas', sqlerrm); end $$;
reset role; insert into r select 't20_gemas_intactas', gems::text from wallets where character_id = :'tid';
-- 21. mapa aberto: luta de verdade no servidor (perto da criatura), criatura morta não pode ser atacada de novo
select s.id as sid, s.x as sx, s.y as sy from world_spawns s join creatures cr on cr.id = s.creature_id where cr.level between 20 and 35 and not s.rare order by s.id limit 1 \gset
update characters set x = :sx + 50, y = :sy, pos_at = now(), last_fight_at = null, hp = 5000, task = 'idle' where id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
do $$ begin perform fight_spawn((select s.id from world_spawns s join creatures cr on cr.id = s.creature_id where cr.level between 20 and 35 and not s.rare order by s.id limit 1)); insert into r values ('t21_longe', 'LUTOU (erro)'); exception when others then insert into r values ('t21_longe', sqlerrm); end $$;
reset role; update characters set x = :sx, y = :sy, pos_at = now() where id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
insert into r select 't21_luta', (fight_spawn(:'sid') ->> 'won');
reset role; update characters set last_fight_at = null where id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
do $$ begin perform fight_spawn((select s.id from world_spawns s join creatures cr on cr.id = s.creature_id where cr.level between 20 and 35 and not s.rare order by s.id limit 1)); insert into r values ('t21_morta', 'LUTOU (erro)'); exception when others then insert into r values ('t21_morta', sqlerrm); end $$;
-- 22. chefe: precisa estar no covil, combate com log por rodada, não repete na hora
reset role; update characters set hp = 5000, last_fight_at = null where id = :'tid'; select x as bx, y as by from bosses where id = 'boss_arken' \gset
set local role authenticated; select pg_temp.as_(:'tuid');
do $$ begin perform boss_fight('boss_arken'); insert into r values ('t22_longe', 'LUTOU (erro)'); exception when others then insert into r values ('t22_longe', sqlerrm); end $$;
reset role; update characters set x = :bx, y = :by, pos_at = now() where id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
select boss_fight('boss_arken') as bf \gset
insert into r select 't22_log', (jsonb_array_length(:'bf'::jsonb -> 'log') > 5)::text;
do $$ begin perform boss_fight('boss_arken'); insert into r values ('t22_repetir', 'LUTOU (erro)'); exception when others then insert into r values ('t22_repetir', sqlerrm); end $$;
-- 23. cotação de venda = mesmo valor que a venda paga
reset role; select stack_add(:'tid', 'peixe_comum', 50, 5);
set local role authenticated; select pg_temp.as_(:'tuid');
select (sell_quote('mercador', '[{"t":"peixe_comum","qty":5,"purity":50}]') -> 'quotes' -> 0 ->> 'gold')::int as quote \gset
insert into r select 't23_cotacao_igual', ((shop_sell('mercador', '{"t":"peixe_comum","qty":5,"purity":50}') ->> 'gold')::int = :quote)::text;
-- 24. mercado simples: cotação = valor pago na venda de material
reset role; select stack_add(:'tid', 'peixe_comum', 60, 9);
set local role authenticated; select pg_temp.as_(:'tuid');
select (market_sell_quote('peixe_comum', 60, 9) ->> 'gold')::int as mq \gset
insert into r select 't24_mercado_cotacao', ((sell_stack('peixe_comum', 60, 9) ->> 'gold')::int = :mq)::text;
reset role;
select k || ' => ' || coalesce(v, 'NULL') from r order by k;
rollback;
