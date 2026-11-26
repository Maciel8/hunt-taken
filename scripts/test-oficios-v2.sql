-- Teste dos 20 critérios de aceite de lojas, fabricação modular e processamento de pedras.
-- Roda como jogador (Testador) dentro de UMA transação desfeita no fim (rollback): nada fica gravado.
\set ON_ERROR_STOP 1
begin;
create temp table r(k text, v text) on commit drop; grant all on r to authenticated;
select id as tid, user_id as tuid from characters where name = 'Testador' \gset
select id as bid, user_id as buid from characters where name = 'Bielzin' \gset
update wallets set gold = 2000000 where character_id = :'tid';
update characters set world_id = 1, task = 'idle' where id = :'tid';
delete from inventory v using items i, item_templates t where v.item_id = i.id and i.template_id = t.id and v.character_id = :'tid' and v.container = 'bag' and t.slot is distinct from 'tool';
delete from inventory_stacks where character_id = :'tid';
update craft_jobs set status = 'cancelado' where character_id = :'tid' and status = 'ativo'; update gather_jobs set status = 'cancelado' where character_id = :'tid' and status = 'ativo';
update stone_jobs set status = 'pronto' where character_id = :'tid' and status = 'ativo';
insert into character_professions(character_id, profession_id, level, exp) values (:'tid','ferraria',40,0),(:'tid','metalurgia',30,0),(:'tid','processamento',25,0),(:'tid','lapidacao',20,0),(:'tid','caca',20,0),(:'tid','carpintaria',20,0),(:'tid','mineracao',10,0)
  on conflict (character_id, profession_id) do update set level = excluded.level;
-- adianta relógios (trabalhos ficam prontos) e respeita o intervalo mínimo entre trabalhos
create or replace function pg_temp.ready() returns void language sql as $$ update craft_jobs set ready_at = now() - interval '1 s', started_at = started_at - interval '1 minute' where character_id = (select id from characters where name='Testador') and status = 'ativo'; update stone_jobs set ready_at = now() - interval '1 s' where character_id = (select id from characters where name='Testador') and status = 'ativo'; update gather_jobs set ready_at = now() - interval '1 s', started_at = started_at - interval '1 minute' where character_id = (select id from characters where name='Testador') and status = 'ativo' $$;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'tuid', 'role', 'authenticated')::text, true);

-- 1-2: lojas separadas e coerentes
insert into r select 'c01_lojas', (select count(*) from jsonb_array_elements((select jsonb_agg(id) from npc_shops)))::text;
insert into r select 'c02_ferreiro_sem_pocao', (not exists (select 1 from jsonb_array_elements(shop_view('ferreiro') -> 'items') x where x ->> 't' = 'potion'))::text;
insert into r select 'c02_alquimista_sem_picareta', (not exists (select 1 from jsonb_array_elements(shop_view('alquimista') -> 'items') x where x ->> 't' like 'picareta%'))::text;
do $$ begin perform shop_buy('ferreiro','potion',1); insert into r values ('c02_ferreiro_vende_pocao','SIM (erro)'); exception when others then insert into r values ('c02_ferreiro_recusa_pocao', sqlerrm); end $$;
insert into r select 'c02_compra_alquimista', (shop_buy('alquimista','potion',3) -> 'character' ->> 'pots');
-- 3: minerar pedra bruta numa rocha dos campos
select (gather_start('rocha_1') ->> 'job') as gj \gset
reset role; select pg_temp.ready(); set local role authenticated;
insert into r select 'c03_minerou_pedra', (select string_agg(x ->> 't', ',') from jsonb_array_elements(gather_finish(:'gj') -> 'got') x);
-- 4-7: processar 1.000 pedras em lote
reset role; select stack_add(:'tid','pedra_comum',50,1000); set local role authenticated;
select (process_stones_start('pedra_comum','comum',1000) ->> 'job') as sj \gset
reset role; insert into r select 'c06_pedras_consumidas', coalesce((select sum(qty) from inventory_stacks where character_id = :'tid' and template_id = 'pedra_comum' and purity = 50), 0)::text; select pg_temp.ready(); set local role authenticated;
select process_stones_finish(:'sj') -> 'report' as rep \gset
insert into r select 'c07_lote_1000', (:'rep'::jsonb ->> 'qty') || ' processadas, ' || (:'rep'::jsonb ->> 'lost') || ' sem nada, ' || (select count(*) from jsonb_object_keys(:'rep'::jsonb -> 'materials')) || ' materiais';
insert into r select 'c05_pode_nao_dar_nada', ((:'rep'::jsonb ->> 'lost')::int > 0)::text;
insert into r select 'c05_achou_minerio', ((:'rep'::jsonb -> 'materials') ? 'minerio_cobre')::text;
do $$ begin perform process_stones_finish((select id from stone_jobs where character_id = (select id from characters where name='Testador') order by started_at desc limit 1)); insert into r values ('c19_lote_duas_vezes','SIM (erro)'); exception when others then insert into r values ('c19_lote_uma_vez', sqlerrm); end $$;
-- 8: minério de ferro → barra de ferro
reset role; select stack_add(:'tid','minerio_ferro',60,8), stack_add(:'tid','carvao',60,40); set local role authenticated;
select (craft_start('triturar_ferro','segura',2) ->> 'job') as j1 \gset
reset role; select pg_temp.ready(); set local role authenticated; select craft_finish(:'j1') is not null;
select (craft_start('fundir_ferro','segura',1,'[]') ->> 'job') as j2 \gset
reset role; select pg_temp.ready(); set local role authenticated;
insert into r select 'c08_barra_ferro', coalesce(craft_finish(:'j2') -> 'result' ->> 't', 'falhou');
-- 9: aço
reset role; select stack_add(:'tid','barra_ferro',60,12); set local role authenticated;
select (craft_start('liga_aco','segura',2) ->> 'job') as j3 \gset
reset role; select pg_temp.ready(); set local role authenticated;
insert into r select 'c09_aco', coalesce(craft_finish(:'j3') -> 'result' ->> 't', 'falhou');
-- 12 (parte 1): tratar chifre de javali no Curtume
reset role; select stack_add(:'tid','chifre_javali',50,2), stack_add(:'tid','tabua_comum',50,5), stack_add(:'tid','barra_aco',60,8), stack_add(:'tid','rubi_bruto',50,1), stack_add(:'tid','tabua_ancestral',60,2), stack_add(:'tid','barra_mitril',60,3); set local role authenticated;
select (craft_start('tratar_chifre_javali','segura',1) ->> 'job') as j4 \gset
reset role; select pg_temp.ready(); set local role authenticated;
insert into r select 'c12_chifre_tratado', coalesce(craft_finish(:'j4') -> 'result' ->> 't', 'falhou');
-- 14: lapidar gema
select (craft_start('lapidar_rubi','segura',1) ->> 'job') as j5 \gset
reset role; select pg_temp.ready(); set local role authenticated;
insert into r select 'c14_lapidou', coalesce(craft_finish(:'j5') -> 'result' ->> 't', 'falhou');
-- 13: prévia muda com o material
insert into r select 'c13_previa_ferro_vs_aco', (modular_preview('espada','{"lamina":{"t":"barra_ferro"},"guarda":{"t":"barra_ferro"},"empunhadura":{"t":"tabua_comum"},"pomo":{"t":"barra_ferro"}}') -> 'expected' ->> 'dmg') || ' -> ' ||
  (modular_preview('espada','{"lamina":{"t":"barra_aco"},"guarda":{"t":"barra_ferro"},"empunhadura":{"t":"chifre_javali_t"},"pomo":{"t":"barra_ferro"}}') -> 'expected' ->> 'dmg');
-- 10: espada de ferro
reset role; select pg_temp.ready(); set local role authenticated;
select (forge_modular_start('espada','{"lamina":{"t":"barra_ferro"},"guarda":{"t":"barra_ferro"},"empunhadura":{"t":"tabua_comum"},"pomo":{"t":"barra_ferro"}}') ->> 'job') as f1 \gset
reset role; select pg_temp.ready(); set local role authenticated;
select craft_finish(:'f1') -> 'result' as e1 \gset
insert into r select 'c10_espada_ferro', (:'e1'::jsonb ->> 'name') || ' dano ' || (:'e1'::jsonb ->> 'dmg') || ' vel ' || (:'e1'::jsonb ->> 'aspd');
-- 11 + 12 + 15: espada de aço com cabo de chifre de javali e rubi lapidado
select (forge_modular_start('espada','{"lamina":{"t":"barra_aco"},"guarda":{"t":"barra_ferro"},"empunhadura":{"t":"chifre_javali_t"},"pomo":{"t":"barra_ferro"},"gema":{"t":"rubi"}}') ->> 'job') as f2 \gset
reset role; select pg_temp.ready(); set local role authenticated;
select craft_finish(:'f2') -> 'result' as e2 \gset
insert into r select 'c11_espada_aco', (:'e2'::jsonb ->> 'name') || ' dano ' || (:'e2'::jsonb ->> 'dmg') || ' vel ' || (:'e2'::jsonb ->> 'aspd') || ' fogo ' || coalesce(:'e2'::jsonb ->> 'elem_fogo', '0');
insert into r select 'c13_atributos_diferentes', ((:'e2'::jsonb ->> 'dmg')::numeric > (:'e1'::jsonb ->> 'dmg')::numeric and (:'e2'::jsonb ->> 'aspd')::numeric > (:'e1'::jsonb ->> 'aspd')::numeric)::text;
insert into r select 'c15_gema_no_equipamento', (:'e2'::jsonb -> 'gem' ->> 'name');
-- 16-17: está na mochila, equipa e anuncia
insert into r select 'c16_na_mochila', (select count(*) from inventory where item_id in ((:'e1'::jsonb ->> 'id')::uuid, (:'e2'::jsonb ->> 'id')::uuid) and container = 'bag')::text;
insert into r select 'c17_equipou', (equip_item((:'e2'::jsonb ->> 'id')::uuid) -> 'inventory' @> jsonb_build_array(jsonb_build_object('id', :'e2'::jsonb ->> 'id', 'container', 'equip')))::text;
insert into r select 'c17_anunciou', (list_item((:'e1'::jsonb ->> 'id')::uuid, 5000, 'gold') is not null)::text;
-- 19: a mesma fabricação finalizada duas vezes só vale uma
do $$ begin perform craft_finish((select id from craft_jobs where character_id = (select id from characters where name='Testador') and recipe_id = 'modular_espada' order by started_at desc limit 1)); insert into r values ('c19_craft_duas_vezes','SIM (erro)'); exception when others then insert into r values ('c19_craft_uma_vez', sqlerrm); end $$;
-- 20: material novo entra só com dados (sem receita nova)
reset role;
insert into item_templates(id,name,slot,atk,def,sell,price,mat,voc,icon,extra,category,stackable,tier,base_rarity,weight,props,req_level) values ('barra_teste','Barra de teste',null,0,0,1,null,true,null,'bar','{}','barra',true,2,1,1,'{}',1);
insert into material_props(template_id, mods, req_level) values ('barra_teste','{"dmg":42,"dur":10,"aspd":7}',1);
select stack_add(:'tid','barra_teste',50,3);
set local role authenticated;
insert into r select 'c20_material_novo', (modular_preview('espada','{"lamina":{"t":"barra_teste"},"guarda":{"t":"barra_ferro"},"empunhadura":{"t":"tabua_comum"},"pomo":{"t":"barra_ferro"}}') -> 'expected' ->> 'name');
-- 18: persistência (o que foi feito está no banco e volta no estado)
insert into r select 'c18_estado', (jsonb_array_length(get_state() -> 'inventory') > 0)::text;
reset role;
select k || ' => ' || left(v, 220) from r order by k;
rollback;
