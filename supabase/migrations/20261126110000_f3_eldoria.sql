-- Expansão, fase 3: reinos e regiões com nível de zona, Eldoria (1 a 20) com área mítica, fronteiras de Frostheim, Ignareth e Nocthar,
-- criaturas com família/categoria/drops que alimentam receitas, armaduras forjadas, preço regional, bestiário e guardião mítico.
set search_path = public;

-- ---------- reinos (território) e regiões ----------
create table if not exists realms (id text primary key, name text not null, level_min int not null, level_max int not null, description text, mythic_area text, dimension text, sort int default 0, open boolean not null default false);
create table if not exists world_regions (id text primary key, realm_id text not null references realms(id), name text not null, tier text not null check (tier in ('segura','selvagem','hostil','elite','mitica')), level_min int not null, level_max int not null, biome text, description text);
alter table realms enable row level security; alter table world_regions enable row level security;
drop policy if exists read_realms on realms; create policy read_realms on realms for select to authenticated using (true);
drop policy if exists read_wregions on world_regions; create policy read_wregions on world_regions for select to authenticated using (true);
insert into realms(id, name, level_min, level_max, description, mythic_area, dimension, sort, open) values
 ('eldoria','Eldoria',1,20,'Planícies, florestas e rios. Onde todo aventureiro começa.','Floresta dos Ancestrais','Reino Espiritual',1,true),
 ('frostheim','Frostheim',15,35,'Montanhas, geleiras e cavernas congeladas.','Coração da Geleira','Vazio Glacial',2,false),
 ('solkar','Solkar',30,50,'Desertos, ruínas e oásis.','Templo do Sol Eterno','Dimensão Solar',3,false),
 ('viridion','Viridion',45,65,'Selvas, pântanos e florestas ancestrais.','Árvore Primordial','Plano Primordial',4,false),
 ('ignareth','Ignareth',60,85,'Vulcões, obsidiana e dragões.','Forja do Mundo','Inferno Abissal',5,false),
 ('nocthar','Nocthar',80,100,'Terras corrompidas e abismos.','Abismo da Realidade','Dimensão do Vazio',6,false)
on conflict (id) do update set name = excluded.name, level_min = excluded.level_min, level_max = excluded.level_max, description = excluded.description, mythic_area = excluded.mythic_area, dimension = excluded.dimension, sort = excluded.sort, open = excluded.open;
insert into world_regions(id, realm_id, name, tier, level_min, level_max, biome, description) values
 ('vila','eldoria','Vila de Arken','segura',1,20,'cidade','Comércio, oficinas, missões e descanso.'),
 ('campos','eldoria','Campos Dourados','selvagem',1,10,'planicie','Fazendas, estradas, javalis, goblins e bandidos.'),
 ('floresta','eldoria','Floresta Sombria','hostil',10,16,'floresta','Aranhas, lobos e madeira boa.'),
 ('pantano','eldoria','Pântano Vermelho','elite',15,20,'pantano','Afogados e a Bruxa. Ingredientes raros.'),
 ('ancestrais','eldoria','Floresta dos Ancestrais','mitica',18,24,'floresta_antiga','Ents antigos, o Ancião e o portal selado do Reino Espiritual.'),
 ('montanhas','frostheim','Fronteira de Frostheim','hostil',25,35,'montanha','Lobos glaciais e trolls de gelo. Caminho pra Frostheim.'),
 ('minas','ignareth','Fronteira de Ignareth','hostil',60,85,'mina','Minas profundas, golens e vespas.'),
 ('ruinas','nocthar','Fronteira de Nocthar','elite',80,100,'ruina','Cavaleiros caídos, sentinelas e o Rei Esquecido.')
on conflict (id) do update set realm_id = excluded.realm_id, name = excluded.name, tier = excluded.tier, level_min = excluded.level_min, level_max = excluded.level_max, biome = excluded.biome, description = excluded.description;
alter table hunts add column if not exists wregion text references world_regions(id);
alter table hunts add column if not exists tier text;

-- ---------- criaturas: família, variante, categoria, reino, bioma, resistências, drops ----------
alter table creatures add column if not exists family text;
alter table creatures add column if not exists category text not null default 'comum';
alter table creatures add column if not exists realm_id text references realms(id);
alter table creatures add column if not exists biome text;
alter table creatures add column if not exists resist jsonb not null default '{}';
alter table creatures add column if not exists weak jsonb not null default '{}';
alter table creatures add column if not exists abilities jsonb not null default '[]';
alter table creatures add column if not exists behavior text default 'agressivo';
alter table creatures add column if not exists description text;
insert into game_config(key, value, note) values
 ('creature_curve', '{"hp_base":18,"hp_k":5,"hp_pow":1.5,"atk_base":4,"atk_k":1.6,"def_k":0.5,"exp_base":5,"exp_k":2,"exp_pow":1.7,"cat":{"comum":1,"incomum":1.3,"rara":1.7,"elite":2.4,"miniboss":6,"boss":18,"guardiao":30}}', 'atributos das criaturas a partir do nível e da categoria')
on conflict (key) do update set value = excluded.value;
create or replace function creature_fit(lvl int, cat text) returns jsonb language sql stable as $$
  select jsonb_build_object('hp', round((c->>'hp_base')::numeric + power(lvl, (c->>'hp_pow')::numeric) * (c->>'hp_k')::numeric * m),
    'atk', round(((c->>'atk_base')::numeric + lvl * (c->>'atk_k')::numeric) * (1 + (m - 1) * 0.25)), 'def', round(lvl * (c->>'def_k')::numeric * (1 + (m - 1) * 0.2)),
    'exp', round(((c->>'exp_base')::numeric + power(lvl, (c->>'exp_pow')::numeric) * (c->>'exp_k')::numeric) * m), 'gmin', lvl, 'gmax', lvl * 2 + 2)
  from (select cfg('creature_curve') c, coalesce((cfg('creature_curve') -> 'cat' ->> cat)::numeric, 1) m) x $$;

-- novos materiais de criatura (todos têm receita)
insert into item_templates(id,name,slot,atk,def,sell,price,mat,voc,icon,extra,category,stackable,tier,base_rarity,weight,props,req_level) values
 ('couro_cru','Couro cru',null,0,0,8,null,true,null,'cape','{}','bruto',true,1,0,0.8,'{}',1),
 ('couro','Couro curtido',null,0,0,24,null,true,null,'cape','{}','couro',true,1,0,0.6,'{"power":3,"weight":0.3,"tough":40,"magic":0}',1),
 ('presa_javali','Presa de javali',null,0,0,15,null,true,null,'tusk','{}','bruto',true,1,0,0.2,'{}',1),
 ('fio_seda','Fio de seda',null,0,0,18,null,true,null,'rope','{}','bruto',true,1,1,0.05,'{}',1),
 ('osso','Osso',null,0,0,4,null,true,null,'bone','{}','bruto',true,1,0,0.3,'{}',1),
 ('essencia_sombria','Essência sombria',null,0,0,90,null,true,null,'orb','{}','reagente',true,2,2,0.05,'{}',1),
 ('sucata','Sucata',null,0,0,6,null,true,null,'wheel','{}','bruto',true,1,0,0.8,'{"metal":"ferro"}',1),
 ('cristal_gelo','Cristal de gelo',null,0,0,140,null,true,null,'gem','{}','reagente',true,2,2,0.1,'{}',1),
 ('casca_ent','Casca de ent',null,0,0,120,null,true,null,'log','{}','madeira',true,3,2,0.8,'{"power":6,"weight":0.5,"tough":60,"magic":3}',1),
 ('selo_eldoria','Selo de Eldoria',null,0,0,0,null,true,null,'orb','{}','artefato',true,5,4,0.1,'{}',1),
 ('armadura_forjada','Armadura forjada','armor',0,0,0,null,false,null,'armor','{}','armadura',false,1,0,6,'{}',1),
 ('escudo_forjado','Escudo forjado','shield',0,0,0,null,false,null,'shield','{}','escudo',false,1,0,4,'{}',1),
 ('manto_seda','Manto de seda','armor',0,0,0,null,false,null,'cape','{}','armadura',false,1,0,1.5,'{}',1)
on conflict (id) do update set name = excluded.name, slot = excluded.slot, sell = excluded.sell, icon = excluded.icon, category = excluded.category, stackable = excluded.stackable, tier = excluded.tier, base_rarity = excluded.base_rarity, weight = excluded.weight, props = excluded.props;

insert into creatures(id,name,level,hp,atk,def,exp,gold_min,gold_max,drop_item,drop_chance,boss,sprite) values
 ('goblin','Goblin saqueador',7,1,1,1,1,1,1,null,0,false,'bandit'),
 ('ent','Ent ancestral',19,1,1,1,1,1,1,null,0,false,'golem'),
 ('anciao','O Ancião da Floresta',24,1,1,1,1,1,1,null,0,true,'golem')
on conflict (id) do nothing;
-- novo nível de cada criatura por região (os números de vida, ataque, defesa e exp saem da curva)
with spec(id, lvl, cat, fam, realm, biome, nm, descr, res, wk) as (values
 ('rato',1,'comum','roedor','eldoria','campos','Rato-do-campo','Come o grão dos celeiros.','{}'::jsonb,'{"fogo":20}'::jsonb),
 ('javali',5,'comum','javali','eldoria','campos','Javali','Fuça a borda dos bosques.','{"fisico":5}','{"perfurante":15}'),
 ('goblin',7,'comum','goblin','eldoria','campos','Goblin saqueador','Rouba sucata e caravanas.','{}','{"fogo":10}'),
 ('bandido',9,'incomum','humano','eldoria','campos','Bandido','Embosca na estrada.','{}','{}'),
 ('aranha',12,'comum','aracnideo','eldoria','floresta','Aranha-de-teia','Tece ninhos na ravina.','{"veneno":40}','{"fogo":25}'),
 ('lobo',15,'comum','lobo','eldoria','floresta','Lobo selvagem','Caça em matilha.','{}','{"fogo":10}'),
 ('afogado',17,'incomum','morto_vivo','eldoria','pantano','Afogado','Sai da água parada.','{"agua":50,"veneno":50}','{"sagrado":30}'),
 ('bruxa',19,'elite','humano','eldoria','pantano','Bruxa do pântano','Amaldiçoa quem se aproxima.','{"magico":20}','{"fisico":15}'),
 ('ent',19,'elite','planta','eldoria','floresta_antiga','Ent ancestral','Árvore viva que guarda os ancestrais.','{"fisico":25}','{"fogo":40}'),
 ('anciao',24,'guardiao','planta','eldoria','floresta_antiga','O Ancião da Floresta','Guardião mítico de Eldoria. Mantém o portal do Reino Espiritual selado.','{"fisico":30,"magico":10}','{"fogo":30}'),
 ('lobo_neve',26,'incomum','lobo','frostheim','montanha','Lobo glacial','Variante do lobo adaptada ao gelo.','{"gelo":60}','{"fogo":30}'),
 ('troll_gelo',33,'elite','troll','frostheim','montanha','Troll de gelo','Regenera rápido no frio.','{"gelo":70,"fisico":15}','{"fogo":40}'),
 ('mineiro',62,'comum','morto_vivo','ignareth','mina','Mineiro morto','Ainda cava no escuro.','{}','{"sagrado":25}'),
 ('golem',70,'incomum','golem','ignareth','mina','Golem de carvão','Pedra com brasa por dentro.','{"fogo":60,"fisico":20}','{"agua":30}'),
 ('vespa',78,'elite','inseto','ignareth','mina','Vespa-rainha','Ferrão que atravessa armadura.','{"veneno":60}','{"gelo":20}'),
 ('capataz',85,'miniboss','morto_vivo','ignareth','mina','O Capataz','Manda nos mortos da mina.','{"fisico":20}','{"sagrado":25}'),
 ('mae_vespas',88,'boss','inseto','ignareth','mina','Mãe das Vespas','O ninho inteiro obedece.','{"veneno":80}','{"gelo":25}'),
 ('cavaleiro',85,'incomum','morto_vivo','nocthar','ruina','Cavaleiro caído','Juramento quebrado.','{"fisico":20}','{"sagrado":30}'),
 ('sentinela',90,'elite','golem','nocthar','ruina','Sentinela de pedra','Vigia o templo partido.','{"fisico":35}','{"raio":25}'),
 ('guardiao',95,'elite','golem','nocthar','ruina','Guardião de pedra','Protege a cripta.','{"fisico":40}','{"raio":25}'),
 ('rei',100,'boss','morto_vivo','nocthar','ruina','Rei Esquecido','Senhor das ruínas.','{"sombrio":50}','{"sagrado":40}')
)
update creatures c set level = s.lvl, category = s.cat, family = s.fam, realm_id = s.realm, biome = s.biome, name = s.nm, description = s.descr, resist = s.res, weak = s.wk,
  hp = (creature_fit(s.lvl, s.cat) ->> 'hp')::int, atk = (creature_fit(s.lvl, s.cat) ->> 'atk')::int, def = (creature_fit(s.lvl, s.cat) ->> 'def')::int, exp = (creature_fit(s.lvl, s.cat) ->> 'exp')::int,
  gold_min = (creature_fit(s.lvl, s.cat) ->> 'gmin')::int, gold_max = (creature_fit(s.lvl, s.cat) ->> 'gmax')::int, boss = s.cat in ('miniboss','boss','guardiao')
from spec s where c.id = s.id;

-- drops de criatura: chance por abate, independentes; caem como material na pilha (com pureza)
insert into drop_tables(id, name) select 'cr_' || id, 'Drops de ' || name from creatures on conflict (id) do update set name = excluded.name;
delete from drop_entries where table_id like 'cr_%';
insert into drop_entries(table_id, template_id, kind, chance, qty_min, qty_max, purity_min, purity_max) values
 ('cr_rato','osso','bonus',0.06,1,1,20,50),
 ('cr_javali','couro_cru','bonus',0.25,1,1,25,60),('cr_javali','presa_javali','bonus',0.12,1,1,30,60),
 ('cr_goblin','sucata','bonus',0.3,1,2,15,45),('cr_goblin','carvao','bonus',0.1,1,1,30,60),
 ('cr_bandido','sucata','bonus',0.15,1,1,20,50),('cr_bandido','couro_cru','bonus',0.08,1,1,25,60),
 ('cr_aranha','fio_seda','bonus',0.3,1,2,30,70),
 ('cr_lobo','couro_cru','bonus',0.3,1,1,30,65),('cr_lobo','osso','bonus',0.2,1,1,25,55),
 ('cr_afogado','essencia_sombria','bonus',0.06,1,1,30,70),('cr_afogado','osso','bonus',0.2,1,1,25,55),
 ('cr_bruxa','essencia_sombria','bonus',0.18,1,1,40,80),('cr_bruxa','flor_lunar','bonus',0.05,1,1,40,80),
 ('cr_ent','casca_ent','bonus',0.12,1,1,40,80),('cr_ent','raiz_antiga','bonus',0.03,1,1,40,85),('cr_ent','tora_ancestral','bonus',0.005,1,1,40,85),
 ('cr_lobo_neve','couro_cru','bonus',0.3,1,1,35,70),('cr_lobo_neve','cristal_gelo','bonus',0.05,1,1,35,75),
 ('cr_troll_gelo','cristal_gelo','bonus',0.15,1,1,40,80),('cr_troll_gelo','osso','bonus',0.3,1,2,30,60),
 ('cr_mineiro','sucata','bonus',0.3,1,2,25,55),('cr_mineiro','minerio_ferro','bonus',0.2,1,1,30,60),
 ('cr_golem','carvao','bonus',0.5,1,2,40,70),('cr_vespa','essencia_sombria','bonus',0.05,1,1,40,80),
 ('cr_cavaleiro','sucata','bonus',0.3,1,2,30,60),('cr_cavaleiro','essencia_sombria','bonus',0.08,1,1,40,80),
 ('cr_sentinela','pedra','bonus',0.5,1,3,30,60),('cr_guardiao','cristal_celestial','bonus',0.0005,1,1,50,90);
alter table creatures add column if not exists loot_table text;
update creatures set loot_table = 'cr_' || id where true;

-- abates por criatura (bestiário)
create table if not exists character_kills (character_id uuid not null references characters(id) on delete cascade, creature_id text not null references creatures(id), kills bigint not null default 0, first_at timestamptz default now(), primary key (character_id, creature_id));
alter table character_kills enable row level security;
drop policy if exists kills_own on character_kills; create policy kills_own on character_kills for select to authenticated using (character_id in (select id from characters where user_id = auth.uid()));

-- ---------- receitas com material de criatura e equipamento forjado ----------
alter table recipes drop constraint if exists recipes_kind_check;
alter table recipes add constraint recipes_kind_check check (kind in ('refino','componente','montagem','consumivel','equipamento'));
insert into recipes(id, name, profession_id, kind, req_level, tool, inputs, output, seconds, gold_cost, exp, techniques, description) values
 ('curtir_couro','Curtir couro','caca','refino',1,null,'[{"t":"couro_cru","q":2}]','{"t":"couro","q":1}',6,4,6,true,'Couro cru vira couro curtido'),
 ('moer_ossos','Moer ossos','alquimia','refino',5,null,'[{"t":"osso","q":3}]','{"t":"po_arcano","q":1}',6,5,6,false,'Pó arcano pra encantamentos'),
 ('moer_presas','Moer presas','alquimia','refino',5,null,'[{"t":"presa_javali","q":2}]','{"t":"po_arcano","q":1}',6,5,6,false,'Pó arcano pra encantamentos'),
 ('fundir_sucata','Fundir sucata','metalurgia','refino',1,null,'[{"t":"sucata","q":3},{"t":"carvao","q":1}]','{"t":"barra_ferro","q":1}',10,6,8,true,'Ferro reaproveitado, pureza baixa'),
 ('empunhadura_couro','Empunhadura de couro','caca','componente',5,null,'[{"t":"couro","q":1}]','{"part":"empunhadura"}',6,4,8,false,'Mais firme que madeira'),
 ('empunhadura_ent','Empunhadura de casca de ent','carpintaria','componente',18,null,'[{"t":"casca_ent","q":1}]','{"part":"empunhadura"}',10,30,25,false,'Leve e resistente, com um pouco de magia'),
 ('forjar_armadura','Forjar armadura','ferraria','equipamento',5,'martelo','[{"t":"couro","q":4},{"cat":"barra","q":2}]','{"t":"armadura_forjada"}',25,40,30,false,'Couro com placas de metal'),
 ('forjar_escudo','Forjar escudo','ferraria','equipamento',3,'martelo','[{"cat":"barra","q":3},{"cat":"madeira","q":1}]','{"t":"escudo_forjado"}',20,30,24,false,'Escudo de metal e madeira'),
 ('costurar_manto','Costurar manto de seda','encantamento','equipamento',5,null,'[{"t":"fio_seda","q":6},{"t":"essencia_sombria","q":1}]','{"t":"manto_seda"}',25,60,30,false,'Armadura leve pra magos')
on conflict (id) do update set name = excluded.name, profession_id = excluded.profession_id, kind = excluded.kind, req_level = excluded.req_level, tool = excluded.tool, inputs = excluded.inputs, output = excluded.output, seconds = excluded.seconds, gold_cost = excluded.gold_cost, exp = excluded.exp, techniques = excluded.techniques, description = excluded.description;
insert into enchantments(id, name, req_level, cost, effect, description) values
 ('ench_sombra','Sombra',15,'{"t":"essencia_sombria","q":2,"gold":300}','{"matk":8}','+8 de dano mágico'),
 ('ench_gelo','Gelo eterno',25,'{"t":"cristal_gelo","q":2,"gold":400}','{"def":5}','+5 de defesa')
on conflict (id) do update set name = excluded.name, req_level = excluded.req_level, cost = excluded.cost, effect = excluded.effect, description = excluded.description;

-- ---------- preço regional (base pra economia da fase 4) ----------
create table if not exists regional_prices (realm_id text not null references realms(id), category text not null, mult numeric not null, primary key (realm_id, category));
alter table regional_prices enable row level security; drop policy if exists read_rprices on regional_prices; create policy read_rprices on regional_prices for select to authenticated using (true);
insert into regional_prices(realm_id, category, mult) values
 ('eldoria','bruto',0.9),('eldoria','madeira',0.8),('eldoria','couro',0.9),('eldoria','barra',1.0),('eldoria','gema',1.25),('eldoria','reagente',1.2),('eldoria','refinado',1.0),('eldoria','artefato',1.0)
on conflict (realm_id, category) do update set mult = excluded.mult;
create or replace function sell_stack(p_tpl text, p_purity int, p_qty int) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; t item_templates; v bigint; m numeric;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into t from item_templates where id = p_tpl; if t.id is null or not t.stackable then raise exception 'item inválido'; end if;
  if t.category = 'artefato' then raise exception 'artefatos não se vendem pro NPC'; end if;
  if p_qty < 1 then raise exception 'quantidade inválida'; end if;
  perform stack_take(c.id, p_tpl, p_purity, p_qty);
  m := coalesce((select mult from regional_prices where realm_id = 'eldoria' and category = t.category), 1);
  v := floor(t.sell * p_qty * (0.6 + p_purity / 100.0 * 0.6) * m * (1 + least(0.15, prof_level(c.id, 'comercio') * 0.0015)));
  perform add_gold(c.id, v, 'venda_npc_material', p_tpl);
  perform prof_gain(c.id, 'comercio', greatest(1, v / 50));
  return jsonb_build_object('gold', v, 'state', get_state());
end $$;

-- ---------- bestiário e guardião mítico ----------
create table if not exists world_firsts (id text primary key, label text not null, character_id uuid references characters(id) on delete set null, character_name text, achieved_at timestamptz default now());
alter table world_firsts enable row level security; drop policy if exists read_firsts on world_firsts; create policy read_firsts on world_firsts for select to authenticated using (true);
create table if not exists mythic_runs (id uuid primary key default gen_random_uuid(), character_id uuid not null references characters(id) on delete cascade, realm_id text not null, started_at timestamptz default now(), status text not null default 'ativa', result jsonb);
alter table mythic_runs enable row level security;
create or replace function bestiary_view() returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', cr.id, 'name', cr.name, 'level', cr.level, 'category', cr.category, 'family', cr.family, 'realm', cr.realm_id, 'biome', cr.biome, 'hp', cr.hp, 'atk', cr.atk, 'def', cr.def, 'exp', cr.exp, 'resist', cr.resist, 'weak', cr.weak, 'description', cr.description,
    'kills', coalesce((select kills from character_kills k where k.creature_id = cr.id and k.character_id = (select id from characters where user_id = auth.uid())), 0),
    'drops', (select coalesce(jsonb_agg(jsonb_build_object('t', d.template_id, 'name', t.name, 'chance', d.chance)), '[]') from drop_entries d join item_templates t on t.id = d.template_id where d.table_id = cr.loot_table)
  ) order by cr.level), '[]') from creatures cr $$;
create or replace function mythic_action(p_action text, p_realm text default 'eldoria') returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; r mythic_runs; ents bigint; last timestamptz; pw numeric; need numeric := 260; win boolean; first boolean := false; n int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if p_realm <> 'eldoria' then raise exception 'esse guardião ainda não despertou'; end if;
  select * into r from mythic_runs where character_id = c.id and status = 'ativa' and realm_id = p_realm for update;
  if p_action = 'requisitos' then
    select coalesce(kills, 0) into ents from character_kills where character_id = c.id and creature_id = 'ent';
    return jsonb_build_object('level', c.level, 'level_req', 18, 'ents', coalesce(ents, 0), 'ents_req', 30, 'power', round(power_of(c)), 'power_ref', need,
      'first', (select to_jsonb(f) from world_firsts f where f.id = 'guardiao_eldoria'), 'done', exists (select 1 from mythic_runs where character_id = c.id and realm_id = p_realm and status = 'vencida'));
  elsif p_action = 'desafiar' then
    if r.id is not null then return jsonb_build_object('run', to_jsonb(r)); end if;
    if c.level < 18 then raise exception 'o Ancião só aceita desafiantes de nível 18'; end if;
    select coalesce(kills, 0) into ents from character_kills where character_id = c.id and creature_id = 'ent';
    if coalesce(ents, 0) < 30 then raise exception 'prove seu valor: derrote 30 Ents ancestrais (você tem %)', coalesce(ents, 0); end if;
    select max(started_at) into last from mythic_runs where character_id = c.id and realm_id = p_realm and status = 'vencida'; if last > now() - interval '12 hours' then raise exception 'o Ancião descansa. Volte em % h', ceil(extract(epoch from (last + interval '12 hours' - now())) / 3600); end if;
    insert into mythic_runs(character_id, realm_id) values (c.id, p_realm) returning * into r;
    return jsonb_build_object('run', to_jsonb(r));
  elsif p_action = 'resolver' then
    if r.id is null then raise exception 'nenhum desafio em andamento'; end if;
    if r.started_at > now() - interval '40 seconds' then raise exception 'a luta ainda não acabou'; end if;
    pw := power_of(c) * (0.85 + random() * 0.3); win := pw >= need;
    if not win then update mythic_runs set status = 'derrota', result = jsonb_build_object('power', round(pw), 'need', need) where id = r.id; return jsonb_build_object('win', false, 'power', round(pw), 'need', need, 'state', get_state()); end if;
    perform stack_add(c.id, 'selo_eldoria', 100, 1); perform add_gold(c.id, 3000, 'guardiao', p_realm); perform add_gems(c.id, 5, 'guardiao', p_realm);
    update characters set exp = exp + 40000 where id = c.id; while exists (select 1 from characters where id = c.id and level < 100 and exp >= exp_for(level + 1)) loop update characters set level = level + 1 where id = c.id; end loop;
    insert into world_firsts(id, label, character_id, character_name) values ('guardiao_eldoria', 'Primeiro a derrotar o Ancião da Floresta', c.id, c.name) on conflict (id) do nothing returning true into first;
    insert into account_audit_log(user_id, action, meta) values (c.user_id, 'guardiao_eldoria', jsonb_build_object('first', coalesce(first, false)));
    update mythic_runs set status = 'vencida', result = jsonb_build_object('power', round(pw), 'first', coalesce(first, false)) where id = r.id;
    return jsonb_build_object('win', true, 'first', coalesce(first, false), 'gold', 3000, 'gems', 5, 'exp', 40000, 'state', get_state());
  elsif p_action = 'sair' then update mythic_runs set status = 'abandonada' where id = r.id; return jsonb_build_object('state', get_state());
  end if;
  raise exception 'ação inválida';
end $$;
grant execute on function bestiary_view(), mythic_action(text,text) to authenticated; revoke all on function bestiary_view(), mythic_action(text,text) from anon;
