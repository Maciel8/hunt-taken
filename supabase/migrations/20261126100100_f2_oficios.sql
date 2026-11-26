-- Expansão, fase 2: profissões, ferramentas, depósitos de recurso, materiais com pureza, refino, fabricação modular.
set search_path = public;

insert into game_config(key, value, note) values
 ('prof', '{"max":100,"exp_k":40,"exp_pow":2.1,"tiers":[[1,"Aprendiz"],[11,"Iniciante"],[21,"Especialista"],[41,"Veterano"],[61,"Mestre"],[81,"Grão-Mestre"],[100,"Lendário"]]}', 'curva das profissões e classificação'),
 ('purity', '{"bands":[[0,"Impuro"],[30.01,"Comum"],[60.01,"Refinado"],[80.01,"Superior"],[95.01,"Excepcional"],[100,"Perfeito"]]}', 'faixas de pureza'),
 ('techniques', '{"segura":{"name":"Segura","gold_mult":1,"purity_gain":5,"fail":0.03,"spread":4},"padrao":{"name":"Padrão","gold_mult":1.6,"purity_gain":11,"fail":0.08,"spread":8},"arriscada":{"name":"Arriscada","gold_mult":3,"purity_gain":22,"fail":0.2,"spread":14}}', 'técnicas de refino: custo, ganho de pureza, chance de falha (falha devolve metade)'),
 ('craft', '{"quality_purity_w":0.55,"quality_skill_cap":30,"rarity_cut":[55,70,82,92,99,112],"upgrade_max":10,"upgrade_chance":[1,0.95,0.9,0.8,0.7,0.6,0.5,0.4,0.3,0.2],"upgrade_gain":0.06,"repair_cost_per_point":2,"dismantle_return":0.4,"job_min_gap_s":0.5}', 'fabricação, aprimoramento, reparo e desmontagem')
on conflict (key) do update set value = excluded.value, note = excluded.note, updated_at = now();

-- ---------- profissões ----------
create table if not exists professions (id text primary key, name text not null, category text not null check (category in ('coleta','processo','fabricacao','servico')), description text, sort int default 0);
create table if not exists character_professions (character_id uuid not null references characters(id) on delete cascade, profession_id text not null references professions(id), level int not null default 1, exp bigint not null default 0, primary key (character_id, profession_id));
alter table professions enable row level security; alter table character_professions enable row level security;
drop policy if exists read_professions on professions; create policy read_professions on professions for select to authenticated using (true);
insert into professions(id, name, category, description, sort) values
 ('mineracao','Mineração','coleta','Extrai pedra, minérios, gemas e achados raros.',1),('lenharia','Lenharia','coleta','Corta árvores.',2),('agricultura','Agricultura','coleta','Colhe ervas e plantas.',3),('pesca','Pesca','coleta','Pesca em rios e lagos.',4),('caca','Caça','coleta','Aproveita peles e partes das criaturas.',5),
 ('metalurgia','Metalurgia','processo','Tritura, funde e purifica metais.',6),('carpintaria','Carpintaria','processo','Transforma toras em tábuas e cabos.',7),('alquimia','Alquimia','processo','Poções e reagentes.',8),('joalheria','Joalheria','processo','Lapida gemas.',9),
 ('ferraria','Ferraria','fabricacao','Forja componentes, armas e ferramentas.',10),('encantamento','Encantamento','fabricacao','Encanta equipamentos.',11),
 ('comercio','Comércio','servico','Negocia melhor e conhece mercados.',12),('exploracao','Exploração','servico','Descobre lugares e rotas.',13)
on conflict (id) do update set name = excluded.name, category = excluded.category, description = excluded.description, sort = excluded.sort;
create or replace function prof_exp_for(l int) returns bigint language sql stable as $$ select floor(cfgn('prof','exp_k') * power(greatest(0, l - 1), cfgn('prof','exp_pow')))::bigint $$;
create or replace function prof_level(cid uuid, p text) returns int language sql stable as $$ select coalesce((select level from character_professions where character_id = cid and profession_id = p), 1) $$;
create or replace function prof_gain(cid uuid, p text, n bigint) returns int language plpgsql as $$
declare cp character_professions;
begin
  insert into character_professions(character_id, profession_id) values (cid, p) on conflict do nothing;
  update character_professions set exp = exp + n where character_id = cid and profession_id = p returning * into cp;
  while cp.level < cfgn('prof','max') and cp.exp >= prof_exp_for(cp.level + 1) loop cp.level := cp.level + 1; end loop;
  update character_professions set level = cp.level where character_id = cid and profession_id = p;
  return cp.level;
end $$;

-- ---------- itens: categorias, pilhas, raridade de 8 níveis ----------
alter table item_templates add column if not exists category text not null default 'equipamento';
alter table item_templates add column if not exists stackable boolean not null default false;
alter table item_templates add column if not exists tier int not null default 1;
alter table item_templates add column if not exists base_rarity int not null default 0;
alter table item_templates add column if not exists weight numeric not null default 1;
alter table item_templates add column if not exists props jsonb not null default '{}';
alter table item_templates add column if not exists req_level int not null default 1;
alter table items add column if not exists crafted_by text;
alter table items add column if not exists crafted_at timestamptz;
-- materiais empilhados: mesma peça e mesma pureza ocupam uma pilha
create table if not exists inventory_stacks (character_id uuid not null references characters(id) on delete cascade, template_id text not null references item_templates(id), purity smallint not null default 50 check (purity between 0 and 100), qty int not null check (qty >= 0), primary key (character_id, template_id, purity));
alter table inventory_stacks enable row level security;
drop policy if exists stacks_own on inventory_stacks; create policy stacks_own on inventory_stacks for select to authenticated using (character_id in (select id from characters where user_id = auth.uid()));
create or replace function stack_add(cid uuid, tpl text, pur int, n int) returns void language plpgsql as $$
begin
  if n = 0 then return; end if;
  insert into inventory_stacks(character_id, template_id, purity, qty) values (cid, tpl, greatest(0, least(100, pur)), n) on conflict (character_id, template_id, purity) do update set qty = inventory_stacks.qty + excluded.qty;
  delete from inventory_stacks where character_id = cid and qty <= 0;
end $$;
create or replace function stack_take(cid uuid, tpl text, pur int, n int) returns void language plpgsql as $$
declare have int;
begin
  select qty into have from inventory_stacks where character_id = cid and template_id = tpl and purity = pur for update;
  if coalesce(have, 0) < n then raise exception 'faltam % x %', n - coalesce(have, 0), (select name from item_templates where id = tpl); end if;
  update inventory_stacks set qty = qty - n where character_id = cid and template_id = tpl and purity = pur;
  delete from inventory_stacks where character_id = cid and qty <= 0;
end $$;
create or replace function carry_weight(cid uuid) returns numeric language sql stable as $$
  select coalesce((select sum(s.qty * t.weight) from inventory_stacks s join item_templates t on t.id = s.template_id where s.character_id = cid), 0) $$;
-- roll_item com 8 raridades (tabela configurável)
create or replace function roll_rarity(seed text, bonus numeric default 0) returns int language plpgsql stable as $$
declare w jsonb := cfg('item_rarity_roll'); r double precision := ht_rand(seed || ':rar'); k int; acc numeric := 0; out int := 0;
begin
  for k in reverse 7..1 loop acc := acc + (w ->> k)::numeric * (1 + bonus); if r < acc then return k; end if; end loop;
  return 0;
end $$;
create or replace function roll_item(tpl text, origin text, seed text) returns uuid language plpgsql as $$
declare rar int := roll_rarity(seed); t item_templates; roll jsonb := '{}'; nid uuid;
begin
  select * into t from item_templates where id = tpl;
  if t.slot is not null then
    if t.atk > 0 then roll := roll || jsonb_build_object('atk', floor(ht_rand(seed || ':a') * (ceil(t.atk * 0.15) + 1))); end if;
    if t.def > 0 then roll := roll || jsonb_build_object('def', floor(ht_rand(seed || ':d') * (ceil(t.def * 0.15) + 1))); end if;
    if ht_rand(seed || ':s') < 0.25 then roll := roll || jsonb_build_object('skill', 1 + rar); end if;
  end if;
  insert into items(template_id, rarity, roll, origin, seed) values (tpl, rar, roll, origin, seed) returning id into nid;
  return nid;
end $$;
create or replace function item_value(it items) returns bigint language sql stable as $$
  select floor(coalesce(t.sell, 0) * coalesce((select (r ->> 'mult')::numeric from jsonb_array_elements(cfg('rarities')) r where (r ->> 'id')::int = it.rarity), 1)
    * (1 + coalesce((select sum(v::numeric) from jsonb_each_text(it.roll - 'dmin' - 'dmax' - 'dur' - 'maxdur' - 'quality' - 'purity' - 'aspd' - 'tier' - 'eff' - 'speed' - 'sockets' - 'upgrade') as e(k, v) where v ~ '^-?[0-9.]+$'), 0) * 0.02)
    + coalesce((it.roll ->> 'dmax')::numeric, 0) * 25 + coalesce((it.roll ->> 'quality')::numeric, 0) * 8)::bigint
  from item_templates t where t.id = it.template_id $$;

-- catálogo de materiais, componentes, ferramentas e armas forjadas
insert into item_templates(id,name,slot,atk,def,sell,price,mat,voc,icon,extra,category,stackable,tier,base_rarity,weight,props,req_level) values
 ('pedra','Pedra',null,0,0,2,null,true,null,'moss_rock','{}','bruto',true,1,0,1,'{}',1),
 ('minerio_cobre','Minério de cobre',null,0,0,6,null,true,null,'moss_rock2','{}','bruto',true,1,0,1,'{"metal":"cobre"}',1),
 ('minerio_ferro','Minério de ferro',null,0,0,12,null,true,null,'moss_rock2','{}','bruto',true,2,1,1.2,'{"metal":"ferro"}',1),
 ('carvao','Carvão',null,0,0,5,null,true,null,'moss_rock','{}','bruto',true,1,0,0.5,'{}',1),
 ('minerio_prata','Minério de prata',null,0,0,30,null,true,null,'moss_rock2','{}','bruto',true,2,1,1.1,'{"metal":"prata"}',1),
 ('pepita_ouro','Pepita de ouro',null,0,0,180,null,true,null,'coins','{}','bruto',true,3,3,0.3,'{"metal":"ouro"}',1),
 ('minerio_mitril','Minério de mitril',null,0,0,900,null,true,null,'gem','{}','bruto',true,4,4,0.6,'{"metal":"mitril"}',1),
 ('minerio_adamantita','Minério de adamantita',null,0,0,6000,null,true,null,'gem','{}','bruto',true,5,5,1.5,'{"metal":"adamantita"}',1),
 ('cristal_celestial','Cristal celestial',null,0,0,40000,null,true,null,'orb','{}','bruto',true,6,6,0.2,'{}',1),
 ('fragmento_primordial','Fragmento primordial',null,0,0,350000,null,true,null,'orb','{}','bruto',true,7,7,0.1,'{}',1),
 ('gema_bruta','Quartzo bruto',null,0,0,40,null,true,null,'gem','{}','bruto',true,2,1,0.2,'{"gem":"quartzo"}',1),
 ('rubi_bruto','Rubi bruto',null,0,0,220,null,true,null,'gem','{}','bruto',true,3,2,0.2,'{"gem":"rubi"}',1),
 ('safira_bruta','Safira bruta',null,0,0,220,null,true,null,'gem','{}','bruto',true,3,2,0.2,'{"gem":"safira"}',1),
 ('esmeralda_bruta','Esmeralda bruta',null,0,0,220,null,true,null,'gem','{}','bruto',true,3,2,0.2,'{"gem":"esmeralda"}',1),
 ('tora_comum','Tora comum',null,0,0,3,null,true,null,'log','{}','bruto',true,1,0,2,'{"wood":"comum"}',1),
 ('tora_carvalho','Tora de carvalho',null,0,0,9,null,true,null,'log','{}','bruto',true,2,1,2,'{"wood":"carvalho"}',1),
 ('tora_ancestral','Tora ancestral',null,0,0,700,null,true,null,'log','{}','bruto',true,4,4,1.5,'{"wood":"ancestral"}',1),
 ('erva_curativa','Erva curativa',null,0,0,4,null,true,null,'bush','{}','bruto',true,1,0,0.1,'{}',1),
 ('flor_lunar','Flor lunar',null,0,0,90,null,true,null,'flower_yellow','{}','bruto',true,3,2,0.1,'{}',1),
 ('raiz_antiga','Raiz antiga',null,0,0,400,null,true,null,'dead_shrub','{}','bruto',true,4,3,0.2,'{}',1),
 ('peixe_comum','Peixe',null,0,0,4,null,true,null,'fish','{}','bruto',true,1,0,0.5,'{}',1),
 ('peixe_prateado','Peixe prateado',null,0,0,25,null,true,null,'fish','{}','bruto',true,2,1,0.5,'{}',1),
 ('peixe_dourado','Peixe dourado',null,0,0,600,null,true,null,'fish','{}','bruto',true,4,4,0.5,'{}',1),
 ('concentrado_cobre','Concentrado de cobre',null,0,0,14,null,true,null,'moss_rock2','{}','refinado',true,1,0,0.8,'{"metal":"cobre"}',1),
 ('concentrado_ferro','Concentrado de ferro',null,0,0,28,null,true,null,'moss_rock2','{}','refinado',true,2,1,0.9,'{"metal":"ferro"}',1),
 ('concentrado_prata','Concentrado de prata',null,0,0,70,null,true,null,'moss_rock2','{}','refinado',true,2,1,0.8,'{"metal":"prata"}',1),
 ('concentrado_mitril','Concentrado de mitril',null,0,0,2000,null,true,null,'gem','{}','refinado',true,4,4,0.5,'{"metal":"mitril"}',1),
 ('concentrado_adamantita','Concentrado de adamantita',null,0,0,13000,null,true,null,'gem','{}','refinado',true,5,5,1.2,'{"metal":"adamantita"}',1),
 ('barra_cobre','Barra de cobre',null,0,0,35,null,true,null,'shield','{}','barra',true,1,0,1,'{"power":6,"weight":1.2,"tough":30,"magic":0}',1),
 ('barra_ferro','Barra de ferro',null,0,0,70,null,true,null,'shield','{}','barra',true,2,1,1.2,'{"power":10,"weight":1.4,"tough":50,"magic":0}',1),
 ('barra_prata','Barra de prata',null,0,0,170,null,true,null,'shield','{}','barra',true,2,1,1,'{"power":9,"weight":1.1,"tough":40,"magic":4}',1),
 ('barra_ouro','Barra de ouro',null,0,0,420,null,true,null,'coins','{}','barra',true,3,2,1.4,'{"power":7,"weight":1.6,"tough":25,"magic":7}',1),
 ('barra_mitril','Barra de mitril',null,0,0,4500,null,true,null,'gem','{}','barra',true,4,4,0.6,'{"power":18,"weight":0.7,"tough":80,"magic":6}',1),
 ('barra_adamantita','Barra de adamantita',null,0,0,28000,null,true,null,'gem','{}','barra',true,5,5,1.6,'{"power":26,"weight":1.8,"tough":140,"magic":2}',1),
 ('liga_ancestral','Liga ancestral',null,0,0,60000,null,true,null,'orb','{}','barra',true,6,5,1,'{"power":34,"weight":1.0,"tough":160,"magic":8}',1),
 ('tabua_comum','Tábua comum',null,0,0,8,null,true,null,'log','{}','madeira',true,1,0,1,'{"power":2,"weight":0.6,"tough":20,"magic":0}',1),
 ('tabua_carvalho','Tábua de carvalho',null,0,0,22,null,true,null,'log','{}','madeira',true,2,1,1,'{"power":4,"weight":0.7,"tough":35,"magic":0}',1),
 ('tabua_ancestral','Tábua ancestral',null,0,0,1600,null,true,null,'log','{}','madeira',true,4,4,0.6,'{"power":8,"weight":0.6,"tough":70,"magic":4}',1),
 ('quartzo','Quartzo lapidado',null,0,0,110,null,true,null,'gem','{}','gema',true,2,1,0.1,'{"crit":1.5}',1),
 ('rubi','Rubi lapidado',null,0,0,600,null,true,null,'gem','{}','gema',true,3,2,0.1,'{"crit":3,"patk":4}',1),
 ('safira','Safira lapidada',null,0,0,600,null,true,null,'gem','{}','gema',true,3,2,0.1,'{"matk":6,"mdef":4}',1),
 ('esmeralda','Esmeralda lapidada',null,0,0,600,null,true,null,'gem','{}','gema',true,3,2,0.1,'{"hp":60}',1),
 ('po_arcano','Pó arcano',null,0,0,60,null,true,null,'orb','{}','reagente',true,2,1,0.1,'{}',1),
 ('comp_lamina','Lâmina',null,0,0,0,null,false,null,'sword','{}','componente',false,1,0,1,'{"part":"lamina"}',1),
 ('comp_guarda','Guarda',null,0,0,0,null,false,null,'shield','{}','componente',false,1,0,0.5,'{"part":"guarda"}',1),
 ('comp_empunhadura','Empunhadura',null,0,0,0,null,false,null,'staff','{}','componente',false,1,0,0.4,'{"part":"empunhadura"}',1),
 ('comp_pomo','Pomo',null,0,0,0,null,false,null,'ring','{}','componente',false,1,0,0.3,'{"part":"pomo"}',1),
 ('comp_cabeca_picareta','Cabeça de picareta',null,0,0,0,null,false,null,'sword','{}','componente',false,1,0,1,'{"part":"cabeca"}',1),
 ('espada_forjada','Espada forjada','weapon',0,0,0,null,false,null,'sword','{}','arma',false,1,0,3,'{}',1),
 ('picareta_forjada','Picareta forjada','tool',0,0,0,null,false,null,'sword','{}','ferramenta',false,1,0,3,'{"tool":"picareta"}',1),
 ('picareta_cobre','Picareta de cobre','tool',0,0,40,150,false,null,'sword','{}','ferramenta',false,1,0,3,'{"tool":"picareta","tier":1,"eff":1.0,"speed":1.0,"dur":120}',1),
 ('picareta_ferro','Picareta de ferro','tool',0,0,300,1200,false,null,'sword','{}','ferramenta',false,2,0,3,'{"tool":"picareta","tier":2,"eff":1.1,"speed":1.15,"dur":220}',15),
 ('machado_ferro','Machado de lenhador','tool',0,0,120,400,false,null,'sword','{}','ferramenta',false,1,0,3,'{"tool":"machado","tier":2,"eff":1.0,"speed":1.0,"dur":200}',1),
 ('vara_pesca','Vara de pesca','tool',0,0,60,250,false,null,'staff','{}','ferramenta',false,1,0,1,'{"tool":"vara","tier":1,"eff":1.0,"speed":1.0,"dur":150}',1),
 ('foice','Foice','tool',0,0,50,200,false,null,'sword','{}','ferramenta',false,1,0,1,'{"tool":"foice","tier":1,"eff":1.0,"speed":1.0,"dur":150}',1),
 ('martelo_ferreiro','Martelo de ferreiro','tool',0,0,150,500,false,null,'sword','{}','ferramenta',false,1,0,2,'{"tool":"martelo","tier":1,"eff":1.0,"speed":1.0,"dur":300}',1)
on conflict (id) do update set name = excluded.name, slot = excluded.slot, sell = excluded.sell, price = excluded.price, mat = excluded.mat, icon = excluded.icon, category = excluded.category, stackable = excluded.stackable, tier = excluded.tier, base_rarity = excluded.base_rarity, weight = excluded.weight, props = excluded.props, req_level = excluded.req_level;
update item_templates set category = 'material', stackable = false where mat and category = 'equipamento' and id not in ('pedra');
update item_templates set category = 'consumivel' where id = 'potion';

-- ---------- depósitos de recurso ----------
create table if not exists drop_tables (id text primary key, name text not null);
-- tipo base: sempre sai (qty_min..qty_max); tipo bonus: um sorteio mutuamente exclusivo por tentativa, na ordem de raridade
create table if not exists drop_entries (id bigserial primary key, table_id text not null references drop_tables(id), template_id text not null references item_templates(id), kind text not null check (kind in ('base','bonus')), chance numeric not null default 1, qty_min int not null default 1, qty_max int not null default 1, min_prof int not null default 1, min_tool_tier int not null default 0, purity_min int not null default 20, purity_max int not null default 60);
create table if not exists resource_nodes (id text primary key, name text not null, kind text not null, profession_id text not null references professions(id), tool text not null, tool_tier int not null default 1, req_level int not null default 1, hardness int not null default 1, extract_s numeric not null default 6, capacity int not null default 5, respawn_s int not null default 300, drop_table text not null references drop_tables(id), exp int not null default 10, x int not null, y int not null, region text);
create table if not exists resource_node_state (node_id text primary key references resource_nodes(id) on delete cascade, remaining int not null, refill_at timestamptz);
create table if not exists gather_jobs (id uuid primary key default gen_random_uuid(), character_id uuid not null references characters(id) on delete cascade, node_id text not null references resource_nodes(id), started_at timestamptz default now(), ready_at timestamptz not null, status text not null default 'ativo' check (status in ('ativo','pronto','cancelado')), result jsonb);
create index if not exists gather_jobs_char on gather_jobs(character_id, status);
alter table drop_tables enable row level security; alter table drop_entries enable row level security; alter table resource_nodes enable row level security; alter table resource_node_state enable row level security; alter table gather_jobs enable row level security;
do $$ declare t text; begin foreach t in array array['drop_tables','drop_entries','resource_nodes','resource_node_state'] loop execute format('drop policy if exists "read_%s" on %I', t, t); execute format('create policy "read_%s" on %I for select to authenticated using (true)', t, t); end loop; end $$;

insert into drop_tables(id, name) values ('rocha','Rocha'),('veio_cobre','Veio de cobre'),('veio_ferro','Veio de ferro'),('veio_prata','Veio de prata'),('veio_mitril','Veio de mitril'),('veio_profundo','Veio profundo'),('arvore','Árvore'),('carvalho_antigo','Carvalho antigo'),('erva','Moita de ervas'),('pesca','Ponto de pesca') on conflict (id) do update set name = excluded.name;
delete from drop_entries where true;
insert into drop_entries(table_id, template_id, kind, chance, qty_min, qty_max, min_prof, min_tool_tier, purity_min, purity_max) values
 ('rocha','pedra','base',1,1,3,1,0,10,40),
 ('rocha','fragmento_primordial','bonus',0.000001,1,1,80,4,40,90),('rocha','pepita_ouro','bonus',0.001,1,1,1,0,30,70),('rocha','gema_bruta','bonus',0.01,1,1,1,0,20,60),('rocha','minerio_ferro','bonus',0.10,1,1,1,0,20,50),('rocha','minerio_cobre','bonus',0.25,1,2,1,0,20,55),('rocha','carvao','bonus',0.25,1,2,1,0,30,60),
 ('veio_cobre','minerio_cobre','base',1,1,3,1,1,25,65),
 ('veio_cobre','pepita_ouro','bonus',0.002,1,1,1,1,30,70),('veio_cobre','rubi_bruto','bonus',0.004,1,1,5,1,20,60),('veio_cobre','gema_bruta','bonus',0.02,1,1,1,1,20,60),('veio_cobre','carvao','bonus',0.3,1,2,1,1,30,60),
 ('veio_ferro','minerio_ferro','base',1,1,3,15,2,25,65),
 ('veio_ferro','fragmento_primordial','bonus',0.000001,80,4,1,1,40,90),
 ('veio_ferro','minerio_mitril','bonus',0.001,30,2,1,1,30,70),('veio_ferro','safira_bruta','bonus',0.004,20,2,1,1,20,60),('veio_ferro','pepita_ouro','bonus',0.003,15,2,1,1,30,70),('veio_ferro','carvao','bonus',0.35,15,2,1,2,30,60),
 ('veio_prata','minerio_prata','base',1,1,2,25,2,30,70),
 ('veio_prata','cristal_celestial','bonus',0.00001,60,3,1,1,40,90),('veio_prata','minerio_mitril','bonus',0.002,30,2,1,1,30,70),('veio_prata','esmeralda_bruta','bonus',0.005,25,2,1,1,20,60),('veio_prata','pepita_ouro','bonus',0.01,25,2,1,1,30,70),
 ('veio_mitril','minerio_mitril','base',1,1,1,45,3,30,70),
 ('veio_mitril','cristal_celestial','bonus',0.00002,60,3,1,1,40,90),('veio_mitril','minerio_adamantita','bonus',0.0001,55,3,1,1,30,70),('veio_mitril','rubi_bruto','bonus',0.01,45,3,1,1,20,60),
 ('veio_profundo','minerio_adamantita','base',1,1,1,60,4,30,70),
 ('veio_profundo','fragmento_primordial','bonus',0.000002,80,4,1,1,40,90),('veio_profundo','cristal_celestial','bonus',0.00003,60,4,1,1,40,90),('veio_profundo','minerio_mitril','bonus',0.05,45,3,1,1,30,70),
 ('arvore','tora_comum','base',1,1,3,1,1,30,60),('arvore','tora_ancestral','bonus',0.002,1,1,1,1,40,80),('arvore','tora_carvalho','bonus',0.2,1,1,1,1,30,60),
 ('carvalho_antigo','tora_carvalho','base',1,1,2,20,2,35,70),('carvalho_antigo','tora_ancestral','bonus',0.01,1,1,20,2,40,85),
 ('erva','erva_curativa','base',1,1,3,1,1,30,70),('erva','raiz_antiga','bonus',0.005,1,1,1,1,40,85),('erva','flor_lunar','bonus',0.03,1,1,1,1,40,80),
 ('pesca','peixe_comum','base',1,1,2,1,1,30,70),('pesca','peixe_dourado','bonus',0.003,1,1,1,1,40,85),('pesca','peixe_prateado','bonus',0.08,1,1,1,1,35,75);
-- consertar a ordem dos campos dos bônus escritos como (chance, qmin, qmax, min_prof, tier...) acima: algumas linhas foram escritas com min_prof na posição de qty_min
update drop_entries set min_prof = qty_min, min_tool_tier = qty_max, qty_min = 1, qty_max = 1 where kind = 'bonus' and qty_min > 5;

-- ---------- receitas e trabalhos de oficina ----------
-- inputs: [{"t":"minerio_cobre","q":2}] ou [{"cat":"barra","q":3}] (o jogador escolhe a pilha) ou [{"part":"lamina"}] (o jogador escolhe a peça)
create table if not exists recipes (id text primary key, name text not null, profession_id text not null references professions(id), kind text not null check (kind in ('refino','componente','montagem','consumivel')), req_level int not null default 1, tool text, inputs jsonb not null, output jsonb not null, seconds numeric not null default 10, gold_cost bigint not null default 0, exp int not null default 10, techniques boolean not null default false, description text);
create table if not exists craft_jobs (id uuid primary key default gen_random_uuid(), character_id uuid not null references characters(id) on delete cascade, recipe_id text not null references recipes(id), technique text, qty int not null default 1, consumed jsonb not null, started_at timestamptz default now(), ready_at timestamptz not null, status text not null default 'ativo' check (status in ('ativo','pronto','cancelado')), result jsonb);
create index if not exists craft_jobs_char on craft_jobs(character_id, status);
alter table recipes enable row level security; alter table craft_jobs enable row level security;
drop policy if exists read_recipes on recipes; create policy read_recipes on recipes for select to authenticated using (true);
insert into recipes(id, name, profession_id, kind, req_level, tool, inputs, output, seconds, gold_cost, exp, techniques, description) values
 ('triturar_cobre','Triturar e separar cobre','metalurgia','refino',1,null,'[{"t":"minerio_cobre","q":2}]','{"t":"concentrado_cobre","q":1}',6,5,6,true,'Tritura o minério e separa a ganga'),
 ('triturar_ferro','Triturar e separar ferro','metalurgia','refino',10,null,'[{"t":"minerio_ferro","q":2}]','{"t":"concentrado_ferro","q":1}',8,10,10,true,'Tritura o minério e separa a ganga'),
 ('triturar_prata','Triturar e separar prata','metalurgia','refino',20,null,'[{"t":"minerio_prata","q":2}]','{"t":"concentrado_prata","q":1}',10,20,16,true,null),
 ('triturar_mitril','Triturar e separar mitril','metalurgia','refino',40,null,'[{"t":"minerio_mitril","q":2}]','{"t":"concentrado_mitril","q":1}',20,400,60,true,null),
 ('triturar_adamantita','Triturar e separar adamantita','metalurgia','refino',55,null,'[{"t":"minerio_adamantita","q":2}]','{"t":"concentrado_adamantita","q":1}',30,2500,120,true,null),
 ('fundir_cobre','Fundir barra de cobre','metalurgia','refino',1,null,'[{"t":"concentrado_cobre","q":1},{"t":"carvao","q":1}]','{"t":"barra_cobre","q":1}',8,8,8,true,'Fundição no forno'),
 ('fundir_ferro','Fundir barra de ferro','metalurgia','refino',10,null,'[{"t":"concentrado_ferro","q":1},{"t":"carvao","q":2}]','{"t":"barra_ferro","q":1}',10,15,12,true,null),
 ('fundir_prata','Fundir barra de prata','metalurgia','refino',20,null,'[{"t":"concentrado_prata","q":1},{"t":"carvao","q":2}]','{"t":"barra_prata","q":1}',12,30,18,true,null),
 ('fundir_ouro','Fundir barra de ouro','metalurgia','refino',25,null,'[{"t":"pepita_ouro","q":2},{"t":"carvao","q":1}]','{"t":"barra_ouro","q":1}',12,60,25,true,null),
 ('fundir_mitril','Fundir barra de mitril','metalurgia','refino',40,null,'[{"t":"concentrado_mitril","q":1},{"t":"carvao","q":4}]','{"t":"barra_mitril","q":1}',25,600,80,true,null),
 ('fundir_adamantita','Fundir barra de adamantita','metalurgia','refino',55,null,'[{"t":"concentrado_adamantita","q":1},{"t":"carvao","q":6}]','{"t":"barra_adamantita","q":1}',35,3000,150,true,null),
 ('purificar_barra','Purificar barra','metalurgia','refino',5,null,'[{"cat":"barra","q":2},{"t":"carvao","q":1}]','{"same":0,"q":1}',12,20,10,true,'Duas barras viram uma mais pura'),
 ('liga_ancestral','Liga ancestral','metalurgia','refino',60,null,'[{"t":"barra_mitril","q":1},{"t":"barra_adamantita","q":1},{"t":"cristal_celestial","q":1}]','{"t":"liga_ancestral","q":1}',60,20000,400,true,'A liga mais forte conhecida'),
 ('serrar_comum','Serrar tábuas','carpintaria','refino',1,null,'[{"t":"tora_comum","q":2}]','{"t":"tabua_comum","q":1}',5,2,5,false,null),
 ('serrar_carvalho','Serrar carvalho','carpintaria','refino',10,null,'[{"t":"tora_carvalho","q":2}]','{"t":"tabua_carvalho","q":1}',6,5,9,false,null),
 ('serrar_ancestral','Serrar madeira ancestral','carpintaria','refino',40,null,'[{"t":"tora_ancestral","q":1}]','{"t":"tabua_ancestral","q":1}',15,200,60,false,null),
 ('lapidar_quartzo','Lapidar quartzo','joalheria','refino',1,null,'[{"t":"gema_bruta","q":1}]','{"t":"quartzo","q":1}',8,10,8,true,null),
 ('lapidar_rubi','Lapidar rubi','joalheria','refino',15,null,'[{"t":"rubi_bruto","q":1}]','{"t":"rubi","q":1}',12,40,20,true,null),
 ('lapidar_safira','Lapidar safira','joalheria','refino',15,null,'[{"t":"safira_bruta","q":1}]','{"t":"safira","q":1}',12,40,20,true,null),
 ('lapidar_esmeralda','Lapidar esmeralda','joalheria','refino',15,null,'[{"t":"esmeralda_bruta","q":1}]','{"t":"esmeralda","q":1}',12,40,20,true,null),
 ('pocao_vida','Poção de vida','alquimia','consumivel',1,null,'[{"t":"erva_curativa","q":2}]','{"pots":3}',5,0,6,false,'Três poções'),
 ('pocao_superior','Poção superior','alquimia','consumivel',20,null,'[{"t":"erva_curativa","q":2},{"t":"flor_lunar","q":1}]','{"pots":12}',8,0,25,false,'Doze poções'),
 ('forjar_lamina','Forjar lâmina','ferraria','componente',1,'martelo','[{"cat":"barra","q":3}]','{"part":"lamina"}',15,15,14,false,'A lâmina define o dano'),
 ('forjar_guarda','Forjar guarda','ferraria','componente',1,'martelo','[{"cat":"barra","q":1}]','{"part":"guarda"}',8,5,6,false,'Protege a mão e soma resistência'),
 ('forjar_pomo','Forjar pomo','ferraria','componente',1,'martelo','[{"cat":"barra","q":1}]','{"part":"pomo"}',8,5,6,false,'Equilíbrio e chance de crítico'),
 ('fazer_empunhadura','Fazer empunhadura','carpintaria','componente',1,null,'[{"cat":"madeira","q":1}]','{"part":"empunhadura"}',6,3,6,false,'Peso e velocidade'),
 ('forjar_cabeca_picareta','Forjar cabeça de picareta','ferraria','componente',1,'martelo','[{"cat":"barra","q":2}]','{"part":"cabeca"}',12,10,10,false,'Define o nível da picareta'),
 ('montar_espada','Montar espada','ferraria','montagem',1,'martelo','[{"part":"lamina"},{"part":"guarda"},{"part":"empunhadura"},{"part":"pomo"}]','{"t":"espada_forjada"}',20,30,30,false,'Junta as quatro peças numa espada única'),
 ('montar_picareta','Montar picareta','ferraria','montagem',1,'martelo','[{"part":"cabeca"},{"part":"empunhadura"}]','{"t":"picareta_forjada"}',15,20,20,false,'Ferramenta feita por você')
on conflict (id) do update set name = excluded.name, profession_id = excluded.profession_id, kind = excluded.kind, req_level = excluded.req_level, tool = excluded.tool, inputs = excluded.inputs, output = excluded.output, seconds = excluded.seconds, gold_cost = excluded.gold_cost, exp = excluded.exp, techniques = excluded.techniques, description = excluded.description;

create table if not exists enchantments (id text primary key, name text not null, req_level int not null default 1, cost jsonb not null, effect jsonb not null, description text);
alter table enchantments enable row level security; drop policy if exists read_ench on enchantments; create policy read_ench on enchantments for select to authenticated using (true);
insert into enchantments(id, name, req_level, cost, effect, description) values
 ('ench_fio','Fio afiado',1,'{"t":"po_arcano","q":2,"gold":100}','{"atk":4}','+4 de ataque'),
 ('ench_vigor','Vigor',10,'{"t":"po_arcano","q":3,"gold":250}','{"hp":50}','+50 de vida'),
 ('ench_precisao','Precisão',20,'{"t":"po_arcano","q":4,"gold":500}','{"crit":3}','+3% de crítico'),
 ('ench_arcano','Arcano',30,'{"t":"po_arcano","q":6,"gold":1000}','{"matk":10}','+10 de dano mágico')
on conflict (id) do update set name = excluded.name, req_level = excluded.req_level, cost = excluded.cost, effect = excluded.effect;

create or replace function purity_band(p numeric) returns text language sql stable as $$ select b ->> 1 from jsonb_array_elements(cfg('purity') -> 'bands') b where (b ->> 0)::numeric <= p order by (b ->> 0)::numeric desc limit 1 $$;
create or replace function rand_normal() returns double precision language sql volatile as $$ select sqrt(-2 * ln(greatest(1e-12, random()))) * cos(2 * pi() * random()) $$;
create or replace function my_char() returns characters language sql stable security definer set search_path = public as $$ select * from characters where user_id = auth.uid() $$;
-- ferramenta equipada do tipo pedido
create or replace function tool_of(cid uuid, kind text) returns jsonb language sql stable as $$
  select jsonb_build_object('id', i.id, 'tier', coalesce((i.roll ->> 'tier')::numeric, (t.props ->> 'tier')::numeric, 1), 'eff', coalesce((i.roll ->> 'eff')::numeric, (t.props ->> 'eff')::numeric, 1), 'speed', coalesce((i.roll ->> 'speed')::numeric, (t.props ->> 'speed')::numeric, 1), 'dur', coalesce((i.roll ->> 'dur')::numeric, (t.props ->> 'dur')::numeric, 100))
  from inventory inv join items i on i.id = inv.item_id join item_templates t on t.id = i.template_id
  where inv.character_id = cid and inv.container in ('equip','bag','protected') and coalesce(t.props ->> 'tool', i.roll ->> 'tool') = kind
  order by coalesce((i.roll ->> 'tier')::numeric, (t.props ->> 'tier')::numeric, 1) desc, inv.container = 'equip' desc limit 1 $$;

-- ---------- coleta ----------
create or replace function gather_start(p_node text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; n resource_nodes; st resource_node_state; tool jsonb; pl int; secs numeric; jid uuid; last timestamptz; cap numeric;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into n from resource_nodes where id = p_node; if n.id is null then raise exception 'depósito inválido'; end if;
  if exists (select 1 from gather_jobs where character_id = c.id and status = 'ativo') then raise exception 'você já está coletando'; end if;
  select max(started_at) into last from gather_jobs where character_id = c.id; if last > now() - make_interval(secs => cfgn('craft','job_min_gap_s')) then raise exception 'devagar'; end if;
  pl := prof_level(c.id, n.profession_id); if pl < n.req_level then raise exception 'precisa de % nível % (você tem %)', (select name from professions where id = n.profession_id), n.req_level, pl; end if;
  tool := tool_of(c.id, n.tool); if tool is null then raise exception 'precisa de %', case n.tool when 'picareta' then 'uma picareta' when 'machado' then 'um machado' when 'vara' then 'uma vara de pesca' when 'foice' then 'uma foice' else n.tool end; end if;
  if (tool ->> 'tier')::numeric < n.tool_tier then raise exception 'sua ferramenta é fraca demais pra este depósito (precisa nível %)', n.tool_tier; end if;
  if (tool ->> 'dur')::numeric <= 0 then raise exception 'ferramenta quebrada: conserte antes'; end if;
  cap := (stats_of(c) ->> 'carry')::numeric; if carry_weight(c.id) >= cap then raise exception 'carga cheia (%/% kg): venda ou guarde materiais', round(carry_weight(c.id)), cap; end if;
  insert into resource_node_state(node_id, remaining) values (n.id, n.capacity) on conflict do nothing;
  select * into st from resource_node_state where node_id = n.id for update;
  if st.remaining <= 0 and st.refill_at > now() then raise exception 'depósito esgotado, volta em % s', ceil(extract(epoch from (st.refill_at - now()))); end if;
  if st.remaining <= 0 then update resource_node_state set remaining = n.capacity, refill_at = null where node_id = n.id; end if;
  secs := greatest(1.5, n.extract_s * (1 + (n.hardness - (tool ->> 'tier')::numeric) * 0.15) / (tool ->> 'speed')::numeric / (1 + pl * 0.004));
  insert into gather_jobs(character_id, node_id, ready_at) values (c.id, n.id, now() + make_interval(secs => secs)) returning id into jid;
  return jsonb_build_object('job', jid, 'seconds', round(secs, 1), 'ready_at', now() + make_interval(secs => secs));
end $$;
create or replace function gather_finish(p_job uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; j gather_jobs; n resource_nodes; tool jsonb; pl int; e drop_entries; r double precision; acc numeric := 0; luck numeric; got jsonb := '[]'; q int; pur int; lvl int; tid uuid; bonus_hit boolean := false; tt numeric;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into j from gather_jobs where id = p_job and character_id = c.id for update; if j.id is null or j.status <> 'ativo' then raise exception 'coleta já finalizada'; end if;
  if j.ready_at > now() then raise exception 'ainda não terminou'; end if;
  select * into n from resource_nodes where id = j.node_id;
  update resource_node_state set remaining = remaining - 1, refill_at = case when remaining - 1 <= 0 then now() + make_interval(secs => n.respawn_s) else refill_at end where node_id = n.id;
  pl := prof_level(c.id, n.profession_id); tool := tool_of(c.id, n.tool); tt := coalesce((tool ->> 'tier')::numeric, 1);
  luck := (stats_of(c) ->> 'luck')::numeric;
  -- base: sai sempre
  for e in select * from drop_entries where table_id = n.drop_table and kind = 'base' loop
    q := e.qty_min + floor(random() * (e.qty_max - e.qty_min + 1))::int; q := q + case when random() < ((tool ->> 'eff')::numeric - 1) then 1 else 0 end;
    pur := greatest(0, least(100, round(e.purity_min + random() * (e.purity_max - e.purity_min) + pl * 0.15)));
    perform stack_add(c.id, e.template_id, pur, q); got := got || jsonb_build_object('t', e.template_id, 'q', q, 'purity', pur, 'rarity', (select base_rarity from item_templates where id = e.template_id));
  end loop;
  -- bônus: um sorteio só, do mais raro pro mais comum; sorte e ferramenta ajudam de leve (teto configurado)
  r := random();
  for e in select d.* from drop_entries d join item_templates t on t.id = d.template_id where d.table_id = n.drop_table and d.kind = 'bonus' order by t.base_rarity desc, d.chance asc loop
    if pl < e.min_prof or tt < e.min_tool_tier then continue; end if;
    acc := acc + e.chance * (1 + luck) * (1 + least(0.1, (tt - n.tool_tier) * 0.03));
    if r < acc then
      pur := greatest(0, least(100, round(e.purity_min + random() * (e.purity_max - e.purity_min) + pl * 0.1)));
      perform stack_add(c.id, e.template_id, pur, 1); got := got || jsonb_build_object('t', e.template_id, 'q', 1, 'purity', pur, 'rarity', (select base_rarity from item_templates where id = e.template_id), 'bonus', true);
      if (select base_rarity from item_templates where id = e.template_id) >= 4 then insert into account_audit_log(user_id, action, meta) values (c.user_id, 'achado_raro', jsonb_build_object('item', e.template_id, 'node', n.id)); end if;
      exit;
    end if;
  end loop;
  -- desgaste da ferramenta e experiência
  if tool is not null then update items set roll = jsonb_set(coalesce(roll, '{}'), '{dur}', to_jsonb(greatest(0, (tool ->> 'dur')::numeric - 1))) where id = (tool ->> 'id')::uuid; end if;
  lvl := prof_gain(c.id, n.profession_id, n.exp);
  perform prof_gain(c.id, 'exploracao', 1);
  update gather_jobs set status = 'pronto', result = got where id = j.id;
  return jsonb_build_object('got', got, 'prof', n.profession_id, 'level', lvl, 'exp', n.exp, 'state', get_state());
end $$;
create or replace function gather_cancel() returns jsonb language plpgsql security definer set search_path = public as $$
begin update gather_jobs set status = 'cancelado' where character_id = (select id from characters where user_id = auth.uid()) and status = 'ativo'; return get_state(); end $$;
create or replace function nodes_view() returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'kind', n.kind, 'prof', n.profession_id, 'tool', n.tool, 'tool_tier', n.tool_tier, 'req', n.req_level, 'x', n.x, 'y', n.y, 'remaining', coalesce(s.remaining, n.capacity), 'capacity', n.capacity, 'refill_at', s.refill_at)), '[]') from resource_nodes n left join resource_node_state s on s.node_id = n.id $$;

-- ---------- oficina: refino, componentes, montagem ----------
create or replace function craft_start(p_recipe text, p_technique text default 'segura', p_qty int default 1, p_choices jsonb default '[]') returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; rc recipes; inp jsonb; k int := 0; ch jsonb; consumed jsonb := '[]'; tech jsonb; cost bigint; g bigint; secs numeric; jid uuid; pl int; tl jsonb; it record; qty int := greatest(1, least(20, p_qty)); n int; last timestamptz;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into rc from recipes where id = p_recipe; if rc.id is null then raise exception 'receita inválida'; end if;
  select count(*) into n from craft_jobs where character_id = c.id and status = 'ativo'; if n >= 3 then raise exception 'oficina cheia: no máximo 3 trabalhos ao mesmo tempo'; end if;
  select max(started_at) into last from craft_jobs where character_id = c.id; if last > now() - make_interval(secs => cfgn('craft','job_min_gap_s')) then raise exception 'devagar'; end if;
  pl := prof_level(c.id, rc.profession_id); if pl < rc.req_level then raise exception 'precisa de % nível %', (select name from professions where id = rc.profession_id), rc.req_level; end if;
  if rc.tool is not null then tl := tool_of(c.id, rc.tool); if tl is null then raise exception 'precisa de um martelo de ferreiro'; end if; end if;
  if rc.kind in ('componente','montagem') then qty := 1; end if;
  tech := case when rc.techniques then coalesce(cfg('techniques') -> coalesce(p_technique, 'segura'), cfg('techniques') -> 'segura') else '{"gold_mult":1,"purity_gain":0,"fail":0,"spread":3}' end;
  -- consome as entradas na hora (trava as linhas), guarda o que saiu pra devolver em caso de falha
  for inp in select * from jsonb_array_elements(rc.inputs) loop
    ch := p_choices -> k; k := k + 1;
    if inp ? 't' then
      -- material fixo: usa as pilhas mais puras primeiro, a menos que o jogador escolha uma pureza
      declare need int := (inp ->> 'q')::int * qty; s record; take int; begin
        for s in select * from inventory_stacks where character_id = c.id and template_id = inp ->> 't' and (ch is null or ch ->> 'purity' is null or purity = (ch ->> 'purity')::int) order by purity desc for update loop
          exit when need <= 0; take := least(need, s.qty); perform stack_take(c.id, s.template_id, s.purity, take); consumed := consumed || jsonb_build_object('t', s.template_id, 'purity', s.purity, 'q', take); need := need - take;
        end loop;
        if need > 0 then raise exception 'faltam % x %', need, (select name from item_templates where id = inp ->> 't'); end if; end;
    elsif inp ? 'cat' then
      if ch is null or ch ->> 't' is null then raise exception 'escolha o material da etapa %', k; end if;
      if (select category from item_templates where id = ch ->> 't') <> inp ->> 'cat' then raise exception 'material errado na etapa %', k; end if;
      perform stack_take(c.id, ch ->> 't', (ch ->> 'purity')::int, (inp ->> 'q')::int * qty);
      consumed := consumed || jsonb_build_object('t', ch ->> 't', 'purity', (ch ->> 'purity')::int, 'q', (inp ->> 'q')::int * qty, 'cat', inp ->> 'cat');
    elsif inp ? 'part' then
      if ch is null or ch ->> 'item' is null then raise exception 'escolha a peça: %', inp ->> 'part'; end if;
      select i.*, inv.container into it from items i join inventory inv on inv.item_id = i.id where i.id = (ch ->> 'item')::uuid and inv.character_id = c.id and inv.container = 'bag';
      if it.id is null or it.roll ->> 'part' <> inp ->> 'part' then raise exception 'peça inválida: %', inp ->> 'part'; end if;
      delete from inventory where item_id = it.id;
      consumed := consumed || jsonb_build_object('item', it.id, 'part', it.roll ->> 'part', 'roll', it.roll);
    end if;
  end loop;
  cost := ceil(rc.gold_cost * (tech ->> 'gold_mult')::numeric * qty);
  select gold into g from wallets where character_id = c.id; if g < cost then raise exception 'custa % gold', cost; end if;
  if cost > 0 then perform add_gold(c.id, -cost, 'oficina', rc.id); end if;
  secs := rc.seconds * qty / (1 + pl * 0.006);
  insert into craft_jobs(character_id, recipe_id, technique, qty, consumed, ready_at) values (c.id, rc.id, p_technique, qty, consumed, now() + make_interval(secs => secs)) returning id into jid;
  return jsonb_build_object('job', jid, 'seconds', round(secs, 1), 'state', get_state());
end $$;

-- monta uma peça a partir de uma barra/madeira: atributos vêm do material e da pureza
create or replace function make_part(part text, mat text, pur numeric, skill int) returns jsonb language plpgsql stable as $$
declare p jsonb := (select props from item_templates where id = mat); q numeric := greatest(0, least(100, pur * 0.7 + least(30, skill * 0.6) + rand_normal() * 4));
begin
  return jsonb_build_object('part', part, 'mat', mat, 'mat_name', (select name from item_templates where id = mat), 'purity', round(pur), 'quality', round(q), 'tier', (select tier from item_templates where id = mat),
    'power', round((p ->> 'power')::numeric * (0.7 + q / 100 * 0.6), 2), 'weight', (p ->> 'weight')::numeric, 'tough', round((p ->> 'tough')::numeric * (0.7 + q / 100 * 0.5)), 'magic', coalesce((p ->> 'magic')::numeric, 0));
end $$;
create or replace function rarity_from_quality(q numeric) returns int language plpgsql volatile as $$
declare cut jsonb := cfg('craft') -> 'rarity_cut'; r numeric := q + random() * 25; k int := 0;
begin for k in reverse 5..0 loop if r >= (cut ->> k)::numeric then return k + 1; end if; end loop; return 0; end $$;

create or replace function craft_finish(p_job uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; j craft_jobs; rc recipes; tech jsonb; pl int; avg_p numeric := 0; tot int := 0; e jsonb; fail boolean; pur int; outq int; nid uuid; res jsonb; parts jsonb := '{}'; lam jsonb; gua jsonb; emp jsonb; pom jsonb; cab jsonb; q numeric; dmin numeric; dmax numeric; aspd numeric; crit numeric; dur numeric; rar int; n int; tl jsonb;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into j from craft_jobs where id = p_job and character_id = c.id for update; if j.id is null or j.status <> 'ativo' then raise exception 'trabalho já finalizado'; end if;
  if j.ready_at > now() then raise exception 'ainda não terminou'; end if;
  select * into rc from recipes where id = j.recipe_id; pl := prof_level(c.id, rc.profession_id);
  tech := case when rc.techniques then coalesce(cfg('techniques') -> coalesce(j.technique, 'segura'), cfg('techniques') -> 'segura') else '{"gold_mult":1,"purity_gain":0,"fail":0,"spread":3}' end;
  for e in select * from jsonb_array_elements(j.consumed) loop if e ? 'purity' then avg_p := avg_p + (e ->> 'purity')::numeric * (e ->> 'q')::int; tot := tot + (e ->> 'q')::int; end if; end loop;
  avg_p := case when tot > 0 then avg_p / tot else 50 end;
  fail := random() < greatest(0, (tech ->> 'fail')::numeric - pl * 0.0008);
  if fail then
    -- falha parcial: devolve metade do que foi consumido, um pouco menos puro
    for e in select * from jsonb_array_elements(j.consumed) loop
      if e ? 't' then perform stack_add(c.id, e ->> 't', greatest(0, (e ->> 'purity')::int - 5), floor((e ->> 'q')::int / 2.0)::int);
      elsif e ? 'item' then select count(*) into n from inventory where character_id = c.id and container = 'bag'; insert into items(id, template_id, rarity, roll, origin) values ((e ->> 'item')::uuid, 'comp_' || case e ->> 'part' when 'cabeca' then 'cabeca_picareta' else e ->> 'part' end, 0, e -> 'roll', 'devolvido') on conflict (id) do nothing; insert into inventory(item_id, character_id, container, idx) values ((e ->> 'item')::uuid, c.id, 'bag', n) on conflict (item_id) do update set character_id = c.id, container = 'bag'; end if;
    end loop;
    perform prof_gain(c.id, rc.profession_id, ceil(rc.exp * j.qty * 0.3));
    update craft_jobs set status = 'pronto', result = '{"fail":true}' where id = j.id;
    return jsonb_build_object('fail', true, 'state', get_state());
  end if;
  if rc.kind = 'refino' then
    pur := greatest(0, least(100, round(avg_p + (tech ->> 'purity_gain')::numeric * (0.6 + pl / 250.0) + rand_normal() * (tech ->> 'spread')::numeric)));
    outq := (rc.output ->> 'q')::int * j.qty;
    if rc.output ? 'same' then perform stack_add(c.id, (j.consumed -> 0) ->> 't', pur, outq); res := jsonb_build_object('t', (j.consumed -> 0) ->> 't', 'q', outq, 'purity', pur);
    else perform stack_add(c.id, rc.output ->> 't', pur, outq); res := jsonb_build_object('t', rc.output ->> 't', 'q', outq, 'purity', pur); end if;
    if rc.profession_id = 'metalurgia' and random() < 0.15 then perform stack_add(c.id, 'po_arcano', 40, 1); res := res || '{"sub":"po_arcano"}'; end if;
  elsif rc.kind = 'consumivel' then
    update characters set pots = pots + (rc.output ->> 'pots')::int * j.qty where id = c.id; res := jsonb_build_object('pots', (rc.output ->> 'pots')::int * j.qty);
  elsif rc.kind = 'componente' then
    e := j.consumed -> 0;
    res := make_part(rc.output ->> 'part', e ->> 't', (e ->> 'purity')::numeric, pl);
    select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n >= 20 then raise exception 'mochila cheia'; end if;
    insert into items(template_id, rarity, roll, origin, crafted_by, crafted_at) values (case rc.output ->> 'part' when 'cabeca' then 'comp_cabeca_picareta' else 'comp_' || (rc.output ->> 'part') end, 0, res, 'oficina', c.name, now()) returning id into nid;
    insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', n); res := res || jsonb_build_object('id', nid);
  else
    for e in select * from jsonb_array_elements(j.consumed) loop parts := parts || jsonb_build_object(e ->> 'part', e -> 'roll'); end loop;
    tl := tool_of(c.id, 'martelo');
    if rc.output ->> 't' = 'espada_forjada' then
      lam := parts -> 'lamina'; gua := parts -> 'guarda'; emp := parts -> 'empunhadura'; pom := parts -> 'pomo';
      -- qualidade final: materiais, pureza, nível do ferreiro, ferramenta e um pouco de sorte
      q := greatest(0, least(100, ((lam ->> 'quality')::numeric * 0.45 + (gua ->> 'quality')::numeric * 0.15 + (emp ->> 'quality')::numeric * 0.15 + (pom ->> 'quality')::numeric * 0.15) * cfgn('craft','quality_purity_w') / 0.55
        + least(cfgn('craft','quality_skill_cap'), pl * 0.5) * 0.3 + coalesce((tl ->> 'tier')::numeric, 1) * 2 + rand_normal() * 5));
      dmin := round(((lam ->> 'power')::numeric * 1.0 + (gua ->> 'power')::numeric * 0.2 + (pom ->> 'power')::numeric * 0.1) * (0.6 + q / 100 * 0.8) * 0.8, 1);
      dmax := round(dmin * (1.45 + (pom ->> 'power')::numeric * 0.01), 1);
      aspd := round(greatest(0.7, least(1.3, 1.3 - ((lam ->> 'weight')::numeric + (gua ->> 'weight')::numeric * 0.4 + (emp ->> 'weight')::numeric * 0.3) * 0.12)), 2);
      crit := round((pom ->> 'magic')::numeric * 0.4 + (pom ->> 'quality')::numeric * 0.03, 1);
      dur := round(((lam ->> 'tough')::numeric + (gua ->> 'tough')::numeric * 0.5 + (emp ->> 'tough')::numeric * 0.5) * 2);
      rar := rarity_from_quality(q);
      res := jsonb_build_object('dmin', dmin, 'dmax', dmax, 'aspd', aspd, 'crit', crit, 'dur', dur, 'maxdur', dur, 'quality', round(q), 'purity', round(((lam ->> 'purity')::numeric + (gua ->> 'purity')::numeric + (pom ->> 'purity')::numeric) / 3), 'sockets', case when q > 85 then 2 when q > 60 then 1 else 0 end, 'gems', '[]'::jsonb, 'ench', '[]'::jsonb, 'upgrade', 0, 'maker', c.name, 'made_at', now(), 'origin', 'Forja de ' || c.name, 'components', parts, 'name', (lam ->> 'mat_name') || ' · ' || case rar when 0 then 'comum' else lower((cfg('rarities') -> rar) ->> 'name') end);
    else
      cab := parts -> 'cabeca'; emp := parts -> 'empunhadura';
      q := greatest(0, least(100, (cab ->> 'quality')::numeric * 0.7 + (emp ->> 'quality')::numeric * 0.3 + rand_normal() * 4));
      rar := rarity_from_quality(q);
      res := jsonb_build_object('tool', 'picareta', 'tier', (cab ->> 'tier')::int, 'eff', round(1 + q / 100 * 0.5, 2), 'speed', round(1 + q / 100 * 0.4 - (cab ->> 'weight')::numeric * 0.05, 2), 'dur', round((cab ->> 'tough')::numeric * 3), 'maxdur', round((cab ->> 'tough')::numeric * 3), 'quality', round(q), 'maker', c.name, 'made_at', now(), 'components', parts, 'name', 'Picareta de ' || lower(cab ->> 'mat_name'));
    end if;
    select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n >= 20 then raise exception 'mochila cheia'; end if;
    insert into items(template_id, rarity, roll, origin, crafted_by, crafted_at) values (rc.output ->> 't', rar, res, 'oficina', c.name, now()) returning id into nid;
    insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', n);
    res := res || jsonb_build_object('id', nid, 'rarity', rar);
    insert into account_audit_log(user_id, action, meta) values (c.user_id, 'fabricou', jsonb_build_object('item', nid, 'tpl', rc.output ->> 't', 'rarity', rar, 'quality', round(q)));
  end if;
  perform prof_gain(c.id, rc.profession_id, rc.exp * j.qty);
  update craft_jobs set status = 'pronto', result = res where id = j.id;
  return jsonb_build_object('fail', false, 'result', res, 'state', get_state());
end $$;

-- ---------- aprimorar, consertar, desmontar, gemas, encantar ----------
create or replace function item_action(p_item uuid, p_action text, p_arg jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; it items; t item_templates; up int; ch numeric; cost bigint; g bigint; mat text; dur numeric; maxd numeric; gem jsonb; en enchantments; ret numeric := cfgn('craft','dismantle_return'); comp jsonb; k text; won boolean;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select i.* into it from items i join inventory inv on inv.item_id = i.id where i.id = p_item and inv.character_id = c.id and inv.container in ('bag','equip','protected') for update of i;
  if it.id is null then raise exception 'item não é seu'; end if;
  select * into t from item_templates where id = it.template_id;
  if p_action = 'aprimorar' then
    up := coalesce((it.roll ->> 'upgrade')::int, 0); if up >= cfgn('craft','upgrade_max') then raise exception 'já está no máximo'; end if;
    mat := coalesce(it.roll #>> '{components,lamina,mat}', it.roll #>> '{components,cabeca,mat}', 'barra_ferro');
    cost := 200 * power(1.6, up)::bigint; select gold into g from wallets where character_id = c.id; if g < cost then raise exception 'custa % gold', cost; end if;
    perform add_gold(c.id, -cost, 'aprimorar', it.id::text);
    -- precisa de uma barra do mesmo metal (pureza qualquer, usa a mais pura)
    perform stack_take(c.id, mat, (select purity from inventory_stacks where character_id = c.id and template_id = mat order by purity desc limit 1), 1);
    ch := ((cfg('craft') -> 'upgrade_chance') ->> up)::numeric; won := random() < ch;
    if won then update items set roll = roll || jsonb_build_object('upgrade', up + 1, 'dmin', round(coalesce((roll ->> 'dmin')::numeric, 0) * (1 + cfgn('craft','upgrade_gain')), 1), 'dmax', round(coalesce((roll ->> 'dmax')::numeric, 0) * (1 + cfgn('craft','upgrade_gain')), 1)) where id = it.id; end if;
    return jsonb_build_object('ok', won, 'chance', ch, 'state', get_state());
  elsif p_action = 'consertar' then
    dur := coalesce((it.roll ->> 'dur')::numeric, 0); maxd := coalesce((it.roll ->> 'maxdur')::numeric, (t.props ->> 'dur')::numeric, 0);
    if maxd <= 0 or dur >= maxd then raise exception 'não precisa de conserto'; end if;
    cost := ceil((maxd - dur) * cfgn('craft','repair_cost_per_point')); select gold into g from wallets where character_id = c.id; if g < cost then raise exception 'conserto custa % gold', cost; end if;
    perform add_gold(c.id, -cost, 'conserto', it.id::text);
    -- cada conserto reduz um pouco a durabilidade máxima
    update items set roll = roll || jsonb_build_object('dur', floor(maxd * 0.98), 'maxdur', floor(maxd * 0.98)) where id = it.id;
    return jsonb_build_object('ok', true, 'cost', cost, 'state', get_state());
  elsif p_action = 'desmontar' then
    if it.roll -> 'components' is null then raise exception 'só itens fabricados podem ser desmontados'; end if;
    for k, comp in select key, value from jsonb_each(it.roll -> 'components') loop
      perform stack_add(c.id, comp ->> 'mat', greatest(0, (comp ->> 'purity')::int - 10), greatest(1, floor((case k when 'lamina' then 3 when 'cabeca' then 2 else 1 end) * ret)::int));
    end loop;
    perform stack_add(c.id, 'po_arcano', 40, 1 + coalesce((it.roll ->> 'upgrade')::int, 0) + it.rarity);
    delete from inventory where item_id = it.id; delete from items where id = it.id;
    return jsonb_build_object('ok', true, 'state', get_state());
  elsif p_action = 'gema' then
    if coalesce(jsonb_array_length(it.roll -> 'gems'), 0) >= coalesce((it.roll ->> 'sockets')::int, 0) then raise exception 'sem espaço pra gema'; end if;
    if (select category from item_templates where id = p_arg ->> 't') <> 'gema' then raise exception 'escolha uma gema lapidada'; end if;
    perform stack_take(c.id, p_arg ->> 't', (p_arg ->> 'purity')::int, 1);
    gem := (select props from item_templates where id = p_arg ->> 't') || jsonb_build_object('t', p_arg ->> 't');
    update items set roll = roll || jsonb_build_object('gems', coalesce(roll -> 'gems', '[]') || gem, 'crit', coalesce((roll ->> 'crit')::numeric, 0) + coalesce((gem ->> 'crit')::numeric, 0), 'hp', coalesce((roll ->> 'hp')::numeric, 0) + coalesce((gem ->> 'hp')::numeric, 0), 'matk', coalesce((roll ->> 'matk')::numeric, 0) + coalesce((gem ->> 'matk')::numeric, 0), 'mdef', coalesce((roll ->> 'mdef')::numeric, 0) + coalesce((gem ->> 'mdef')::numeric, 0), 'atk', coalesce((roll ->> 'atk')::numeric, 0) + coalesce((gem ->> 'patk')::numeric, 0)) where id = it.id;
    return jsonb_build_object('ok', true, 'state', get_state());
  elsif p_action = 'encantar' then
    select * into en from enchantments where id = p_arg ->> 'ench'; if en.id is null then raise exception 'encantamento inválido'; end if;
    if prof_level(c.id, 'encantamento') < en.req_level then raise exception 'precisa de Encantamento nível %', en.req_level; end if;
    if coalesce(jsonb_array_length(it.roll -> 'ench'), 0) >= 2 then raise exception 'máximo de 2 encantamentos'; end if;
    perform stack_take(c.id, en.cost ->> 't', (select purity from inventory_stacks where character_id = c.id and template_id = en.cost ->> 't' order by purity desc limit 1), (en.cost ->> 'q')::int);
    select gold into g from wallets where character_id = c.id; if g < (en.cost ->> 'gold')::bigint then raise exception 'custa % gold', en.cost ->> 'gold'; end if;
    perform add_gold(c.id, -(en.cost ->> 'gold')::bigint, 'encantamento', it.id::text);
    update items set roll = roll || jsonb_build_object('ench', coalesce(roll -> 'ench', '[]') || to_jsonb(en.id)) || (select jsonb_object_agg(key, coalesce((it.roll ->> key)::numeric, 0) + value::numeric) from jsonb_each_text(en.effect)) where id = it.id;
    perform prof_gain(c.id, 'encantamento', 20 + en.req_level);
    return jsonb_build_object('ok', true, 'state', get_state());
  end if;
  raise exception 'ação inválida';
end $$;

-- vender materiais pro NPC (preço base; regional fica pra fase de economia)
create or replace function sell_stack(p_tpl text, p_purity int, p_qty int) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; t item_templates; v bigint;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into t from item_templates where id = p_tpl; if t.id is null or not t.stackable then raise exception 'item inválido'; end if;
  if p_qty < 1 then raise exception 'quantidade inválida'; end if;
  perform stack_take(c.id, p_tpl, p_purity, p_qty);
  v := floor(t.sell * p_qty * (0.6 + p_purity / 100.0 * 0.6));
  perform add_gold(c.id, v, 'venda_npc_material', p_tpl);
  perform prof_gain(c.id, 'comercio', greatest(1, v / 50));
  return jsonb_build_object('gold', v, 'state', get_state());
end $$;
-- equipar ferramenta no espaço próprio
create or replace function equip_item(p_item uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; it items; t item_templates; old uuid; sl text;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select i.* into it from items i join inventory inv on inv.item_id = i.id where i.id = p_item and inv.character_id = c.id and inv.container in ('bag','protected');
  if it.id is null then raise exception 'item não está na sua mochila'; end if;
  select * into t from item_templates where id = it.template_id; sl := t.slot;
  if sl is null then raise exception 'não equipável'; end if;
  if t.voc is not null and not (c.vocation = any(t.voc)) then raise exception 'outra vocação'; end if;
  if c.level < t.req_level then raise exception 'precisa de nível %', t.req_level; end if;
  select item_id into old from inventory where character_id = c.id and container = 'equip' and slot = sl;
  if old is not null then update inventory set container = 'bag', slot = null, updated_at = now() where item_id = old; end if;
  update inventory set container = 'equip', slot = sl, updated_at = now() where item_id = p_item;
  return get_state();
end $$;

grant execute on function gather_start(text), gather_finish(uuid), gather_cancel(), nodes_view(), craft_start(text,text,int,jsonb), craft_finish(uuid), item_action(uuid,text,jsonb), sell_stack(text,int,int) to authenticated;
revoke all on function gather_start(text), gather_finish(uuid), gather_cancel(), nodes_view(), craft_start(text,text,int,jsonb), craft_finish(uuid), item_action(uuid,text,jsonb), sell_stack(text,int,int) from anon;
revoke all on function stack_add(uuid,text,int,int), stack_take(uuid,text,int,int), prof_gain(uuid,text,bigint), make_part(text,text,numeric,int) from public, anon, authenticated;

-- ---------- simulação de balanceamento (só administrador, pela chave de serviço) ----------
create or replace function balance_sim_node(p_table text, p_attempts int, p_prof int, p_tier int, p_luck numeric) returns jsonb language plpgsql volatile as $$
declare e drop_entries; r double precision; acc numeric; i int; counts jsonb := '{}';
begin
  for i in 1..p_attempts loop
    r := random(); acc := 0;
    for e in select d.* from drop_entries d join item_templates t on t.id = d.template_id where d.table_id = p_table and d.kind = 'bonus' order by t.base_rarity desc, d.chance asc loop
      if p_prof < e.min_prof or p_tier < e.min_tool_tier then continue; end if;
      acc := acc + e.chance * (1 + least(cfgn('stats','luck_cap'), p_luck)); if r < acc then counts := counts || jsonb_build_object(e.template_id, coalesce((counts ->> e.template_id)::int, 0) + 1); exit; end if;
    end loop;
  end loop;
  return jsonb_build_object('table', p_table, 'attempts', p_attempts, 'counts', counts);
end $$;
create or replace function economy_report() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'gold_total', (select sum(gold) from wallets), 'gems_total', (select sum(gems) from wallets),
    'gold_in_24h', (select coalesce(sum(amount), 0) from ledger where currency = 'gold' and amount > 0 and created_at > now() - interval '24 hours'),
    'gold_out_24h', (select coalesce(-sum(amount), 0) from ledger where currency = 'gold' and amount < 0 and created_at > now() - interval '24 hours'),
    'by_reason_24h', (select jsonb_object_agg(reason, s) from (select reason, sum(amount) s from ledger where created_at > now() - interval '24 hours' group by reason) x),
    'items_by_rarity', (select jsonb_object_agg(rarity, n) from (select rarity, count(*) n from items group by rarity) x),
    'stacks', (select jsonb_object_agg(template_id, q) from (select template_id, sum(qty) q from inventory_stacks group by template_id) x),
    'market_volume_24h', (select count(*) from market_transactions where created_at > now() - interval '24 hours'))
$$;
revoke all on function balance_sim_node(text,int,int,int,numeric), economy_report() from public, anon, authenticated;
