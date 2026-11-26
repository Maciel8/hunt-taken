-- =====================================================================================
-- EXPANSÃO COMPLETA (release único): mundos 1-5, saneamento econômico, diamante, forja completa,
-- encantamento de 2 slots com dano elemental, Market 2.0, trocas bilaterais, carteira USDT, clãs 2.0.
-- Tudo aditivo: nenhuma tabela, função, conta, depósito, criatura, missão ou receita é apagada.
-- =====================================================================================
set search_path = public;

-- ---------- configuração central (tudo que é número de balanceamento mora aqui) ----------
insert into game_config(key, value, note) values
 ('progress', '{"offline_eff":0.45,"offline_eff_premium":0.55,"overlevel_gap":8,"overlevel_k":0.15,"world_cap_penalty":0.85}', 'rendimento off-line, redução por nível acima da criatura, trava de mundo'),
 ('market', '{"listing_fee_pct":2,"sale_fee_pct":5,"comercio_cut_per_level":0.025,"comercio_cut_max":2.5,"max_listings":15,"max_buy_orders":10,"fort_share":0.20,"history_n":20}', 'taxas e limites do Market'),
 ('p2e', '{"enabled":true,"gems_per_usdt":100,"treasury_share":0.85,"platform_share":0.15,"withdraw_min_gems":1000,"withdraw_fee_pct":5,"withdraw_daily_max_gems":20000,"withdraw_min_level":20,"withdraw_min_account_days":3,"networks":["polygon","bep20","trc20"],"packages":[{"id":"p500","gems":500,"usdt":5},{"id":"p1200","gems":1200,"usdt":10},{"id":"p6500","gems":6500,"usdt":50}]}', 'economia lastreada: 100 gemas = 1 USDT'),
 ('npc_budget', '{"base":20000,"per_level":400,"regen_h":6}', 'caixa do NPC por personagem e mundo, renova a cada 6 h'),
 ('clan_tax_max', '15', 'imposto máximo de caça do clã (%)'),
 ('clan_buildings', '{"max_level":10,"forja":{"name":"Forja do Clã","bonus":"+1% de chance de raridade acima por nível","per_level":1},"mina":{"name":"Mina e Serraria","bonus":"+2% de rendimento e achados por nível","per_level":2},"quartel":{"name":"Quartel de Guerra","bonus":"+1,5% de exp e dano na caça por nível","per_level":1.5},"cambio":{"name":"Casa de Câmbio","bonus":"-0,2% na taxa do Market por nível","per_level":0.2},"cost":{"gold_base":5000,"gold_pow":1.6,"tabua_comum":20,"pedra":30,"barra_ferro":10,"diamante_bruto_from":5}}', 'construções do clã'),
 ('fort', '{"hunts":["aranhas","lobos","ancestrais"],"kill_points":0.2,"supply":{"gold":500,"barra_ferro":5,"tabua_comum":10},"supply_points":50,"decay_per_day":0.1}', 'disputa do Forte Cinzento'),
 ('elements', '["fogo","gelo","sagrado","veneno","raio","sombrio","agua","fisico","magico"]', 'elementos de dano e resistência')
on conflict (key) do update set value = excluded.value, note = excluded.note;
update game_config set value = '[{"id":0,"name":"Comum","color":"#a8a8a8","mult":1.0},{"id":1,"name":"Incomum","color":"#5bd16b","mult":1.12},{"id":2,"name":"Raro","color":"#4f8cff","mult":1.28},{"id":3,"name":"Épico","color":"#a35bff","mult":1.5},{"id":4,"name":"Lendário","color":"#ffbf3a","mult":1.8},{"id":5,"name":"Mítico","color":"#ff4a4a","mult":2.2},{"id":6,"name":"Divino","color":"#3fe6ff","mult":2.7},{"id":7,"name":"Primordial","color":"#ff3fd2","mult":3.4}]' where key = 'rarities';

-- ---------- administração (só o dono confirma depósitos e saques) ----------
create table if not exists admins (user_id uuid primary key references auth.users(id) on delete cascade, note text, created_at timestamptz default now());
alter table admins enable row level security;
insert into admins(user_id, note) select user_id, 'dono (Bielzin)' from characters where name = 'Bielzin' on conflict do nothing;
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from admins where user_id = auth.uid()) $$;

-- ---------- mundos progressivos ----------
insert into realms(id, name, level_min, level_max, description, mythic_area, dimension, sort, open) values
 ('espiritual','Reino Espiritual',501,999999,'O Plano Eterno, sem teto.','Trono Eterno','Plano Eterno',7,false)
on conflict (id) do nothing;
create table if not exists worlds (id int primary key, name text not null, subtitle text, level_min int not null, level_max int, req_level int not null default 0, req_item text references item_templates(id), realms text[] not null, palette text, creature_prefix text, description text);
alter table worlds enable row level security; drop policy if exists read_worlds on worlds; create policy read_worlds on worlds for select to authenticated using (true);
insert into item_templates(id,name,slot,atk,def,sell,price,mat,voc,icon,extra,category,stackable,tier,base_rarity,weight,props,req_level) values
 ('coroa_terras_medias','Coroa de Frostheim e Solkar',null,0,0,0,null,true,null,'crown','{}','artefato',true,6,5,0.2,'{}',1),
 ('chave_abismo','Chave do Abismo',null,0,0,0,null,true,null,'key','{}','artefato',true,7,6,0.2,'{}',1),
 ('reliquia_primordial','Relíquia Primordial',null,0,0,0,null,true,null,'relic','{}','artefato',true,8,7,0.2,'{}',1)
on conflict (id) do update set name = excluded.name, icon = excluded.icon, category = excluded.category;
insert into worlds(id, name, subtitle, level_min, level_max, req_level, req_item, realms, palette, creature_prefix, description) values
 (1,'Eldoria','Terras do Despertar',1,100,0,null,'{eldoria}','none',null,'Vila de Arken, Campos, Floresta Sombria, Pântano e Floresta dos Ancestrais. Chefe: O Ancião da Floresta.'),
 (2,'Frostheim e Solkar','Terras Médias',101,200,100,'selo_eldoria','{frostheim,solkar}','frost',' de Frostheim','Geleiras e desertos. Ouro, mitril e diamante. Chefes: Lorde Glacial e Faraó Solar.'),
 (3,'Viridion e Ignareth','Terras Altas',201,350,200,'coroa_terras_medias','{viridion,ignareth}','ember',' de Ignareth','Selvas primordiais e vulcões. Adamantita, madeira ancestral, escamas de dragão. Chefe: Ignaroth Desperto.'),
 (4,'Nocthar','Abismo Corrompido',351,500,350,'chave_abismo','{nocthar}','void',' do Abismo','Ruínas sombrias e fendas. Fragmento primordial e liga ancestral. Chefe: Rei Esquecido Ascendido.'),
 (5,'Reino Espiritual','Plano Eterno',501,null,500,'reliquia_primordial','{espiritual}','spirit',' Eterno','Endgame sem teto, com escala dinâmica. Chefe: Guardião Eterno.')
on conflict (id) do update set name = excluded.name, subtitle = excluded.subtitle, level_min = excluded.level_min, level_max = excluded.level_max, req_level = excluded.req_level, req_item = excluded.req_item, realms = excluded.realms, palette = excluded.palette, creature_prefix = excluded.creature_prefix, description = excluded.description;
alter table characters add column if not exists world_id int not null default 1 references worlds(id);
create or replace function world_level(w int, base int) returns int language sql stable as $$
  -- nível da criatura no mundo: a faixa 1-100 de Eldoria é esticada pra faixa do mundo
  select case when w <= 1 then base else (select level_min - 1 + ceil(base * (coalesce(level_max, level_min + 499) - level_min + 1) / 100.0)::int from worlds where id = w) end $$;

-- ---------- saneamento: materiais duplicados viram os novos (pureza 50) ----------
alter table item_templates add column if not exists deprecated boolean not null default false;
update item_templates set deprecated = true where id in ('pele','presa','seda');
do $$ declare r record; m jsonb := '{"pele":"couro_cru","presa":"presa_javali","seda":"fio_seda"}'; begin
  for r in select * from inventory_stacks where template_id in ('pele','presa','seda') loop
    perform stack_add(r.character_id, m ->> r.template_id, 50, r.qty); delete from inventory_stacks where character_id = r.character_id and template_id = r.template_id and purity = r.purity;
  end loop;
  for r in select i.id, i.template_id, v.character_id from items i join inventory v on v.item_id = i.id where i.template_id in ('pele','presa','seda') and v.container in ('bag','protected') loop
    perform stack_add(r.character_id, m ->> r.template_id, 50, 1); delete from inventory where item_id = r.id; delete from items where id = r.id;
    insert into ledger(character_id, amount, reason, ref) values (r.character_id, 0, 'unificacao_material', r.template_id);
  end loop;
end $$;
update creatures set drop_item = null, drop_chance = 0 where drop_item in ('pele','presa','seda');
delete from drop_entries where template_id in ('pele','presa','seda');

-- ---------- diamante ----------
insert into item_templates(id,name,slot,atk,def,sell,price,mat,voc,icon,extra,category,stackable,tier,base_rarity,weight,props,req_level) values
 ('diamante_bruto','Diamante bruto',null,0,0,1500,null,true,null,'diamond_raw','{}','bruto',true,4,4,0.2,'{"gem":"diamante"}',1),
 ('diamante','Diamante',null,0,0,4200,null,true,null,'diamond','{}','gema',true,4,4,0.1,'{"crit":4.0,"patk":6,"matk":8,"all_stats":2}',1)
on conflict (id) do update set name = excluded.name, sell = excluded.sell, icon = excluded.icon, category = excluded.category, tier = excluded.tier, base_rarity = excluded.base_rarity, weight = excluded.weight, props = excluded.props;
insert into drop_tables(id, name) values ('veio_diamante','Veio de diamante') on conflict do nothing;
delete from drop_entries where table_id = 'veio_diamante' or (template_id = 'diamante_bruto' and table_id in ('veio_prata','veio_mitril','veio_profundo'));
insert into drop_entries(table_id, template_id, kind, chance, qty_min, qty_max, purity_min, purity_max, min_prof, min_tool_tier) values
 ('veio_diamante','pedra','base',1,1,2,40,70,50,3),
 ('veio_diamante','diamante_bruto','bonus',0.06,1,1,50,90,50,3),
 ('veio_diamante','cristal_celestial','bonus',0.00005,1,1,60,95,60,3),
 ('veio_prata','diamante_bruto','bonus',0.002,1,1,40,85,25,2),
 ('veio_mitril','diamante_bruto','bonus',0.008,1,1,45,88,45,3),
 ('veio_profundo','diamante_bruto','bonus',0.025,1,1,50,92,60,4);
insert into resource_nodes(id, name, kind, profession_id, tool, tool_tier, req_level, hardness, extract_s, capacity, respawn_s, drop_table, exp, x, y, region) values
 ('veio_diamante_1','Veio de diamante','veio_diamante','mineracao','picareta',3,50,5,14,3,1800,'veio_diamante',90,214,26,'montanhas'),
 ('veio_diamante_2','Veio de diamante','veio_diamante','mineracao','picareta',3,50,5,14,3,1800,'veio_diamante',90,240,150,'minas'),
 ('veio_diamante_3','Veio de diamante','veio_diamante','mineracao','picareta',3,50,5,14,3,1800,'veio_diamante',90,262,176,'minas'),
 ('veio_diamante_4','Veio de diamante','veio_diamante','mineracao','picareta',3,50,5,14,3,1800,'veio_diamante',90,178,30,'montanhas')
on conflict (id) do nothing;
-- depósitos do Forte Cinzento: só o clã que domina o forte coleta
alter table resource_nodes add column if not exists owner text;
insert into resource_nodes(id, name, kind, profession_id, tool, tool_tier, req_level, hardness, extract_s, capacity, respawn_s, drop_table, exp, x, y, region, owner) values
 ('forte_mitril','Veio de mitril do Forte','veio_mitril','mineracao','picareta',3,45,4,12,4,900,'veio_mitril',70,150,80,'floresta','forte'),
 ('forte_diamante','Veio de diamante do Forte','veio_diamante','mineracao','picareta',3,50,5,14,3,1500,'veio_diamante',90,161,80,'floresta','forte')
on conflict (id) do nothing;
-- chefes também deixam diamante
insert into drop_entries(table_id, template_id, kind, chance, qty_min, qty_max, purity_min, purity_max)
 select 'cr_' || x.id, 'diamante_bruto', 'bonus', x.ch, 1, x.q, 60, 95 from (values ('capataz',0.25,1),('mae_vespas',0.4,2),('rei',0.6,3),('anciao',0.3,1)) x(id, ch, q)
 where not exists (select 1 from drop_entries d where d.table_id = 'cr_' || x.id and d.template_id = 'diamante_bruto');
insert into recipes(id, name, profession_id, kind, req_level, tool, inputs, output, seconds, gold_cost, exp, techniques, description) values
 ('lapidar_diamante','Lapidar diamante','joalheria','refino',50,null,'[{"t":"diamante_bruto","q":1}]','{"t":"diamante","q":1}',20,300,60,true,'A gema mais dura: crítico, ataque e todos os atributos')
on conflict (id) do update set inputs = excluded.inputs, output = excluded.output;

-- ---------- preço regional por mundo + caixa do NPC ----------
alter table regional_prices drop constraint if exists regional_prices_pkey;
alter table regional_prices add primary key (realm_id, category);
insert into regional_prices(realm_id, category, mult) values
 ('eldoria','gema',1.25),('eldoria','reagente',1.25),
 ('frostheim','madeira',1.30),('frostheim','peixe',1.30),('frostheim','bruto',1.0),('frostheim','barra',1.05),('solkar','gema',1.15),('solkar','barra',1.10),
 ('ignareth','cristal_gelo',1.35),('ignareth','peixe',1.35),('ignareth','reagente',1.10),('viridion','madeira',1.20),('viridion','couro',1.20),
 ('nocthar','artefato',1.0),('nocthar','barra',1.20),('nocthar','gema',1.20),('espiritual','gema',1.30),('espiritual','reagente',1.30)
on conflict (realm_id, category) do update set mult = excluded.mult;
-- multiplicador de um material no mundo do personagem: categoria, id exato ou prefixo (peixe_*)
create or replace function price_mult(w int, t item_templates) returns numeric language sql stable as $$
  select coalesce(max(rp.mult), 1) from regional_prices rp where rp.realm_id = any(coalesce((select realms from worlds where id = w), '{eldoria}'))
   and rp.category in (t.category, t.id, split_part(t.id, '_', 1)) $$;
create table if not exists npc_budget (character_id uuid not null references characters(id) on delete cascade, world_id int not null, spent bigint not null default 0, window_start timestamptz not null default now(), primary key (character_id, world_id));
alter table npc_budget enable row level security;
create or replace function npc_budget_left(cid uuid) returns bigint language plpgsql as $$
declare c characters; b npc_budget; k jsonb := cfg('npc_budget'); cap bigint;
begin
  select * into c from characters where id = cid; cap := (k ->> 'base')::bigint + c.level * (k ->> 'per_level')::bigint;
  insert into npc_budget(character_id, world_id) values (cid, c.world_id) on conflict do nothing;
  select * into b from npc_budget where character_id = cid and world_id = c.world_id for update;
  if b.window_start < now() - make_interval(hours => (k ->> 'regen_h')::int) then update npc_budget set spent = 0, window_start = now() where character_id = cid and world_id = c.world_id; return cap; end if;
  return greatest(0, cap - b.spent);
end $$;
create or replace function npc_budget_use(cid uuid, amt bigint) returns void language sql as $$
  update npc_budget set spent = spent + amt where character_id = cid and world_id = (select world_id from characters where id = cid) $$;

-- ---------- tabelas novas (todas com RLS; acesso só pelas funções) ----------
create table if not exists treasury_pool (id int primary key default 1 check (id = 1), usdt_balance numeric(18,2) not null default 0, platform_revenue numeric(18,2) not null default 0, gems_burned bigint not null default 0, gems_issued bigint not null default 0, updated_at timestamptz default now());
insert into treasury_pool(id) values (1) on conflict do nothing;
create table if not exists treasury_ledger (id bigserial primary key, kind text not null, usdt numeric(18,2) not null default 0, gems bigint not null default 0, ref text, created_at timestamptz default now());
create table if not exists deposit_requests (id uuid primary key default gen_random_uuid(), character_id uuid not null references characters(id) on delete cascade, package_id text not null, gems bigint not null, usdt numeric(18,2) not null, method text not null check (method in ('polygon','bep20','trc20','pix')), reference text not null, status text not null default 'pending' check (status in ('pending','confirmed','rejected')), admin_note text, created_at timestamptz default now(), decided_at timestamptz);
create table if not exists withdrawal_requests (id uuid primary key default gen_random_uuid(), character_id uuid not null references characters(id) on delete cascade, gems bigint not null check (gems > 0), fee_gems bigint not null, usdt numeric(18,2) not null, network text not null check (network in ('polygon','bep20','trc20')), address text not null, status text not null default 'pending' check (status in ('pending','approved','paid','rejected')), tx_hash text, admin_note text, created_at timestamptz default now(), decided_at timestamptz);
create table if not exists market_buy_orders (id uuid primary key default gen_random_uuid(), buyer_id uuid not null references characters(id) on delete cascade, template_id text not null references item_templates(id), kind text not null check (kind in ('stack','item')), min_purity int not null default 0, min_rarity int not null default 0, qty int not null check (qty > 0), filled int not null default 0, price_each bigint not null check (price_each > 0), currency text not null check (currency in ('gold','gems')), escrow bigint not null default 0, status text not null default 'aberta' check (status in ('aberta','cumprida','cancelada')), created_at timestamptz default now(), expires_at timestamptz not null default now() + interval '14 days');
create table if not exists clan_vault (clan_id uuid primary key references clans(id) on delete cascade, gold bigint not null default 0 check (gold >= 0), gems bigint not null default 0 check (gems >= 0), updated_at timestamptz default now());
create table if not exists clan_vault_stacks (clan_id uuid not null references clans(id) on delete cascade, template_id text not null references item_templates(id), purity int not null, qty int not null check (qty >= 0), primary key (clan_id, template_id, purity));
create table if not exists clan_vault_logs (id bigserial primary key, clan_id uuid not null references clans(id) on delete cascade, character_id uuid references characters(id) on delete set null, name text, action text not null, currency text, amount bigint, template_id text, purity int, qty int, created_at timestamptz default now());
create table if not exists clan_buildings (clan_id uuid not null references clans(id) on delete cascade, building text not null check (building in ('forja','mina','quartel','cambio')), level int not null default 0 check (level between 0 and 10), primary key (clan_id, building));
create table if not exists fort_influence (clan_id uuid primary key references clans(id) on delete cascade, points numeric not null default 0, updated_at timestamptz default now());
alter table clans add column if not exists tax_pct int not null default 0 check (tax_pct between 0 and 15);
alter table treasury_pool enable row level security; alter table treasury_ledger enable row level security; alter table deposit_requests enable row level security; alter table withdrawal_requests enable row level security;
alter table market_buy_orders enable row level security; alter table clan_vault enable row level security; alter table clan_vault_stacks enable row level security; alter table clan_vault_logs enable row level security; alter table clan_buildings enable row level security; alter table fort_influence enable row level security;
-- Market: anúncio de pilha de material (além de item único) e histórico por template
alter table market_listings alter column item_id drop not null;
alter table market_listings add column if not exists template_id text references item_templates(id);
alter table market_listings add column if not exists purity int;
alter table market_listings add column if not exists qty int;
alter table market_listings add column if not exists fee_paid bigint not null default 0;
alter table market_transactions add column if not exists template_id text;
alter table market_transactions add column if not exists qty int not null default 1;
alter table market_transactions add column if not exists purity int;
alter table market_transactions add column if not exists rarity int;
alter table market_transactions add column if not exists kind text not null default 'listing';
update market_transactions mt set template_id = i.template_id, rarity = i.rarity from market_listings l join items i on i.id = l.item_id where mt.listing_id = l.id and mt.template_id is null;
-- trocas bilaterais com trava dupla
alter table trades add column if not exists mode text not null default 'legacy';
alter table trades add column if not exists to_items uuid[] not null default '{}';
alter table trades add column if not exists to_gold bigint not null default 0;
alter table trades add column if not exists to_gems bigint not null default 0;
alter table trades add column if not exists from_stacks jsonb not null default '[]';
alter table trades add column if not exists to_stacks jsonb not null default '[]';
alter table trades add column if not exists accepted_a boolean not null default false;
alter table trades add column if not exists accepted_b boolean not null default false;
alter table trades add column if not exists version int not null default 0;
alter table trades add column if not exists updated_at timestamptz default now();
-- chat por mundo
-- (o canal 'mundo:N' é montado pelas funções de chat)
-- =====================================================================================
-- FORJA COMPLETA: arsenal de todas as classes, elmo, anel, amuleto e ferramentas forjadas
-- =====================================================================================
create or replace function clan_level(cid uuid, b text) returns int language sql stable as $$
  select coalesce((select cb.level from clan_members m join clan_buildings cb on cb.clan_id = m.clan_id and cb.building = b where m.character_id = cid), 0) $$;

update item_templates set props = props || '{"wtype":"espada"}' where id = 'espada_forjada';
insert into item_templates(id,name,slot,atk,def,sell,price,mat,voc,icon,extra,category,stackable,tier,base_rarity,weight,props,req_level) values
 ('machado_forjado','Machado forjado','weapon',0,0,0,null,false,null,'axe_w','{}','arma',false,1,0,3.2,'{"wtype":"machado","forge":{"kind":"weapon","label":"Machado","dmg":1.15,"aspd":0.92,"crit":1,"dur":1.1}}',1),
 ('martelo_forjado','Martelo de guerra forjado','weapon',0,0,0,null,false,null,'hammer_w','{}','arma',false,1,0,4.0,'{"wtype":"martelo","forge":{"kind":"weapon","label":"Martelo de guerra","dmg":1.25,"aspd":0.85,"crit":0.5,"dur":1.3}}',1),
 ('adaga_forjada','Adaga forjada','weapon',0,0,0,null,false,null,'dagger','{}','arma',false,1,0,1.0,'{"wtype":"adaga","forge":{"kind":"weapon","label":"Adaga","dmg":0.7,"aspd":1.3,"crit":6,"dur":0.8}}',1),
 ('arco_forjado','Arco forjado','weapon',0,0,0,null,false,null,'bow','{}','arma',false,1,0,1.4,'{"wtype":"arco","forge":{"kind":"weapon","label":"Arco","dmg":0.95,"aspd":1.05,"crit":4,"dur":0.9,"wood":true}}',1),
 ('cajado_forjado','Cajado forjado','weapon',0,0,0,null,false,null,'staff','{}','arma',false,1,0,1.6,'{"wtype":"cajado","forge":{"kind":"weapon","label":"Cajado","dmg":0.45,"aspd":1.0,"crit":2,"dur":0.9,"magic":true,"wood":true}}',1),
 ('bastao_forjado','Bastão forjado','weapon',0,0,0,null,false,null,'staff','{}','arma',false,1,0,1.8,'{"wtype":"bastao","forge":{"kind":"weapon","label":"Bastão","dmg":0.9,"aspd":1.2,"crit":3,"dur":1.0,"wood":true}}',1),
 ('elmo_forjado','Elmo forjado','helmet',0,0,0,null,false,null,'helmet','{}','armadura',false,1,0,2.0,'{"forge":{"kind":"armor","label":"Elmo"}}',1),
 ('anel_forjado','Anel forjado','ring',0,0,0,null,false,null,'ring','{}','acessorio',false,1,0,0.05,'{"forge":{"kind":"jewel","label":"Anel","mult":1.0}}',1),
 ('amuleto_forjado','Amuleto forjado','amulet',0,0,0,null,false,null,'amulet','{}','acessorio',false,1,0,0.1,'{"forge":{"kind":"jewel","label":"Amuleto","mult":1.25,"mdef":4,"hp":15}}',1),
 ('machado_lenhador_forjado','Machado de lenhador forjado','tool',0,0,0,null,false,null,'axe','{}','ferramenta',false,1,0,2.0,'{"tool":"machado","forge":{"kind":"tool","label":"Machado de lenhador","tool":"machado","head":"cabeca_machado"}}',1),
 ('foice_forjada','Foice forjada','tool',0,0,0,null,false,null,'sickle','{}','ferramenta',false,1,0,1.2,'{"tool":"foice","forge":{"kind":"tool","label":"Foice","tool":"foice","head":"cabeca_foice"}}',1),
 ('comp_cabeca_machado','Cabeça de machado',null,0,0,0,null,false,null,'axe','{}','componente',false,1,0,1.0,'{"part":"cabeca_machado"}',1),
 ('comp_cabeca_foice','Lâmina de foice',null,0,0,0,null,false,null,'sickle','{}','componente',false,1,0,0.6,'{"part":"cabeca_foice"}',1)
on conflict (id) do update set name = excluded.name, slot = excluded.slot, icon = excluded.icon, category = excluded.category, weight = excluded.weight, props = excluded.props;
-- ícones próprios das ferramentas (antes reusavam a espada)
update item_templates set icon = 'pickaxe' where id in ('picareta_cobre','picareta_ferro','picareta_forjada','comp_cabeca_picareta','picareta');
update item_templates set icon = 'axe' where id = 'machado_ferro';
update item_templates set icon = 'sickle' where id = 'foice';
update item_templates set icon = 'rod' where id = 'vara_pesca';
update item_templates set icon = 'hammer' where id = 'martelo_ferreiro';

-- só barras nobres em anel e amuleto
insert into recipes(id, name, profession_id, kind, req_level, tool, inputs, output, seconds, gold_cost, exp, techniques, description) values
 ('forjar_machado','Forjar machado','ferraria','equipamento',8,'martelo','[{"cat":"barra","q":3},{"part":"empunhadura"},{"part":"pomo"}]','{"t":"machado_forjado"}',22,40,32,false,'Guerreiro e Paladino'),
 ('forjar_martelo','Forjar martelo de guerra','ferraria','equipamento',12,'martelo','[{"cat":"barra","q":3},{"part":"empunhadura"},{"part":"pomo"}]','{"t":"martelo_forjado"}',24,50,36,false,'Guerreiro e Paladino'),
 ('forjar_adaga','Forjar adaga','ferraria','equipamento',5,'martelo','[{"cat":"barra","q":2},{"part":"empunhadura"}]','{"t":"adaga_forjada"}',14,25,22,false,'Assassino e Aventureiro'),
 ('fazer_arco','Fazer arco','carpintaria','equipamento',8,null,'[{"cat":"madeira","q":2},{"t":"couro","q":1},{"t":"fio_seda","q":2}]','{"t":"arco_forjado"}',20,35,30,false,'Arqueiro'),
 ('fazer_cajado','Fazer cajado','carpintaria','equipamento',10,null,'[{"cat":"madeira","q":2},{"cat":"gema","q":1},{"t":"essencia_sombria","q":2}]','{"t":"cajado_forjado"}',24,60,34,false,'Mago, Druida, Necromante e Invocador'),
 ('fazer_bastao','Fazer bastão','carpintaria','equipamento',6,null,'[{"cat":"madeira","q":3},{"t":"couro","q":1}]','{"t":"bastao_forjado"}',18,25,26,false,'Monge'),
 ('forjar_elmo','Forjar elmo','ferraria','equipamento',6,'martelo','[{"cat":"barra","q":2},{"t":"couro","q":1}]','{"t":"elmo_forjado"}',20,35,28,false,'Elmo de metal com forro de couro'),
 ('forjar_anel','Forjar anel','joalheria','equipamento',10,null,'[{"cat":"barra","q":1,"only":["barra_prata","barra_ouro","barra_mitril","barra_adamantita","liga_ancestral"]},{"cat":"gema","q":1}]','{"t":"anel_forjado"}',18,80,30,false,'Barra nobre + gema lapidada'),
 ('forjar_amuleto','Forjar amuleto','joalheria','equipamento',15,null,'[{"cat":"barra","q":1,"only":["barra_prata","barra_ouro","barra_mitril","barra_adamantita","liga_ancestral"]},{"cat":"gema","q":1},{"t":"fio_seda","q":1}]','{"t":"amuleto_forjado"}',24,120,40,false,'Barra nobre + gema + fio de seda'),
 ('forjar_cabeca_machado','Forjar cabeça de machado','ferraria','componente',1,'martelo','[{"cat":"barra","q":2}]','{"part":"cabeca_machado"}',12,10,14,false,'Para o machado de lenhador'),
 ('forjar_cabeca_foice','Forjar lâmina de foice','ferraria','componente',1,'martelo','[{"cat":"barra","q":1}]','{"part":"cabeca_foice"}',10,8,12,false,'Para a foice'),
 ('montar_machado_lenhador','Montar machado de lenhador','ferraria','equipamento',1,'martelo','[{"part":"cabeca_machado"},{"part":"empunhadura"}]','{"t":"machado_lenhador_forjado"}',15,20,20,false,'Ferramenta de lenharia'),
 ('montar_foice','Montar foice','ferraria','equipamento',1,'martelo','[{"part":"cabeca_foice"},{"part":"empunhadura"}]','{"t":"foice_forjada"}',12,15,18,false,'Ferramenta de agricultura')
on conflict (id) do update set name = excluded.name, profession_id = excluded.profession_id, kind = excluded.kind, req_level = excluded.req_level, tool = excluded.tool, inputs = excluded.inputs, output = excluded.output, seconds = excluded.seconds, gold_cost = excluded.gold_cost, exp = excluded.exp, description = excluded.description;

-- monta o equipamento a partir do que foi consumido (materiais, peças e gema)
create or replace function forge_build(p_tpl text, consumed jsonb, avg_p numeric, pl int, maker text, tool_tier numeric, cid uuid) returns jsonb language plpgsql as $$
declare t item_templates := (select x from item_templates x where x.id = p_tpl); f jsonb := t.props -> 'forge'; e jsonb; mt jsonb; mp jsonb := '{"power":4,"weight":1,"tough":30,"magic":0}'; gem jsonb := '{}'; gem_t text;
  parts jsonb := '{}'; pq numeric := 0; pp numeric := 0; pn int := 0; couro int := 0; seda int := 0; ess int := 0; q numeric; rar int; rm numeric; qf numeric; res jsonb; pw numeric; dmin numeric; nm text; metal text; cab jsonb;
begin
  for e in select * from jsonb_array_elements(consumed) loop
    if e ? 'item' then parts := parts || jsonb_build_object(e ->> 'part', e -> 'roll'); pq := pq + coalesce((e #>> '{roll,quality}')::numeric, 50); pp := pp + coalesce((e #>> '{roll,power}')::numeric, 0); pn := pn + 1;
    elsif e ->> 'cat' in ('barra','madeira') and mt is null then mt := e; mp := coalesce((select props from item_templates where id = e ->> 't'), mp);
    elsif e ->> 'cat' = 'gema' then gem_t := e ->> 't'; gem := coalesce((select props from item_templates where id = gem_t), '{}');
    elsif e ->> 't' = 'couro' then couro := couro + (e ->> 'q')::int; elsif e ->> 't' = 'fio_seda' then seda := seda + (e ->> 'q')::int; elsif e ->> 't' = 'essencia_sombria' then ess := ess + (e ->> 'q')::int; end if;
  end loop;
  if pn > 0 then pq := pq / pn; pp := pp / pn; end if;
  metal := lower(regexp_replace(coalesce((select name from item_templates where id = mt ->> 't'), ''), '^(Barra|Liga|Tábua) de ', ''));
  -- qualidade: pureza, peças, nível do artesão, ferramenta e um pouco de sorte
  q := greatest(0, least(100, avg_p * (case when pn > 0 then 0.45 else 0.6 end) + (case when pn > 0 then pq * 0.2 else 0 end) + least(cfgn('craft','quality_skill_cap'), pl * 0.5) * 0.6 + coalesce(tool_tier, 1) * 2 + rand_normal() * 5));
  rar := rarity_from_quality(q);
  if random() < clan_level(cid, 'forja') * (cfg('clan_buildings') -> 'forja' ->> 'per_level')::numeric / 100 then rar := least(7, rar + 1); end if;
  rm := coalesce((select (r ->> 'mult')::numeric from jsonb_array_elements(cfg('rarities')) r where (r ->> 'id')::int = rar), 1);
  qf := (0.6 + q / 100 * 0.8) * rm;
  if f ->> 'kind' = 'weapon' then
    pw := (mp ->> 'power')::numeric + pp * 0.3 + couro * 1.5 + seda * 0.8;
    dmin := round(pw * (f ->> 'dmg')::numeric * qf * 0.8, 1);
    res := jsonb_build_object('wtype', t.props ->> 'wtype', 'dmin', dmin, 'dmax', round(dmin * 1.45, 1), 'aspd', round(greatest(0.6, least(1.5, (f ->> 'aspd')::numeric - (mp ->> 'weight')::numeric * 0.03)), 2),
      'crit', round((f ->> 'crit')::numeric + (mp ->> 'magic')::numeric * 0.3 + seda * 0.3, 1), 'dur', round((mp ->> 'tough')::numeric * 2 * (f ->> 'dur')::numeric), 'maxdur', round((mp ->> 'tough')::numeric * 2 * (f ->> 'dur')::numeric),
      'sockets', case when q > 85 then 2 when q > 60 then 1 else 0 end, 'gems', '[]'::jsonb, 'ench', '[]'::jsonb, 'upgrade', 0);
    if (f ->> 'magic')::boolean then res := res || jsonb_build_object('matk', round(((mp ->> 'magic')::numeric * 2 + coalesce((gem ->> 'matk')::numeric, 0) + ess * 4 + 6) * qf, 1), 'crit', round((f ->> 'crit')::numeric + coalesce((gem ->> 'crit')::numeric, 0), 1)); end if;
    nm := (f ->> 'label') || ' de ' || coalesce(nullif(metal, ''), 'metal');
  elsif f ->> 'kind' = 'armor' then
    res := jsonb_build_object('def', round((3 + (mp ->> 'power')::numeric * 0.5 + couro * 1.5) * qf, 1), 'hp', round((mp ->> 'tough')::numeric * 0.3 * qf), 'dur', round((mp ->> 'tough')::numeric * 2.5), 'maxdur', round((mp ->> 'tough')::numeric * 2.5), 'sockets', case when q > 85 then 1 else 0 end, 'gems', '[]'::jsonb, 'ench', '[]'::jsonb, 'upgrade', 0);
    nm := (f ->> 'label') || ' de ' || coalesce(nullif(metal, ''), 'metal');
  elsif f ->> 'kind' = 'jewel' then
    res := jsonb_build_object('crit', round(coalesce((gem ->> 'crit')::numeric, 0) * qf * (f ->> 'mult')::numeric, 1), 'atk', round(coalesce((gem ->> 'patk')::numeric, 0) * qf * (f ->> 'mult')::numeric, 1), 'matk', round(coalesce((gem ->> 'matk')::numeric, 0) * qf * (f ->> 'mult')::numeric, 1),
      'hp', round((coalesce((gem ->> 'hp')::numeric, 0) + coalesce((f ->> 'hp')::numeric, 0)) * qf * (f ->> 'mult')::numeric), 'mdef', round(((mp ->> 'magic')::numeric + coalesce((gem ->> 'mdef')::numeric, 0) + coalesce((f ->> 'mdef')::numeric, 0)) * qf * (f ->> 'mult')::numeric, 1),
      'all_stats', floor(coalesce((gem ->> 'all_stats')::numeric, 0) * qf * (f ->> 'mult')::numeric), 'luck', round((mp ->> 'magic')::numeric * 0.002 * (f ->> 'mult')::numeric * qf, 4), 'gems', '[]'::jsonb, 'ench', '[]'::jsonb, 'upgrade', 0, 'dur', 200, 'maxdur', 200);
    nm := (f ->> 'label') || ' de ' || coalesce(nullif(metal, ''), 'metal') || coalesce(' com ' || lower((select name from item_templates where id = gem_t)), '');
  else
    cab := parts -> (f ->> 'head');
    res := jsonb_build_object('tool', f ->> 'tool', 'tier', coalesce((cab ->> 'tier')::int, 1), 'eff', round(1 + q / 100 * 0.5, 2), 'speed', round(1 + q / 100 * 0.4 - coalesce((cab ->> 'weight')::numeric, 1) * 0.05, 2), 'dur', round(coalesce((cab ->> 'tough')::numeric, 40) * 3), 'maxdur', round(coalesce((cab ->> 'tough')::numeric, 40) * 3));
    nm := (f ->> 'label') || ' de ' || lower(regexp_replace(coalesce(cab ->> 'mat_name', 'metal'), '^(Barra|Liga) de ', ''));
  end if;
  return res || jsonb_build_object('quality', round(q), 'purity', round(avg_p), 'rarity', rar, 'maker', maker, 'made_at', now(), 'origin', 'Oficina de ' || maker, 'name', nm,
    'components', parts || jsonb_build_object('base', jsonb_build_object('mat', mt ->> 't', 'purity', round(avg_p), 'mat_name', (select name from item_templates where id = mt ->> 't')), 'gem', gem_t));
end $$;
-- oficina: receitas com barra nobre e montador genérico de equipamento
create or replace function craft_start(p_recipe text, p_technique text default 'segura', p_qty int default 1, p_choices jsonb default '[]') returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; rc recipes; inp jsonb; k int := 0; ch jsonb; consumed jsonb := '[]'; tech jsonb; cost bigint; g bigint; secs numeric; jid uuid; pl int; tl jsonb; it record; qty int := greatest(1, least(20, p_qty)); n int; last timestamptz;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into rc from recipes where id = p_recipe; if rc.id is null then raise exception 'receita inválida'; end if;
  select count(*) into n from craft_jobs where character_id = c.id and status = 'ativo'; if n >= 3 then raise exception 'oficina cheia: no máximo 3 trabalhos ao mesmo tempo'; end if;
  select max(started_at) into last from craft_jobs where character_id = c.id; if last > now() - make_interval(secs => cfgn('craft','job_min_gap_s')) then raise exception 'devagar'; end if;
  pl := prof_level(c.id, rc.profession_id); if pl < rc.req_level then raise exception 'precisa de % nível %', (select name from professions where id = rc.profession_id), rc.req_level; end if;
  if rc.tool is not null then tl := tool_of(c.id, rc.tool); if tl is null then raise exception 'precisa de um martelo de ferreiro'; end if; end if;
  if rc.kind in ('componente','montagem','equipamento') then qty := 1; end if;
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
      -- categoria: o jogador escolhe o material; sem pureza escolhida, junta pilhas do mesmo material da mais pura pra menos pura
      if ch is null or ch ->> 't' is null then raise exception 'escolha o material da etapa %', k; end if;
      if (select category from item_templates where id = ch ->> 't') <> inp ->> 'cat' then raise exception 'material errado na etapa %', k; end if;
      if inp ? 'only' and not ((ch ->> 't') = any(array(select jsonb_array_elements_text(inp -> 'only')))) then raise exception 'essa receita pede barra nobre (prata, ouro, mitril, adamantita ou liga)'; end if;
      declare need int := (inp ->> 'q')::int * qty; s record; take int; begin
        for s in select * from inventory_stacks where character_id = c.id and template_id = ch ->> 't' and (ch ->> 'purity' is null or purity = (ch ->> 'purity')::int) order by purity desc for update loop
          exit when need <= 0; take := least(need, s.qty); perform stack_take(c.id, s.template_id, s.purity, take); consumed := consumed || jsonb_build_object('t', s.template_id, 'purity', s.purity, 'q', take, 'cat', inp ->> 'cat'); need := need - take;
        end loop;
        if need > 0 then raise exception 'faltam % x %', need, (select name from item_templates where id = ch ->> 't'); end if; end;
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
  if coalesce((select props ? 'forge' from item_templates where id = rc.output ->> 't'), false) then
    -- equipamento forjado (arsenal das classes, elmo, anel, amuleto, ferramentas): montador genérico
    tl := tool_of(c.id, 'martelo');
    res := forge_build(rc.output ->> 't', j.consumed, avg_p, pl, c.name, coalesce((tl ->> 'tier')::numeric, 1), c.id); rar := (res ->> 'rarity')::int; q := (res ->> 'quality')::numeric;
    select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n >= 20 then raise exception 'mochila cheia'; end if;
    insert into items(template_id, rarity, roll, origin, crafted_by, crafted_at) values (rc.output ->> 't', rar, res - 'rarity', 'oficina', c.name, now()) returning id into nid;
    insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', n);
    res := res || jsonb_build_object('id', nid);
    insert into account_audit_log(user_id, action, meta) values (c.user_id, 'fabricou', jsonb_build_object('item', nid, 'tpl', rc.output ->> 't', 'rarity', rar, 'quality', round(q)));
  elsif rc.kind = 'refino' then
    pur := greatest(0, least(100, round(avg_p + (tech ->> 'purity_gain')::numeric * (0.6 + pl / 250.0) + rand_normal() * (tech ->> 'spread')::numeric)));
    outq := (rc.output ->> 'q')::int * j.qty;
    if rc.output ? 'same' then perform stack_add(c.id, (j.consumed -> 0) ->> 't', pur, outq); res := jsonb_build_object('t', (j.consumed -> 0) ->> 't', 'q', outq, 'purity', pur);
    else perform stack_add(c.id, rc.output ->> 't', pur, outq); res := jsonb_build_object('t', rc.output ->> 't', 'q', outq, 'purity', pur); end if;
    if rc.profession_id = 'metalurgia' and random() < 0.15 then perform stack_add(c.id, 'po_arcano', 40, 1); res := res || '{"sub":"po_arcano"}'; end if;
  elsif rc.kind = 'consumivel' then
    update characters set pots = pots + (rc.output ->> 'pots')::int * j.qty where id = c.id; res := jsonb_build_object('pots', (rc.output ->> 'pots')::int * j.qty);
  elsif rc.kind = 'equipamento' then
    declare met jsonb; mp jsonb; q2 numeric; base numeric; begin
      select x into met from jsonb_array_elements(j.consumed) x where x ->> 'cat' = 'barra' limit 1;
      mp := coalesce((select props from item_templates where id = met ->> 't'), '{"power":4,"weight":1,"tough":30,"magic":0}');
      q2 := greatest(0, least(100, avg_p * 0.6 + least(30, pl * 0.5) * 0.6 + rand_normal() * 5)); rar := rarity_from_quality(q2);
      if rc.output ->> 't' = 'armadura_forjada' then base := 10 + (mp ->> 'power')::numeric * 0.8;
        res := jsonb_build_object('def', round(base * (0.6 + q2 / 100 * 0.8), 1), 'hp', round((mp ->> 'tough')::numeric * 0.5 * (0.6 + q2 / 100 * 0.8)), 'dur', round((mp ->> 'tough')::numeric * 3), 'maxdur', round((mp ->> 'tough')::numeric * 3), 'name', 'Armadura de couro e ' || lower(regexp_replace(coalesce((select name from item_templates where id = met ->> 't'), 'metal'), '^(Barra|Liga) de ', '')));
      elsif rc.output ->> 't' = 'escudo_forjado' then base := 3 + (mp ->> 'power')::numeric * 0.9;
        res := jsonb_build_object('def', round(base * (0.6 + q2 / 100 * 0.8), 1), 'mdef', round((mp ->> 'magic')::numeric * 1.5, 1), 'dur', round((mp ->> 'tough')::numeric * 3.5), 'maxdur', round((mp ->> 'tough')::numeric * 3.5), 'name', 'Escudo de ' || lower(regexp_replace(coalesce((select name from item_templates where id = met ->> 't'), 'metal'), '^(Barra|Liga) de ', '')));
      else res := jsonb_build_object('def', round(3 * (0.6 + q2 / 100 * 0.8), 1), 'mdef', round(8 * (0.6 + q2 / 100 * 0.8), 1), 'matk', round(6 * (0.6 + q2 / 100 * 0.8), 1), 'dur', 90, 'maxdur', 90, 'name', 'Manto de seda sombria'); end if;
      res := res || jsonb_build_object('quality', round(q2), 'purity', round(avg_p), 'maker', c.name, 'made_at', now(), 'origin', 'Oficina de ' || c.name, 'components', jsonb_build_object('base', jsonb_build_object('mat', coalesce(met ->> 't', 'fio_seda'), 'purity', round(avg_p), 'mat_name', coalesce((select name from item_templates where id = met ->> 't'), 'Fio de seda'))));
      select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n >= 20 then raise exception 'mochila cheia'; end if;
      insert into items(template_id, rarity, roll, origin, crafted_by, crafted_at) values (rc.output ->> 't', rar, res, 'oficina', c.name, now()) returning id into nid;
      insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', n);
      res := res || jsonb_build_object('id', nid, 'rarity', rar); q := q2;
    end;
  elsif rc.kind = 'componente' then
    e := j.consumed -> 0;
    res := make_part(rc.output ->> 'part', e ->> 't', avg_p, pl);
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
      res := jsonb_build_object('dmin', dmin, 'dmax', dmax, 'aspd', aspd, 'crit', crit, 'dur', dur, 'maxdur', dur, 'quality', round(q), 'purity', round(((lam ->> 'purity')::numeric + (gua ->> 'purity')::numeric + (pom ->> 'purity')::numeric) / 3), 'sockets', case when q > 85 then 2 when q > 60 then 1 else 0 end, 'gems', '[]'::jsonb, 'ench', '[]'::jsonb, 'upgrade', 0, 'maker', c.name, 'made_at', now(), 'origin', 'Forja de ' || c.name, 'components', parts, 'name', 'Espada de ' || lower(regexp_replace(lam ->> 'mat_name', '^(Barra|Liga) de ', '')));
    else
      cab := parts -> 'cabeca'; emp := parts -> 'empunhadura';
      q := greatest(0, least(100, (cab ->> 'quality')::numeric * 0.7 + (emp ->> 'quality')::numeric * 0.3 + rand_normal() * 4));
      rar := rarity_from_quality(q);
      res := jsonb_build_object('tool', 'picareta', 'tier', (cab ->> 'tier')::int, 'eff', round(1 + q / 100 * 0.5, 2), 'speed', round(1 + q / 100 * 0.4 - (cab ->> 'weight')::numeric * 0.05, 2), 'dur', round((cab ->> 'tough')::numeric * 3), 'maxdur', round((cab ->> 'tough')::numeric * 3), 'quality', round(q), 'maker', c.name, 'made_at', now(), 'components', parts, 'name', 'Picareta de ' || lower(regexp_replace(cab ->> 'mat_name', '^(Barra|Liga) de ', '')));
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
-- =====================================================================================
-- ENCANTAMENTO DE 2 SLOTS (prefixo + sufixo, nível I a V) E DANO ELEMENTAL
-- =====================================================================================
alter table enchantments add column if not exists slot text check (slot in ('prefixo','sufixo'));
alter table enchantments add column if not exists element text;
alter table enchantments add column if not exists max_tier int not null default 5;
insert into enchantments(id, name, req_level, cost, effect, description, slot, element) values
 ('pre_fio','Fio Afiado',1,'{"t":"po_arcano","q":2,"gold":150}','{"atk":4}','+4 de ataque físico por nível','prefixo',null),
 ('pre_arcano','Poder Arcano',10,'{"t":"po_arcano","q":3,"gold":250}','{"matk":5}','+5 de ataque mágico por nível','prefixo',null),
 ('pre_precisao','Precisão Mortal',20,'{"t":"po_arcano","q":4,"gold":400}','{"crit":1.5}','+1,5% de crítico por nível','prefixo',null),
 ('pre_furia','Fúria Veloz',25,'{"t":"essencia_sombria","q":2,"gold":500}','{"aspd_pct":3}','+3% de velocidade de ataque por nível','prefixo',null),
 ('pre_diamante','Toque de Diamante',50,'{"t":"diamante","q":1,"gold":2000}','{"all_stats":1,"luck":0.01}','+1 em todos os atributos e +1% de sorte por nível','prefixo',null),
 ('suf_chama','da Chama Eterna',10,'{"t":"po_arcano","q":3,"gold":300}','{"elem_fogo":6}','+6 de dano de fogo por nível','sufixo','fogo'),
 ('suf_gelo','do Gelo Abissal',15,'{"t":"cristal_gelo","q":1,"gold":400}','{"elem_gelo":5,"def":2}','+5 de dano de gelo e +2 de defesa por nível','sufixo','gelo'),
 ('suf_luz','da Luz Sagrada',20,'{"t":"po_arcano","q":4,"gold":400}','{"elem_sagrado":5,"regen":0.5}','+5 de dano sagrado e +0,5 de regeneração por nível','sufixo','sagrado'),
 ('suf_veneno','do Veneno Sombrio',15,'{"t":"essencia_sombria","q":1,"gold":350}','{"elem_veneno":5,"dodge":0.8}','+5 de dano de veneno e +0,8% de esquiva por nível','sufixo','veneno'),
 ('suf_muralha','da Muralha de Pedra',5,'{"t":"pedra","q":10,"gold":300}','{"hp":30,"def":3}','+30 de vida e +3 de defesa por nível','sufixo',null)
on conflict (id) do update set name = excluded.name, req_level = excluded.req_level, cost = excluded.cost, effect = excluded.effect, description = excluded.description, slot = excluded.slot, element = excluded.element;

-- soma do equipamento: atributos do item + efeito dos encantamentos de 2 slots (roll.ench_fx)
create or replace function equip_roll(cid uuid, k text) returns numeric language sql stable as $$
  select coalesce(sum((coalesce((i.roll ->> k)::numeric, 0) + coalesce((i.roll -> 'ench_fx' ->> k)::numeric, 0)) * case when coalesce((i.roll ->> 'dur')::numeric, 1) <= 0 then 0.5 else 1 end), 0)
  from inventory inv join items i on i.id = inv.item_id where inv.character_id = cid and inv.container = 'equip' and inv.slot <> 'tool' $$;
create or replace function equip_sum(cid uuid, k text) returns numeric language sql stable as $$
  select coalesce(sum(((case k when 'atk' then t.atk when 'def' then t.def else 0 end) * coalesce((select (r ->> 'mult')::numeric from jsonb_array_elements(cfg('rarities')) r where (r ->> 'id')::int = i.rarity), 1)
    + coalesce((i.roll ->> k)::numeric, 0) + coalesce((i.roll -> 'ench_fx' ->> k)::numeric, 0) + case when k = 'atk' then (coalesce((i.roll ->> 'dmin')::numeric, 0) + coalesce((i.roll ->> 'dmax')::numeric, 0)) / 2 else 0 end)
    * case when coalesce((i.roll ->> 'dur')::numeric, 1) <= 0 then 0.5 else 1 end), 0)
  from inventory inv join items i on i.id = inv.item_id join item_templates t on t.id = i.template_id where inv.character_id = cid and inv.container = 'equip' and inv.slot <> 'tool' $$;
-- dano elemental do equipamento por elemento
create or replace function equip_elem(cid uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(el, v), '{}') from (select el, round(sum(coalesce((i.roll -> 'ench_fx' ->> ('elem_' || el))::numeric, 0) + coalesce((i.roll ->> ('elem_' || el))::numeric, 0)), 1) v
    from inventory inv join items i on i.id = inv.item_id cross join jsonb_array_elements_text(cfg('elements')) el where inv.character_id = cid and inv.container = 'equip' and inv.slot <> 'tool' group by el) x where v > 0 $$;

create or replace function stats_of(c characters) returns jsonb language plpgsql stable as $$
declare s jsonb := cfg('stats'); cl classes; lvl int := least(c.level, coalesce(cfgn('level','max')::int, c.level)); f numeric; v numeric; r numeric; i numeric; a numeric; d numeric; w numeric; l numeric; al numeric;
  hp numeric; mp numeric; patk numeric; matk numeric; def numeric; mdef numeric; crit numeric; dodge numeric; acc numeric; aspd numeric; regen numeric; carry numeric; luck numeric; dps numeric; el jsonb;
begin
  select * into cl from classes where id = coalesce(c.class_id, 'aventureiro');
  al := equip_roll(c.id, 'all_stats');
  f := attr(c,'for') + al; v := attr(c,'vit') + al; r := attr(c,'res') + al; i := attr(c,'int') + al; a := attr(c,'agi') + al; d := attr(c,'des') + al; w := attr(c,'sab') + al; l := attr(c,'sor') + al;
  hp := ((s->>'hp_base')::numeric + cl.hp_lvl * lvl + v * (s->>'hp_vit')::numeric + equip_roll(c.id,'hp')) * (1 + skill_fx(c,'hp_pct') / 100);
  mp := (s->>'mp_base')::numeric + cl.mp_lvl * lvl + i * (s->>'mp_int')::numeric + w * (s->>'mp_sab')::numeric;
  patk := (4 + f * (s->>'patk_for')::numeric + d * (s->>'patk_des')::numeric + lvl * (s->>'atk_lvl')::numeric + coalesce((c.skills ->> 'sword')::numeric, 10) * 0.3 + equip_sum(c.id, 'atk')) * (1 + skill_fx(c,'patk_pct') / 100);
  matk := (4 + i * (s->>'matk_int')::numeric + w * (s->>'matk_sab')::numeric + lvl * (s->>'atk_lvl')::numeric + coalesce((c.skills ->> 'magic')::numeric, 0) * 0.4 + equip_roll(c.id, 'matk') + case when cl.dmg_type = 'magico' then equip_sum(c.id, 'atk') * 0.8 else 0 end) * (1 + skill_fx(c,'matk_pct') / 100);
  def := (r * (s->>'def_res')::numeric + lvl * (s->>'def_lvl')::numeric + equip_sum(c.id, 'def') + coalesce((c.skills->>'shield')::numeric, 10) * 0.3) * cl.def_mul * (1 + skill_fx(c,'def_pct') / 100);
  mdef := w * (s->>'mdef_sab')::numeric + lvl * 0.5 + equip_roll(c.id, 'mdef');
  crit := least((s->>'crit_cap')::numeric, (s->>'crit_cap')::numeric * d / (d + (s->>'crit_k')::numeric) + skill_fx(c,'crit') + equip_roll(c.id,'crit'));
  dodge := least((s->>'dodge_cap')::numeric, (s->>'dodge_cap')::numeric * a / (a + (s->>'dodge_k')::numeric) + skill_fx(c,'dodge') + equip_roll(c.id,'dodge'));
  acc := (s->>'acc_base')::numeric + 15 * d / (d + (s->>'acc_k')::numeric);
  aspd := (1 + a / (a + (s->>'aspd_k')::numeric)) * (1 + (skill_fx(c,'aspd_pct') + equip_roll(c.id,'aspd_pct')) / 100) * coalesce(nullif(equip_roll(c.id,'aspd'), 0), 1);
  regen := (v * (s->>'regen_vit')::numeric + w * (s->>'regen_sab')::numeric) * (1 + skill_fx(c,'regen_pct') / 100) + equip_roll(c.id, 'regen');
  carry := (s->>'carry_base')::numeric + f * (s->>'carry_for')::numeric;
  luck := least((s->>'luck_cap')::numeric, l * (s->>'luck_per_point')::numeric + equip_roll(c.id, 'luck'));
  el := equip_elem(c.id);
  dps := (case cl.dmg_type when 'magico' then matk when 'misto' then (patk + matk) * 0.6 else patk end) * aspd * (1 + crit / 100 * 0.5) * (acc / 100) * (1 + skill_fx(c,'dps_mult'))
         + coalesce((select sum(value::numeric) from jsonb_each_text(el)), 0) * aspd;
  return jsonb_build_object('hp', round(hp), 'mp', round(mp), 'patk', round(patk, 1), 'matk', round(matk, 1), 'def', round(def, 1), 'mdef', round(mdef, 1), 'crit', round(crit, 1), 'dodge', round(dodge, 1), 'acc', round(acc, 1), 'aspd', round(aspd, 2), 'regen', round(regen, 1), 'carry', round(carry), 'luck', round(luck, 4), 'dps', round(dps, 1), 'elem', el, 'all_stats', al);
end $$;

-- dano elemental contra uma criatura: fraqueza soma, resistência tira
create or replace function elem_vs(el jsonb, m creatures) returns numeric language sql stable as $$
  select coalesce(sum(value::numeric * greatest(0, 1 + coalesce((m.weak ->> key)::numeric, 0) / 100 - coalesce((m.resist ->> key)::numeric, 0) / 100)), 0) from jsonb_each_text(coalesce(el, '{}')) $$;

-- equipar: nível, slot (inclui amuleto e ferramenta) e tipo de arma que a classe usa
create or replace function equip_item(p_item uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; it items; t item_templates; old uuid; sl text; cl classes; wt text;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select i.* into it from items i join inventory inv on inv.item_id = i.id where i.id = p_item and inv.character_id = c.id and inv.container in ('bag','protected');
  if it.id is null then raise exception 'item não está na sua mochila'; end if;
  select * into t from item_templates where id = it.template_id; sl := t.slot;
  if sl is null then raise exception 'não equipável'; end if;
  wt := coalesce(t.props ->> 'wtype', it.roll ->> 'wtype');
  select * into cl from classes where id = coalesce(c.class_id, 'aventureiro');
  if wt is not null and sl = 'weapon' and not (wt = any(cl.weapons)) then raise exception '% não usa %', cl.name, wt; end if;
  if wt is null and t.voc is not null and not (c.vocation = any(t.voc)) then raise exception 'outra vocação'; end if;
  if c.level < t.req_level then raise exception 'precisa de nível %', t.req_level; end if;
  select item_id into old from inventory where character_id = c.id and container = 'equip' and slot = sl;
  if old is not null then update inventory set container = 'bag', slot = null, updated_at = now() where item_id = old; end if;
  update inventory set container = 'equip', slot = sl, updated_at = now() where item_id = p_item;
  return get_state();
end $$;
-- item_action: encantamento de 2 slots com nível I-V; gema de diamante soma todos os atributos e sorte
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
    update items set roll = roll || jsonb_build_object('gems', coalesce(roll -> 'gems', '[]') || gem, 'crit', coalesce((roll ->> 'crit')::numeric, 0) + coalesce((gem ->> 'crit')::numeric, 0), 'hp', coalesce((roll ->> 'hp')::numeric, 0) + coalesce((gem ->> 'hp')::numeric, 0), 'matk', coalesce((roll ->> 'matk')::numeric, 0) + coalesce((gem ->> 'matk')::numeric, 0), 'mdef', coalesce((roll ->> 'mdef')::numeric, 0) + coalesce((gem ->> 'mdef')::numeric, 0), 'atk', coalesce((roll ->> 'atk')::numeric, 0) + coalesce((gem ->> 'patk')::numeric, 0), 'all_stats', coalesce((roll ->> 'all_stats')::numeric, 0) + coalesce((gem ->> 'all_stats')::numeric, 0), 'luck', coalesce((roll ->> 'luck')::numeric, 0) + coalesce((gem ->> 'luck')::numeric, 0)) where id = it.id;
    return jsonb_build_object('ok', true, 'state', get_state());
  elsif p_action = 'encantar' then
    select * into en from enchantments where id = p_arg ->> 'ench'; if en.id is null then raise exception 'encantamento inválido'; end if;
    if en.slot is not null then
      -- 2 slots: prefixo + sufixo. O mesmo encanto sobe de nível (I a V); outro no mesmo slot substitui
      declare cur jsonb := it.roll -> 'enchants' -> en.slot; tier int; fx jsonb := '{}'; sl2 text; e2 enchantments; tq int; begin
        if t.slot is null or t.slot = 'tool' then raise exception 'só equipamento recebe encantamento'; end if;
        tier := case when cur ->> 'id' = en.id then (cur ->> 'tier')::int + 1 else 1 end;
        if tier > en.max_tier then raise exception '% já está no nível máximo', en.name; end if;
        if prof_level(c.id, 'encantamento') < en.req_level + (tier - 1) * 10 then raise exception 'precisa de Encantamento nível %', en.req_level + (tier - 1) * 10; end if;
        tq := (en.cost ->> 'q')::int * tier;
        perform stack_take(c.id, en.cost ->> 't', (select purity from inventory_stacks where character_id = c.id and template_id = en.cost ->> 't' and qty >= tq order by purity desc limit 1), tq);
        select gold into g from wallets where character_id = c.id; if g < (en.cost ->> 'gold')::bigint * tier then raise exception 'custa % gold', (en.cost ->> 'gold')::bigint * tier; end if;
        perform add_gold(c.id, -(en.cost ->> 'gold')::bigint * tier, 'encantamento', it.id::text);
        it.roll := jsonb_set(it.roll || jsonb_build_object('enchants', coalesce(it.roll -> 'enchants', '{}')), array['enchants', en.slot], jsonb_build_object('id', en.id, 'tier', tier, 'name', en.name));
        for sl2 in select jsonb_object_keys(it.roll -> 'enchants') loop
          select * into e2 from enchantments where id = it.roll -> 'enchants' -> sl2 ->> 'id';
          fx := fx || (select coalesce(jsonb_object_agg(key, round((coalesce((fx ->> key)::numeric, 0) + value::numeric * (it.roll -> 'enchants' -> sl2 ->> 'tier')::int)::numeric, 3)), '{}') from jsonb_each_text(e2.effect));
        end loop;
        update items set roll = it.roll || jsonb_build_object('ench_fx', fx) where id = it.id;
        perform prof_gain(c.id, 'encantamento', 20 + en.req_level * tier);
        return jsonb_build_object('ok', true, 'tier', tier, 'state', get_state());
      end;
    end if;
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
-- =====================================================================================
-- MUNDOS: viagem, chefes mundiais, recursos extras por mundo, Forte Cinzento
-- =====================================================================================
insert into game_config(key, value, note) values
 ('world_drops', '{"2":[{"prof":"mineracao","t":"diamante_bruto","chance":0.01},{"prof":"mineracao","t":"pepita_ouro","chance":0.05},{"prof":"mineracao","t":"minerio_mitril","chance":0.03},{"prof":"mineracao","t":"esmeralda_bruta","chance":0.02},{"prof":"pesca","t":"cristal_gelo","chance":0.04}],"3":[{"prof":"mineracao","t":"minerio_adamantita","chance":0.02},{"prof":"lenharia","t":"tora_ancestral","chance":0.03},{"prof":"mineracao","t":"cristal_celestial","chance":0.0005},{"prof":"mineracao","t":"diamante_bruto","chance":0.015}],"4":[{"prof":"mineracao","t":"fragmento_primordial","chance":0.00005},{"prof":"mineracao","t":"minerio_adamantita","chance":0.04},{"prof":"mineracao","t":"diamante_bruto","chance":0.02}],"5":[{"prof":"mineracao","t":"fragmento_primordial","chance":0.0002},{"prof":"mineracao","t":"cristal_celestial","chance":0.002},{"prof":"mineracao","t":"diamante_bruto","chance":0.03},{"prof":"lenharia","t":"tora_ancestral","chance":0.05}]}', 'achados extras de coleta por mundo')
on conflict (key) do update set value = excluded.value;

create table if not exists world_bosses (id text primary key, world_id int not null references worlds(id), name text not null, description text, req_level int not null, power_ref numeric, reward jsonb not null, cooldown_h int not null default 12, sort int default 0);
alter table world_bosses enable row level security; drop policy if exists read_wb on world_bosses; create policy read_wb on world_bosses for select to authenticated using (true);
insert into world_bosses(id, world_id, name, description, req_level, power_ref, reward, cooldown_h, sort) values
 ('lorde_glacial',2,'Lorde Glacial','Senhor das geleiras de Frostheim.',150,1600,'{"item":"coroa_terras_medias","gold":20000,"gems":10,"exp_frac":0.5,"diamante":1}',12,1),
 ('farao_solar',2,'Faraó Solar','Rei morto do Templo do Sol Eterno, em Solkar.',150,1700,'{"item":"coroa_terras_medias","gold":22000,"gems":10,"exp_frac":0.5,"diamante":1}',12,2),
 ('ignaroth_desperto',3,'Ignaroth Desperto','O dragão voltou, maior, na Forja do Mundo.',300,3200,'{"item":"chave_abismo","gold":60000,"gems":20,"exp_frac":0.5,"diamante":2}',16,1),
 ('rei_ascendido',4,'Rei Esquecido Ascendido','O Rei Esquecido tomou o Abismo da Realidade.',450,5200,'{"item":"reliquia_primordial","gold":150000,"gems":40,"exp_frac":0.5,"diamante":3}',20,1),
 ('guardiao_eterno',5,'Guardião Eterno','Escala com quem o desafia. Não tem fim.',500,null,'{"gold":250000,"gems":60,"exp_frac":0.6,"diamante":5}',24,1)
on conflict (id) do update set name = excluded.name, description = excluded.description, req_level = excluded.req_level, power_ref = excluded.power_ref, reward = excluded.reward, cooldown_h = excluded.cooldown_h;

-- viajar entre mundos: nível + artefato do chefe anterior. Voltar pra mundos abaixo é livre.
create or replace function travel_world(p_world int) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; w worlds;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into w from worlds where id = p_world; if w.id is null then raise exception 'mundo inválido'; end if;
  if w.id = c.world_id then return get_state(); end if;
  if w.id > c.world_id then
    if c.level < w.req_level then raise exception '% pede nível %', w.name, w.req_level; end if;
    if w.req_item is not null and not exists (select 1 from inventory_stacks where character_id = c.id and template_id = w.req_item and qty > 0) then raise exception '% pede %', w.name, (select name from item_templates where id = w.req_item); end if;
    -- só sobe um mundo por vez
    if w.id > c.world_id + 1 and not exists (select 1 from account_audit_log where user_id = c.user_id and action = 'viagem_mundo' and (meta ->> 'to')::int >= w.id - 1) then raise exception 'passe antes pelo mundo %', w.id - 1; end if;
  end if;
  perform end_session(c.id, 'viagem');
  if exists (select 1 from gather_jobs where character_id = c.id and status = 'ativo') then update gather_jobs set status = 'cancelado' where character_id = c.id and status = 'ativo'; end if;
  update characters set world_id = w.id, updated_at = now() where id = c.id;
  insert into account_audit_log(user_id, action, meta) values (c.user_id, 'viagem_mundo', jsonb_build_object('from', c.world_id, 'to', w.id));
  return get_state();
end $$;
create or replace function worlds_view() returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'subtitle', w.subtitle, 'level_min', w.level_min, 'level_max', w.level_max, 'req_level', w.req_level, 'req_item', w.req_item, 'req_item_name', (select name from item_templates where id = w.req_item),
    'has_item', w.req_item is null or exists (select 1 from inventory_stacks s join characters ch on ch.id = s.character_id where ch.user_id = auth.uid() and s.template_id = w.req_item and s.qty > 0), 'palette', w.palette, 'prefix', w.creature_prefix, 'description', w.description,
    'players', (select count(*) from characters ch where ch.world_id = w.id and ch.last_seen_at > now() - interval '60 seconds'),
    'bosses', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'req_level', b.req_level, 'description', b.description) order by b.sort), '[]') from world_bosses b where b.world_id = w.id)) order by w.id), '[]') from worlds w $$;

-- chefes mundiais: mesmo modelo do Ancião (tempo mínimo de luta + poder decidido no servidor)
create or replace function world_boss_action(p_action text, p_boss text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; b world_bosses; r mythic_runs; last timestamptz; pw numeric; need numeric; win boolean; first boolean := false; ex bigint;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if p_action = 'lista' then
    return (select coalesce(jsonb_agg(jsonb_build_object('id', b2.id, 'name', b2.name, 'description', b2.description, 'req_level', b2.req_level, 'power_ref', coalesce(b2.power_ref, round(power_of(c) * 1.05)), 'power', round(power_of(c)), 'reward', b2.reward,
      'reward_name', (select name from item_templates where id = b2.reward ->> 'item'), 'first', (select to_jsonb(f) from world_firsts f where f.id = 'boss_' || b2.id),
      'ready_in', (select greatest(0, ceil(extract(epoch from (max(m.started_at) + make_interval(hours => b2.cooldown_h) - now())) / 3600)) from mythic_runs m where m.character_id = c.id and m.realm_id = b2.id and m.status = 'vencida'),
      'active', (select to_jsonb(m) from mythic_runs m where m.character_id = c.id and m.realm_id = b2.id and m.status = 'ativa')) order by b2.sort), '[]') from world_bosses b2 where b2.world_id = c.world_id);
  end if;
  select * into b from world_bosses where id = p_boss; if b.id is null then raise exception 'chefe inválido'; end if;
  if b.world_id <> c.world_id then raise exception 'esse chefe é de outro mundo'; end if;
  select * into r from mythic_runs where character_id = c.id and realm_id = b.id and status = 'ativa' for update;
  if p_action = 'desafiar' then
    if r.id is not null then return jsonb_build_object('run', to_jsonb(r)); end if;
    if c.level < b.req_level then raise exception '% só aceita desafiantes de nível %', b.name, b.req_level; end if;
    select max(started_at) into last from mythic_runs where character_id = c.id and realm_id = b.id and status = 'vencida';
    if last > now() - make_interval(hours => b.cooldown_h) then raise exception '% descansa. Volte em % h', b.name, ceil(extract(epoch from (last + make_interval(hours => b.cooldown_h) - now())) / 3600); end if;
    insert into mythic_runs(character_id, realm_id) values (c.id, b.id) returning * into r;
    return jsonb_build_object('run', to_jsonb(r));
  elsif p_action = 'resolver' then
    if r.id is null then raise exception 'nenhum desafio em andamento'; end if;
    if r.started_at > now() - interval '40 seconds' then raise exception 'a luta ainda não acabou'; end if;
    need := coalesce(b.power_ref, power_of(c) * 1.05); pw := power_of(c) * (1 + clan_level(c.id, 'quartel') * 0.015) * (0.85 + random() * 0.3); win := pw >= need;
    if not win then update mythic_runs set status = 'derrota', result = jsonb_build_object('power', round(pw), 'need', round(need)) where id = r.id; return jsonb_build_object('win', false, 'power', round(pw), 'need', round(need), 'state', get_state()); end if;
    if b.reward ? 'item' then perform stack_add(c.id, b.reward ->> 'item', 100, 1); end if;
    if (b.reward ->> 'diamante')::int > 0 then perform stack_add(c.id, 'diamante_bruto', 80, (b.reward ->> 'diamante')::int); end if;
    perform add_gold(c.id, (b.reward ->> 'gold')::bigint, 'chefe_mundial', b.id); perform add_gems(c.id, (b.reward ->> 'gems')::bigint, 'chefe_mundial', b.id);
    update treasury_pool set gems_issued = gems_issued + (b.reward ->> 'gems')::bigint where id = 1;
    ex := floor((exp_for(c.level + 1) - exp_for(c.level)) * (b.reward ->> 'exp_frac')::numeric);
    update characters set exp = exp + ex where id = c.id; while exists (select 1 from characters where id = c.id and exp >= exp_for(level + 1)) loop update characters set level = level + 1 where id = c.id; end loop;
    insert into world_firsts(id, label, character_id, character_name) values ('boss_' || b.id, 'Primeiro a derrotar ' || b.name, c.id, c.name) on conflict (id) do nothing returning true into first;
    insert into account_audit_log(user_id, action, meta) values (c.user_id, 'chefe_mundial', jsonb_build_object('boss', b.id, 'first', coalesce(first, false)));
    update mythic_runs set status = 'vencida', result = jsonb_build_object('power', round(pw), 'first', coalesce(first, false)) where id = r.id;
    return jsonb_build_object('win', true, 'first', coalesce(first, false), 'boss', b.name, 'reward', b.reward, 'reward_name', (select name from item_templates where id = b.reward ->> 'item'), 'exp', ex, 'state', get_state());
  elsif p_action = 'sair' then update mythic_runs set status = 'abandonada' where id = r.id; return jsonb_build_object('state', get_state());
  end if;
  raise exception 'ação inválida';
end $$;

-- Forte Cinzento: clã com mais influência domina
create or replace function fort_owner() returns uuid language sql stable as $$ select clan_id from fort_influence where points > 0 order by points desc, updated_at asc limit 1 $$;
create or replace function fort_decay() returns void language sql as $$
  update fort_influence set points = points * power(1 - (cfg('fort') ->> 'decay_per_day')::numeric, extract(epoch from (now() - updated_at)) / 86400.0), updated_at = now() where updated_at < now() - interval '1 hour' $$;
-- simulação, coleta: mundos, curva nova, clã, elemental
create or replace function simulate() returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e2 drop_entries; wd worlds; st0 jsonb; el jsonb; aspd0 numeric; qb numeric; diff int; tax bigint := 0; rep_tax bigint := 0; my_clan uuid; tax_pct int := 0; fk numeric := 0; fl jsonb;
  c characters; s hunt_sessions; h hunts; m creatures; hs hunt_state; b jsonb; ev record;
  t0 timestamptz; t1 timestamptz; cap interval; chunk interval; hours numeric; eff numeric := 1;
  n_occ int; pf numeric; per_hour numeric; share numeric; atk numeric; def numeric; m_def numeric; dps numeric; ttk numeric; cap_kills numeric;
  kills int; exp_gain bigint; gold_gain bigint; mult_exp numeric := 1; mult_gold numeric := 1; drop_n int; drop_ch numeric; dmg_in numeric; need_pots int; used_pots int;
  danger numeric; deaths int := 0; i int; seed text; lost bigint; rep_exp bigint := 0; rep_gold bigint := 0; rep_gold_out bigint := 0; rep_kills int := 0; rep_deaths int := 0; rep_pots int := 0; rep_drops jsonb := '[]'; rep_events jsonb := '[]';
  from_at timestamptz; sk text; hits int; dep jsonb; bag_n int; nid uuid; ended boolean := false; med numeric; g bigint; risky boolean;
begin
  select * into c from characters where user_id = auth.uid() for update;
  if c.id is null then return null; end if;
  update characters set last_seen_at = now() where id = c.id;
  perform world_tick();
  cap := make_interval(hours => case when c.premium then 24 else 12 end);
  t0 := c.last_simulated_at; t1 := now();
  if t1 - t0 < interval '5 seconds' then return null; end if;
  if t1 - t0 > interval '3 minutes' then eff := case when c.premium then cfgn('progress','offline_eff_premium') else cfgn('progress','offline_eff') end; end if;   -- off-line rende menos que presença
  if t1 - t0 > cap then t0 := t1 - cap; end if;
  from_at := t0;
  select * into s from hunt_sessions where character_id = c.id and status = 'ativa' limit 1;
  if s.id is null or c.task <> 'hunt' then
    update characters set hp = hp_max(c), mana = mana_max(c), last_simulated_at = t1 where id = c.id; return null;
  end if;
  select * into h from hunts where id = s.hunt_id; select * into m from creatures where id = h.creature_id; b := s.behavior;
  -- mundo: a criatura sobe pro nível da faixa do mundo
  select * into wd from worlds where id = c.world_id;
  if c.world_id > 1 then
    m.level := world_level(c.world_id, m.level); fl := creature_fit(m.level, m.category);
    m.hp := (fl ->> 'hp')::int; m.atk := (fl ->> 'atk')::int; m.def := (fl ->> 'def')::int; m.exp := (fl ->> 'exp')::int; m.gold_min := (fl ->> 'gmin')::int; m.gold_max := (fl ->> 'gmax')::int;
  end if;
  st0 := stats_of(c); el := st0 -> 'elem'; aspd0 := (st0 ->> 'aspd')::numeric;
  qb := clan_level(c.id, 'quartel') * (cfg('clan_buildings') -> 'quartel' ->> 'per_level')::numeric / 100;
  select m2.clan_id, cl.tax_pct into my_clan, tax_pct from clan_members m2 join clans cl on cl.id = m2.clan_id where m2.character_id = c.id;
  if my_clan is not null and h.id = any(array(select jsonb_array_elements_text(cfg('fort') -> 'hunts'))) then fk := (cfg('fort') ->> 'kill_points')::numeric; end if;
  risky := h.zone in ('conflito','guerra');
  select coalesce(percentile_cont(0.5) within group (order by level), 1) into med from characters where last_seen_at > now() - interval '7 days';
  sk := case c.vocation when 'knight' then 'sword' when 'paladin' then 'distance' else 'magic' end;
  while t0 < t1 and not ended loop
    chunk := least(t1 - t0, interval '60 minutes'); hours := extract(epoch from chunk) / 3600.0; seed := s.id::text || ':' || to_char(t0, 'YYYYMMDDHH24MI');
    select * into hs from hunt_state where hunt_id = h.id for update;
    select count(*) into n_occ from hunt_presence hp join characters ch on ch.id::text = hp.actor_id where hp.hunt_id = h.id and hp.actor_type = 'char' and hp.last_active_at > t0 - interval '15 minutes' and ch.world_id = c.world_id; n_occ := greatest(1, n_occ);
    pf := 0.2 + 0.8 * least(100, greatest(0, hs.population)) / 100.0;
    per_hour := h.spawns * 3600000.0 / (h.respawn_ms + 6000) * pf; share := 1.0 / n_occ;
    atk := atk_of(c) * (1 + qb) * (case b->>'postura' when 'agressiva' then 1.2 when 'defensiva' then 0.85 else 1 end) * (case c.kingdom when 'ash' then 1.05 else 1 end);
    def := def_of(c) * (case b->>'postura' when 'agressiva' then 0.8 when 'defensiva' then 1.3 else 1 end);
    -- elemental ignora defesa, respeita fraqueza e resistência
    m_def := m.def; dps := greatest(1, atk * 0.9 - m_def) + elem_vs(el, m) * aspd0; ttk := m.hp / dps * 0.8; cap_kills := 3600.0 / (ttk + 2.0);
    mult_exp := 1; mult_gold := 1;
    for ev in select * from world_events where state = 'ativo' and ends_at > t0 and (hunt_id is null or hunt_id = h.id) loop
      mult_exp := mult_exp * (1 + coalesce((ev.payload->>'exp')::numeric, 0)); mult_gold := mult_gold * (1 + coalesce((ev.payload->>'loot')::numeric, 0));
    end loop;
    if c.level < med then mult_exp := mult_exp * 2; end if;
    mult_exp := mult_exp * (1 + qb);
    -- acima do nível da criatura rende menos; acima do teto do mundo, quase nada (empurra pro próximo mundo)
    diff := c.level - m.level; if diff > cfgn('progress','overlevel_gap') then mult_exp := mult_exp / (1 + cfgn('progress','overlevel_k') * (diff - cfgn('progress','overlevel_gap'))); end if;
    if wd.level_max is not null and c.level > wd.level_max then mult_exp := mult_exp * (1 - cfgn('progress','world_cap_penalty')); end if;
    if c.kingdom = 'grey' then mult_gold := mult_gold * 1.05; end if;
    if b->>'objetivo' = 'exp' then mult_exp := mult_exp * 1.1; elsif b->>'objetivo' = 'gold' then mult_gold := mult_gold * 1.1; end if;
    if risky then mult_exp := mult_exp * 1.15; mult_gold := mult_gold * 1.15; end if;   -- zona de conflito paga mais
    kills := floor(least(per_hour * share, cap_kills) * hours * eff * (case b->>'alvo' when 'fraco' then 1.1 when 'raro' then 0.7 else 1 end) * (case b->>'objetivo' when 'materiais' then 0.9 else 1 end) + ht_rand(seed || ':k'));
    if c.level < world_level(c.world_id, h.level_min) then kills := floor(kills * 0.5); end if;
    dmg_in := greatest(0, m.atk * 1.0 - def) * (ttk / 1.2) * kills;
    need_pots := ceil(dmg_in / (60 + c.level)); used_pots := least(c.pots, need_pots);
    danger := least(0.95, greatest(0.01, (m.level - c.level) * 0.06 + 0.03)) * (case (b->>'recuo')::int when 0 then 1.4 when 10 then 1.2 when 20 then 1.0 else 0.8 end)
              * (case when used_pots < need_pots then 2.5 else 1 end) * (case b->>'postura' when 'defensiva' then 0.6 when 'agressiva' then 1.3 else 1 end) * (case b->>'alvo' when 'forte' then 1.2 else 1 end);
    deaths := floor(hours * danger * 2 + case when ht_rand(seed || ':d') < hours * danger then 1 else 0 end);
    if kills = 0 then deaths := 0; end if;
    kills := floor(kills * (1 - 0.1 * deaths));
    exp_gain := floor(kills * m.exp * mult_exp * (case b->>'alvo' when 'forte' then 1.08 when 'fraco' then 0.9 else 1 end));
    gold_gain := floor(kills * (m.gold_min + m.gold_max) / 2.0 * mult_gold);
    drop_ch := coalesce(m.drop_chance, 0) * coalesce(h.rare, 1) * (case b->>'alvo' when 'raro' then 1.5 else 1 end) * (case b->>'objetivo' when 'materiais' then 1.3 else 1 end);
    drop_n := floor(kills * drop_ch + case when ht_rand(seed || ':dr') < (kills * drop_ch - floor(kills * drop_ch)) then 1 else 0 end);
    select count(*) into bag_n from inventory where character_id = c.id and container = 'bag';
    for i in 1..drop_n loop
      if bag_n >= 20 then rep_events := rep_events || to_jsonb('mochila cheia: drop perdido'::text); exit; end if;
      nid := roll_item(m.drop_item, 'drop:' || h.id, seed || ':item' || i);
      insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', bag_n); bag_n := bag_n + 1;
      rep_drops := rep_drops || jsonb_build_object('template', m.drop_item, 'id', nid);
    end loop;
    -- drops de criatura: chance por abate, independente; vira material na pilha
    for e2 in select * from drop_entries where table_id = m.loot_table loop
      drop_n := floor(kills * e2.chance * (case b->>'objetivo' when 'materiais' then 1.3 else 1 end) + case when ht_rand(seed || ':lt' || e2.template_id) < (kills * e2.chance - floor(kills * e2.chance)) then 1 else 0 end);
      -- respeita a carga: o que não cabe fica no chão
      if drop_n > 0 then drop_n := least(drop_n, greatest(0, floor(((stats_of(c) ->> 'carry')::numeric - carry_weight(c.id)) / greatest(0.01, (select weight from item_templates where id = e2.template_id))))::int); end if;
      if drop_n > 0 then perform stack_add(c.id, e2.template_id, round(e2.purity_min + ht_rand(seed || ':lp' || e2.template_id) * (e2.purity_max - e2.purity_min))::int, drop_n); rep_drops := rep_drops || jsonb_build_object('template', e2.template_id, 'q', drop_n, 'mat', true); end if;
    end loop;
    if kills > 0 then insert into character_kills(character_id, creature_id, kills) values (c.id, m.id, kills) on conflict (character_id, creature_id) do update set kills = character_kills.kills + excluded.kills; end if;
    c.exp := c.exp + exp_gain; c.pots := c.pots - used_pots; c.kills := c.kills + kills;
    -- imposto do clã sobre o gold da caça vai pro cofre
    tax := case when my_clan is not null and tax_pct > 0 then floor(gold_gain * tax_pct / 100.0) else 0 end;
    if gold_gain - tax > 0 then perform add_gold(c.id, gold_gain - tax, 'loot', s.id::text); end if;
    if tax > 0 then insert into clan_vault(clan_id, gold) values (my_clan, tax) on conflict (clan_id) do update set gold = clan_vault.gold + excluded.gold, updated_at = now(); rep_tax := rep_tax + tax; end if;
    if fk > 0 and kills > 0 then insert into fort_influence(clan_id, points) values (my_clan, kills * fk) on conflict (clan_id) do update set points = fort_influence.points + excluded.points, updated_at = now(); end if;
    -- morte (doc, seção 7.2): nunca perde level; perde até 20% da barra atual (10% com bênção); em zona de conflito perde 5% do gold e 1 item da mochila
    for i in 1..deaths loop
      lost := floor((c.exp - exp_for(c.level)) * (case when c.bless then 0.10 else 0.20 end)); c.exp := c.exp - lost; c.bless := false; c.deaths := c.deaths + 1;
      if risky then
        select gold into g from wallets where character_id = c.id; lost := floor(g * 0.05);
        if lost > 0 then perform add_gold(c.id, -lost, 'morte', h.id); rep_gold_out := rep_gold_out + lost; end if;
        select item_id into nid from inventory where character_id = c.id and container = 'bag' order by random() limit 1;
        if nid is not null then delete from inventory where item_id = nid; delete from items where id = nid; bag_n := bag_n - 1; rep_events := rep_events || to_jsonb('morte em zona de conflito: item perdido'::text); end if;
      else
        rep_events := rep_events || to_jsonb('morte: perdeu parte da barra de exp'::text);
      end if;
    end loop;
    while c.exp >= exp_for(c.level + 1) loop c.level := c.level + 1; end loop;
    hits := kills * greatest(1, ceil(ttk / 0.8)); c.skill_xp := c.skill_xp || jsonb_build_object(sk, coalesce((c.skill_xp->>sk)::int, 0) + hits, 'shield', coalesce((c.skill_xp->>'shield')::int, 0) + floor(hits * 0.4));
    while (c.skill_xp->>sk)::int >= floor(40 * power(1.1, coalesce((c.skills->>sk)::int, 10) - 10)) loop
      c.skill_xp := c.skill_xp || jsonb_build_object(sk, (c.skill_xp->>sk)::int - floor(40 * power(1.1, coalesce((c.skills->>sk)::int, 10) - 10))); c.skills := c.skills || jsonb_build_object(sk, coalesce((c.skills->>sk)::int, 10) + 1);
    end loop;
    while (c.skill_xp->>'shield')::int >= floor(40 * power(1.1, coalesce((c.skills->>'shield')::int, 10) - 10)) loop
      c.skill_xp := c.skill_xp || jsonb_build_object('shield', (c.skill_xp->>'shield')::int - floor(40 * power(1.1, coalesce((c.skills->>'shield')::int, 10) - 10))); c.skills := c.skills || jsonb_build_object('shield', coalesce((c.skills->>'shield')::int, 10) + 1);
    end loop;
    update hunt_state set population = greatest(0, population - kills * 0.06), updated_at = t0 + chunk where hunt_id = h.id;
    insert into hunt_presence(hunt_id, actor_type, actor_id, last_active_at, contribution) values (h.id, 'char', c.id::text, t0 + chunk, kills)
      on conflict (hunt_id, actor_type, actor_id) do update set last_active_at = t0 + chunk, contribution = hunt_presence.contribution + kills;
    insert into territory_influence(hunt_id, actor_type, actor_id, kingdom, influence) values (h.id, 'char', c.id::text, c.kingdom, least(100, kills * 0.5))
      on conflict (hunt_id, actor_type, actor_id) do update set influence = least(100, territory_influence.influence + kills * 0.5), updated_at = now();
    rep_exp := rep_exp + exp_gain; rep_gold := rep_gold + gold_gain; rep_kills := rep_kills + kills; rep_deaths := rep_deaths + deaths; rep_pots := rep_pots + used_pots;
    if (bag_n >= 20 and b->>'reposicao' = 'mochila') or (c.pots = 0 and used_pots < need_pots and b->>'reposicao' in ('mochila','pocao')) then
      update characters set pots = c.pots, exp = c.exp, level = c.level where id = c.id;
      dep := deposit_routine(c.id); select pots into c.pots from characters where id = c.id;
      rep_events := rep_events || to_jsonb(format('depósito: vendeu %s materiais por %s gold, comprou %s poções', dep->>'n', dep->>'sold', dep->>'pots'));
      if c.pots = 0 and b->>'reposicao' <> 'nunca' then ended := true; rep_events := rep_events || to_jsonb('sem poção e sem gold: caça encerrada'::text); end if;
    end if;
    if deaths > 0 and (b->>'recuo')::int > 0 and ht_rand(seed || ':rt') < 0.3 then ended := true; rep_events := rep_events || to_jsonb('recuo após morte: caça encerrada'::text); end if;
    t0 := t0 + chunk;
  end loop;
  if eff < 1 and rep_kills > 0 then rep_events := rep_events || to_jsonb(format('off-line: rendimento de %s%%', round(eff * 100))); end if;
  if rep_tax > 0 then insert into clan_vault_logs(clan_id, character_id, name, action, currency, amount) values (my_clan, c.id, c.name, 'imposto', 'gold', rep_tax); rep_events := rep_events || to_jsonb(format('imposto do clã: %s gold pro cofre', rep_tax)); end if;
  if wd.level_max is not null and c.level > wd.level_max and rep_kills > 0 then rep_events := rep_events || to_jsonb(format('acima do teto de %s: exp reduzida. Viaje pro próximo mundo.', wd.name)); end if;
  update characters set exp = c.exp, level = c.level, pots = c.pots, bless = c.bless, kills = c.kills, deaths = c.deaths, skills = c.skills, skill_xp = c.skill_xp,
    hp = greatest(1, floor(hp_max(c) * (case when rep_deaths > 0 then 0.6 else 0.9 end))), mana = mana_max(c), last_simulated_at = t1, updated_at = now() where id = c.id;
  update hunt_sessions set totals = jsonb_build_object('exp', (totals->>'exp')::bigint + rep_exp, 'gold', (totals->>'gold')::bigint + rep_gold, 'kills', (totals->>'kills')::int + rep_kills, 'deaths', (totals->>'deaths')::int + rep_deaths, 'pots', (totals->>'pots')::int + rep_pots, 'drops', (totals->>'drops')::int + jsonb_array_length(rep_drops)) where id = s.id;
  perform quest_kills(c.id, h.id, rep_kills);
  if rep_kills > 0 then perform prof_gain(c.id, 'caca', greatest(1, rep_kills / 4));
    update items set roll = jsonb_set(roll, '{dur}', to_jsonb(greatest(0, (roll ->> 'dur')::numeric - floor(rep_kills / 30.0)))) where roll ? 'dur' and id in (select item_id from inventory where character_id = c.id and container = 'equip' and slot = 'weapon'); end if;
  if jsonb_array_length(rep_drops) > 0 then perform quest_kills(c.id, 'drop:' || h.id, jsonb_array_length(rep_drops)); end if;
  insert into session_reports(session_id, character_id, from_at, to_at, exp, gold_in, gold_out, kills, deaths, pots, drops, events, seen)
    values (s.id, c.id, from_at, t1, rep_exp, rep_gold, rep_gold_out, rep_kills, rep_deaths, rep_pots, rep_drops, rep_events, (t1 - from_at) < interval '2 minutes');
  if ended then perform end_session(c.id, 'auto'); end if;
  return jsonb_build_object('exp', rep_exp, 'gold', rep_gold, 'gold_out', rep_gold_out, 'kills', rep_kills, 'deaths', rep_deaths, 'pots', rep_pots, 'drops', rep_drops, 'events', rep_events, 'ended', ended, 'offline', eff < 1, 'hours', round(extract(epoch from (t1 - from_at)) / 3600.0, 2), 'tax', rep_tax);
end $$;

create or replace function gather_start(p_node text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; n resource_nodes; st resource_node_state; tool jsonb; pl int; secs numeric; jid uuid; last timestamptz; cap numeric;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into n from resource_nodes where id = p_node; if n.id is null then raise exception 'depósito inválido'; end if;
  if exists (select 1 from gather_jobs where character_id = c.id and status = 'ativo') then raise exception 'você já está coletando'; end if;
  if n.owner = 'forte' and (fort_owner() is null or fort_owner() is distinct from (select clan_id from clan_members where character_id = c.id)) then raise exception 'só o clã que domina o Forte Cinzento coleta aqui'; end if;
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
declare mb numeric; wx jsonb; c characters; j gather_jobs; n resource_nodes; tool jsonb; pl int; e drop_entries; r double precision; acc numeric := 0; luck numeric; got jsonb := '[]'; q int; pur int; lvl int; tid uuid; bonus_hit boolean := false; tt numeric;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into j from gather_jobs where id = p_job and character_id = c.id for update; if j.id is null or j.status <> 'ativo' then raise exception 'coleta já finalizada'; end if;
  if j.ready_at > now() then raise exception 'ainda não terminou'; end if;
  select * into n from resource_nodes where id = j.node_id;
  update resource_node_state set remaining = remaining - 1, refill_at = case when remaining - 1 <= 0 then now() + make_interval(secs => n.respawn_s) else refill_at end where node_id = n.id;
  pl := prof_level(c.id, n.profession_id); tool := tool_of(c.id, n.tool); tt := coalesce((tool ->> 'tier')::numeric, 1);
  luck := (stats_of(c) ->> 'luck')::numeric;
  mb := clan_level(c.id, 'mina') * (cfg('clan_buildings') -> 'mina' ->> 'per_level')::numeric / 100;   -- mina e serraria do clã
  -- base: sai sempre
  for e in select * from drop_entries where table_id = n.drop_table and kind = 'base' loop
    q := e.qty_min + floor(random() * (e.qty_max - e.qty_min + 1))::int; q := q + case when random() < ((tool ->> 'eff')::numeric - 1) then 1 else 0 end + case when random() < mb then 1 else 0 end;
    pur := greatest(0, least(100, round(e.purity_min + random() * (e.purity_max - e.purity_min) + pl * 0.15)));
    perform stack_add(c.id, e.template_id, pur, q); got := got || jsonb_build_object('t', e.template_id, 'q', q, 'purity', pur, 'rarity', (select base_rarity from item_templates where id = e.template_id));
  end loop;
  -- bônus: um sorteio só, do mais raro pro mais comum; sorte e ferramenta ajudam de leve (teto configurado)
  r := random();
  for e in select d.* from drop_entries d join item_templates t on t.id = d.template_id where d.table_id = n.drop_table and d.kind = 'bonus' order by t.base_rarity desc, d.chance asc loop
    if pl < e.min_prof or tt < e.min_tool_tier then continue; end if;
    acc := acc + e.chance * (1 + luck) * (1 + mb) * (1 + least(0.1, (tt - n.tool_tier) * 0.03));
    if r < acc then
      pur := greatest(0, least(100, round(e.purity_min + random() * (e.purity_max - e.purity_min) + pl * 0.1)));
      perform stack_add(c.id, e.template_id, pur, 1); got := got || jsonb_build_object('t', e.template_id, 'q', 1, 'purity', pur, 'rarity', (select base_rarity from item_templates where id = e.template_id), 'bonus', true);
      if (select base_rarity from item_templates where id = e.template_id) >= 4 then insert into account_audit_log(user_id, action, meta) values (c.user_id, 'achado_raro', jsonb_build_object('item', e.template_id, 'node', n.id)); end if;
      exit;
    end if;
  end loop;
  -- achados extras do mundo (sorteio independente, só da profissão do depósito)
  for wx in select * from jsonb_array_elements(coalesce(cfg('world_drops') -> c.world_id::text, '[]')) loop
    if wx ->> 'prof' = n.profession_id and random() < (wx ->> 'chance')::numeric * (1 + luck) * (1 + mb) then
      pur := greatest(0, least(100, round(40 + random() * 50 + pl * 0.1))); perform stack_add(c.id, wx ->> 't', pur, 1);
      got := got || jsonb_build_object('t', wx ->> 't', 'q', 1, 'purity', pur, 'rarity', (select base_rarity from item_templates where id = wx ->> 't'), 'bonus', true, 'world', true);
    end if;
  end loop;
  -- desgaste da ferramenta e experiência
  if tool is not null then update items set roll = jsonb_set(coalesce(roll, '{}'), '{dur}', to_jsonb(greatest(0, (tool ->> 'dur')::numeric - 1))) where id = (tool ->> 'id')::uuid; end if;
  lvl := prof_gain(c.id, n.profession_id, n.exp);
  perform prof_gain(c.id, 'exploracao', 1);
  update gather_jobs set status = 'pronto', result = got where id = j.id;
  return jsonb_build_object('got', got, 'prof', n.profession_id, 'level', lvl, 'exp', n.exp, 'state', get_state());
end $$;
-- =====================================================================================
-- MARKET 2.0: anúncios de item e de pilha, ordens de compra, taxas configuráveis, histórico
-- =====================================================================================
alter table characters add column if not exists market_seen_at timestamptz not null default now();
create or replace function market_fee_pct(cid uuid) returns numeric language sql stable as $$
  select greatest(0.5, cfgn('market','sale_fee_pct') - least(cfgn('market','comercio_cut_max'), prof_level(cid, 'comercio') * cfgn('market','comercio_cut_per_level'))
    - clan_level(cid, 'cambio') * (cfg('clan_buildings') -> 'cambio' ->> 'per_level')::numeric) $$;
-- taxa arrecadada: 20% pro cofre do clã que domina o Forte; o resto sai de circulação (gemas contam como queimadas no lastro)
create or replace function collect_fee(fee bigint, cur text, ref text) returns void language plpgsql as $$
declare fo uuid := fort_owner(); share bigint;
begin
  if fee <= 0 then return; end if;
  share := case when fo is not null then floor(fee * cfgn('market','fort_share')) else 0 end;
  if share > 0 then
    if cur = 'gems' then insert into clan_vault(clan_id, gems) values (fo, share) on conflict (clan_id) do update set gems = clan_vault.gems + excluded.gems, updated_at = now();
    else insert into clan_vault(clan_id, gold) values (fo, share) on conflict (clan_id) do update set gold = clan_vault.gold + excluded.gold, updated_at = now(); end if;
    insert into clan_vault_logs(clan_id, name, action, currency, amount) values (fo, 'Forte Cinzento', 'taxa_market', cur, share);
  end if;
  if cur = 'gems' then update treasury_pool set gems_burned = gems_burned + (fee - share), updated_at = now() where id = 1; insert into treasury_ledger(kind, gems, ref) values ('taxa_market_gemas', fee - share, ref); end if;
end $$;
create or replace function pay(cid uuid, cur text, amt bigint, why text, ref text) returns void language plpgsql as $$
begin if amt = 0 then return; end if; if cur = 'gems' then perform add_gems(cid, amt, why, ref); else perform add_gold(cid, amt, why, ref); end if; end $$;
create or replace function balance_of(cid uuid, cur text) returns bigint language sql stable as $$ select case when cur = 'gems' then gems else gold end from wallets where character_id = cid $$;

create or replace function list_item(p_item uuid, p_price bigint, p_currency text default 'gold') returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; n int; fee bigint;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if p_currency not in ('gold','gems') then raise exception 'moeda inválida'; end if;
  if p_price < 1 or p_price > 100000000 then raise exception 'preço inválido'; end if;
  select count(*) into n from market_listings where seller_character_id = c.id and status = 'aberto'; if n >= cfgn('market','max_listings') then raise exception 'máximo de % anúncios', cfgn('market','max_listings'); end if;
  fee := ceil(p_price * cfgn('market','listing_fee_pct') / 100.0);
  if balance_of(c.id, p_currency) < fee then raise exception 'taxa de anúncio: % %', fee, case when p_currency = 'gems' then 'gemas' else 'gold' end; end if;
  update inventory set container = 'market', slot = null, updated_at = now() where item_id = p_item and character_id = c.id and container in ('bag','protected');
  if not found then raise exception 'item não está na sua mochila'; end if;
  perform pay(c.id, p_currency, -fee, 'taxa_anuncio', p_item::text); perform collect_fee(fee, p_currency, 'anuncio');
  insert into market_listings(seller_character_id, item_id, price, currency, fee_paid, template_id) values (c.id, p_item, p_price, p_currency, fee, (select template_id from items where id = p_item));
  return get_state();
end $$;
create or replace function list_stack(p_tpl text, p_purity int, p_qty int, p_price bigint, p_currency text default 'gold') returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; n int; fee bigint; t item_templates;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into t from item_templates where id = p_tpl; if t.id is null or not t.stackable or t.deprecated then raise exception 'material inválido'; end if;
  if p_currency not in ('gold','gems') or p_price < 1 or p_price > 100000000 or p_qty < 1 then raise exception 'anúncio inválido'; end if;
  select count(*) into n from market_listings where seller_character_id = c.id and status = 'aberto'; if n >= cfgn('market','max_listings') then raise exception 'máximo de % anúncios', cfgn('market','max_listings'); end if;
  fee := ceil(p_price * cfgn('market','listing_fee_pct') / 100.0);
  if balance_of(c.id, p_currency) < fee then raise exception 'taxa de anúncio: %', fee; end if;
  perform stack_take(c.id, p_tpl, p_purity, p_qty);
  perform pay(c.id, p_currency, -fee, 'taxa_anuncio', p_tpl); perform collect_fee(fee, p_currency, 'anuncio');
  insert into market_listings(seller_character_id, item_id, price, currency, fee_paid, template_id, purity, qty) values (c.id, null, p_price, p_currency, fee, p_tpl, p_purity, p_qty);
  return get_state();
end $$;
create or replace function buy_listing(p_listing uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; l market_listings; fee bigint; n int; it items;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into l from market_listings where id = p_listing and status = 'aberto' for update; if l.id is null then raise exception 'anúncio já vendido ou cancelado'; end if;
  if l.seller_character_id = c.id then raise exception 'é o seu próprio anúncio'; end if;
  if l.item_id is not null then select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n >= 20 then raise exception 'mochila cheia'; end if; end if;
  perform 1 from wallets where character_id = c.id for update;
  if balance_of(c.id, l.currency) < l.price then raise exception '% insuficiente', case when l.currency = 'gems' then 'gemas' else 'gold' end; end if;
  fee := floor(l.price * market_fee_pct(l.seller_character_id) / 100.0);
  perform pay(c.id, l.currency, -l.price, 'compra_market', l.id::text); perform pay(l.seller_character_id, l.currency, l.price - fee, 'venda_market', l.id::text); perform collect_fee(fee, l.currency, l.id::text);
  update market_listings set status = 'vendido' where id = l.id;
  if l.item_id is not null then update inventory set character_id = c.id, container = 'bag', idx = n, updated_at = now() where item_id = l.item_id; select * into it from items where id = l.item_id;
  else perform stack_add(c.id, l.template_id, l.purity, l.qty); end if;
  insert into market_transactions(listing_id, buyer_id, seller_id, price, fee, currency, template_id, qty, purity, rarity, kind) values (l.id, c.id, l.seller_character_id, l.price, fee, l.currency, coalesce(l.template_id, it.template_id), coalesce(l.qty, 1), l.purity, it.rarity, 'listing');
  perform prof_gain(l.seller_character_id, 'comercio', greatest(1, l.price / 200));
  return get_state();
end $$;
create or replace function cancel_listing(p_listing uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; l market_listings;
begin
  select * into c from characters where user_id = auth.uid(); if c.id is null then raise exception 'sem personagem'; end if;
  select * into l from market_listings where id = p_listing and seller_character_id = c.id and status = 'aberto' for update; if l.id is null then raise exception 'anúncio não encontrado'; end if;
  update market_listings set status = 'cancelado' where id = l.id;
  if l.item_id is not null then update inventory set container = 'bag', updated_at = now() where item_id = l.item_id; else perform stack_add(c.id, l.template_id, l.purity, l.qty); end if;
  return get_state();   -- a taxa de anúncio não volta
end $$;

-- ordens de compra: o comprador trava o pagamento; quem tem o material vende na hora
create or replace function create_buy_order(p_tpl text, p_qty int, p_price_each bigint, p_currency text default 'gold', p_min_purity int default 0, p_min_rarity int default 0) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; t item_templates; tot bigint; fee bigint; n int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into t from item_templates where id = p_tpl; if t.id is null or t.deprecated or t.category = 'artefato' then raise exception 'item inválido'; end if;
  if p_currency not in ('gold','gems') or p_qty < 1 or p_qty > 10000 or p_price_each < 1 then raise exception 'ordem inválida'; end if;
  select count(*) into n from market_buy_orders where buyer_id = c.id and status = 'aberta'; if n >= cfgn('market','max_buy_orders') then raise exception 'máximo de % ordens de compra', cfgn('market','max_buy_orders'); end if;
  tot := p_price_each * p_qty; fee := ceil(tot * cfgn('market','listing_fee_pct') / 100.0);
  perform 1 from wallets where character_id = c.id for update;
  if balance_of(c.id, p_currency) < tot + fee then raise exception 'precisa de % % (ordem + taxa de %)', tot + fee, case when p_currency = 'gems' then 'gemas' else 'gold' end, fee; end if;
  perform pay(c.id, p_currency, -tot, 'ordem_compra_custodia', p_tpl); perform pay(c.id, p_currency, -fee, 'taxa_anuncio', p_tpl); perform collect_fee(fee, p_currency, 'ordem');
  insert into market_buy_orders(buyer_id, template_id, kind, min_purity, min_rarity, qty, price_each, currency, escrow) values (c.id, p_tpl, case when t.stackable then 'stack' else 'item' end, greatest(0, least(100, p_min_purity)), greatest(0, least(7, p_min_rarity)), p_qty, p_price_each, p_currency, tot);
  return get_state();
end $$;
create or replace function fulfill_buy_order(p_order uuid, p_qty int default 1, p_purity int default null, p_item uuid default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; o market_buy_orders; q int; gross bigint; fee bigint; it items; n int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into o from market_buy_orders where id = p_order and status = 'aberta' and expires_at > now() for update; if o.id is null then raise exception 'ordem fechada'; end if;
  if o.buyer_id = c.id then raise exception 'é a sua própria ordem'; end if;
  if o.kind = 'stack' then
    q := least(greatest(1, p_qty), o.qty - o.filled);
    if p_purity is null or p_purity < o.min_purity then raise exception 'pureza mínima da ordem: %', o.min_purity; end if;
    perform stack_take(c.id, o.template_id, p_purity, q); perform stack_add(o.buyer_id, o.template_id, p_purity, q);
  else
    q := 1;
    select i.* into it from items i join inventory v on v.item_id = i.id where i.id = p_item and v.character_id = c.id and v.container in ('bag','protected') and i.template_id = o.template_id;
    if it.id is null then raise exception 'item não está na sua mochila'; end if;
    if it.rarity < o.min_rarity then raise exception 'raridade mínima da ordem não atendida'; end if;
    select count(*) into n from inventory where character_id = o.buyer_id and container = 'bag'; if n >= 20 then raise exception 'a mochila do comprador está cheia'; end if;
    update inventory set character_id = o.buyer_id, container = 'bag', idx = n, slot = null, updated_at = now() where item_id = it.id;
  end if;
  gross := o.price_each * q; fee := floor(gross * market_fee_pct(c.id) / 100.0);
  perform pay(c.id, o.currency, gross - fee, 'ordem_venda', o.id::text); perform collect_fee(fee, o.currency, o.id::text);
  update market_buy_orders set filled = filled + q, escrow = escrow - gross, status = case when filled + q >= qty then 'cumprida' else 'aberta' end where id = o.id;
  insert into market_transactions(listing_id, buyer_id, seller_id, price, fee, currency, template_id, qty, purity, rarity, kind) values (null, o.buyer_id, c.id, gross, fee, o.currency, o.template_id, q, p_purity, it.rarity, 'buy_order');
  perform prof_gain(c.id, 'comercio', greatest(1, gross / 200));
  return get_state();
end $$;
create or replace function cancel_buy_order(p_order uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; o market_buy_orders;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into o from market_buy_orders where id = p_order and buyer_id = c.id and status = 'aberta' for update; if o.id is null then raise exception 'ordem não encontrada'; end if;
  perform pay(c.id, o.currency, o.escrow, 'ordem_compra_devolvida', o.id::text);
  update market_buy_orders set status = 'cancelada', escrow = 0 where id = o.id;
  return get_state();
end $$;
-- visão completa do Market: anúncios, ordens, estatística por template (média das últimas 20, menor venda, maior compra)
create or replace function market_view2() returns jsonb language plpgsql security definer set search_path = public stable as $$
declare me uuid := (select id from characters where user_id = auth.uid());
begin
  return jsonb_build_object(
    'listings', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'price', l.price, 'currency', l.currency, 'qty', l.qty, 'purity', l.purity, 'template', coalesce(l.template_id, i.template_id), 'stack', l.item_id is null,
        'item', case when i.id is not null then jsonb_build_object('id', i.id, 'template', i.template_id, 'rarity', i.rarity, 'roll', i.roll, 'value', item_value(i)) end,
        'seller', ch.name, 'mine', ch.id = me, 'created_at', l.created_at) order by l.created_at desc), '[]')
      from market_listings l left join items i on i.id = l.item_id join characters ch on ch.id = l.seller_character_id where l.status = 'aberto' and l.expires_at > now()),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'template', o.template_id, 'kind', o.kind, 'qty', o.qty, 'filled', o.filled, 'price_each', o.price_each, 'currency', o.currency, 'min_purity', o.min_purity, 'min_rarity', o.min_rarity, 'buyer', ch.name, 'mine', ch.id = me, 'created_at', o.created_at) order by o.price_each desc), '[]')
      from market_buy_orders o join characters ch on ch.id = o.buyer_id where o.status = 'aberta' and o.expires_at > now()),
    'stats', (select coalesce(jsonb_object_agg(tpl, st), '{}') from (
      select tpl, jsonb_build_object(
        'avg_gold', (select round(avg(price::numeric / qty), 1) from (select price, qty from market_transactions where template_id = tpl and currency = 'gold' order by created_at desc limit cfgn('market','history_n')::int) x),
        'avg_gems', (select round(avg(price::numeric / qty), 2) from (select price, qty from market_transactions where template_id = tpl and currency = 'gems' order by created_at desc limit cfgn('market','history_n')::int) x),
        'n', (select count(*) from market_transactions where template_id = tpl),
        'min_sell_gold', (select min(price::numeric / coalesce(qty, 1)) from market_listings where status = 'aberto' and currency = 'gold' and coalesce(template_id, (select template_id from items where id = item_id)) = tpl),
        'min_sell_gems', (select min(price::numeric / coalesce(qty, 1)) from market_listings where status = 'aberto' and currency = 'gems' and coalesce(template_id, (select template_id from items where id = item_id)) = tpl),
        'max_buy_gold', (select max(price_each) from market_buy_orders where status = 'aberta' and currency = 'gold' and template_id = tpl),
        'max_buy_gems', (select max(price_each) from market_buy_orders where status = 'aberta' and currency = 'gems' and template_id = tpl)) st
      from (select distinct template_id tpl from market_transactions where template_id is not null union select distinct coalesce(template_id, (select template_id from items where id = item_id)) from market_listings where status = 'aberto' union select distinct template_id from market_buy_orders where status = 'aberta') t where tpl is not null) s),
    'fee_pct', market_fee_pct(me), 'listing_fee_pct', cfgn('market','listing_fee_pct'));
end $$;
create or replace function market_history(p_tpl text) returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('price', price, 'qty', qty, 'each', round(price::numeric / qty, 2), 'currency', currency, 'purity', purity, 'rarity', rarity, 'kind', kind, 'at', created_at) order by created_at desc), '[]')
  from (select * from market_transactions where template_id = p_tpl order by created_at desc limit 50) x $$;
create or replace function market_seen() returns void language sql security definer set search_path = public as $$ update characters set market_seen_at = now() where user_id = auth.uid() $$;
-- =====================================================================================
-- TROCAS BILATERAIS COM TRAVA DUPLA
-- =====================================================================================
-- custódia: o que cada lado põe na mesa sai da mochila na hora e só volta se a troca for desfeita
create or replace function trade_take(cid uuid, p_items uuid[], p_stacks jsonb, p_gold bigint, p_gems bigint, ref text) returns void language plpgsql as $$
declare n int; s jsonb;
begin
  if coalesce(array_length(p_items, 1), 0) > 8 then raise exception 'máximo de 8 itens por lado'; end if;
  if jsonb_array_length(coalesce(p_stacks, '[]')) > 8 then raise exception 'máximo de 8 pilhas por lado'; end if;
  if least(p_gold, p_gems) < 0 then raise exception 'valor inválido'; end if;
  select count(*) into n from inventory where character_id = cid and container in ('bag','protected') and item_id = any(coalesce(p_items, '{}'));
  if n <> coalesce(array_length(p_items, 1), 0) then raise exception 'algum item não está na sua mochila'; end if;
  update inventory set container = 'trade', updated_at = now() where item_id = any(coalesce(p_items, '{}'));
  for s in select * from jsonb_array_elements(coalesce(p_stacks, '[]')) loop
    if (s ->> 'qty')::int < 1 then raise exception 'quantidade inválida'; end if;
    if (select deprecated or category = 'artefato' from item_templates where id = s ->> 't') then raise exception 'esse material não pode ser trocado'; end if;
    perform stack_take(cid, s ->> 't', (s ->> 'purity')::int, (s ->> 'qty')::int);
  end loop;
  if p_gold > 0 then perform add_gold(cid, -p_gold, 'troca_custodia', ref); end if;
  if p_gems > 0 then perform add_gems(cid, -p_gems, 'troca_custodia', ref); end if;
end $$;
create or replace function trade_release(cid uuid, p_items uuid[], p_stacks jsonb, p_gold bigint, p_gems bigint, ref text) returns void language plpgsql as $$
declare s jsonb;
begin
  update inventory set container = 'bag', updated_at = now() where item_id = any(coalesce(p_items, '{}')) and container = 'trade';
  for s in select * from jsonb_array_elements(coalesce(p_stacks, '[]')) loop perform stack_add(cid, s ->> 't', (s ->> 'purity')::int, (s ->> 'qty')::int); end loop;
  if p_gold > 0 then perform add_gold(cid, p_gold, 'troca_devolvida', ref); end if;
  if p_gems > 0 then perform add_gems(cid, p_gems, 'troca_devolvida', ref); end if;
end $$;
create or replace function trade_open(p_to text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; t characters; n int; tid uuid;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into t from characters where name = p_to; if t.id is null then raise exception 'jogador não encontrado'; end if;
  if t.id = c.id then raise exception 'não dá pra trocar com você mesmo'; end if;
  select count(*) into n from trades where (from_char = c.id or to_char = c.id) and status = 'aberta'; if n >= 5 then raise exception 'máximo de 5 trocas abertas'; end if;
  insert into trades(from_char, to_char, mode) values (c.id, t.id, 'bilateral') returning id into tid;
  insert into account_audit_log(user_id, action, meta) values (c.user_id, 'trade_open', jsonb_build_object('trade', tid, 'to', t.name));
  return jsonb_build_object('trade', tid, 'state', get_state());
end $$;
-- muda a minha oferta: devolve a anterior, trava a nova e desmarca as duas confirmações
create or replace function trade_set(p_trade uuid, p_items uuid[] default '{}', p_stacks jsonb default '[]', p_gold bigint default 0, p_gems bigint default 0) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; tr trades; a boolean;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into tr from trades where id = p_trade and status = 'aberta' and mode = 'bilateral' for update; if tr.id is null then raise exception 'troca não está aberta'; end if;
  if c.id not in (tr.from_char, tr.to_char) then raise exception 'troca de outros jogadores'; end if;
  a := c.id = tr.from_char;
  if a then perform trade_release(c.id, tr.offer_items, tr.from_stacks, tr.offer_gold, tr.offer_gems, tr.id::text);
  else perform trade_release(c.id, tr.to_items, tr.to_stacks, tr.to_gold, tr.to_gems, tr.id::text); end if;
  perform trade_take(c.id, coalesce(p_items, '{}'), coalesce(p_stacks, '[]'), coalesce(p_gold, 0), coalesce(p_gems, 0), tr.id::text);
  if a then update trades set offer_items = coalesce(p_items, '{}'), from_stacks = coalesce(p_stacks, '[]'), offer_gold = coalesce(p_gold, 0), offer_gems = coalesce(p_gems, 0), accepted_a = false, accepted_b = false, version = version + 1, updated_at = now() where id = tr.id;
  else update trades set to_items = coalesce(p_items, '{}'), to_stacks = coalesce(p_stacks, '[]'), to_gold = coalesce(p_gold, 0), to_gems = coalesce(p_gems, 0), accepted_a = false, accepted_b = false, version = version + 1, updated_at = now() where id = tr.id; end if;
  return get_state();
end $$;
-- confirma a versão que está vendo; quando os dois confirmam a mesma versão, tudo troca de dono de uma vez
create or replace function trade_confirm(p_trade uuid, p_version int) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; tr trades; na int; nb int; s jsonb;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into tr from trades where id = p_trade and status = 'aberta' and mode = 'bilateral' for update; if tr.id is null then raise exception 'troca não está aberta'; end if;
  if c.id not in (tr.from_char, tr.to_char) then raise exception 'troca de outros jogadores'; end if;
  if tr.version <> p_version then raise exception 'a oferta mudou: confira de novo antes de confirmar'; end if;
  if coalesce(array_length(tr.offer_items, 1), 0) + jsonb_array_length(tr.from_stacks) + tr.offer_gold + tr.offer_gems + coalesce(array_length(tr.to_items, 1), 0) + jsonb_array_length(tr.to_stacks) + tr.to_gold + tr.to_gems = 0 then raise exception 'troca vazia'; end if;
  if c.id = tr.from_char then update trades set accepted_a = true where id = tr.id; tr.accepted_a := true; else update trades set accepted_b = true where id = tr.id; tr.accepted_b := true; end if;
  if not (tr.accepted_a and tr.accepted_b) then return get_state(); end if;
  -- executa: espaço na mochila dos dois lados
  select count(*) into na from inventory where character_id = tr.from_char and container = 'bag'; select count(*) into nb from inventory where character_id = tr.to_char and container = 'bag';
  if na + coalesce(array_length(tr.to_items, 1), 0) > 20 or nb + coalesce(array_length(tr.offer_items, 1), 0) > 20 then raise exception 'mochila sem espaço de um dos lados'; end if;
  update inventory set character_id = tr.to_char, container = 'bag', updated_at = now() where item_id = any(tr.offer_items) and container = 'trade';
  update inventory set character_id = tr.from_char, container = 'bag', updated_at = now() where item_id = any(tr.to_items) and container = 'trade';
  for s in select * from jsonb_array_elements(tr.from_stacks) loop perform stack_add(tr.to_char, s ->> 't', (s ->> 'purity')::int, (s ->> 'qty')::int); end loop;
  for s in select * from jsonb_array_elements(tr.to_stacks) loop perform stack_add(tr.from_char, s ->> 't', (s ->> 'purity')::int, (s ->> 'qty')::int); end loop;
  if tr.offer_gold > 0 then perform add_gold(tr.to_char, tr.offer_gold, 'troca_recebida', tr.id::text); end if;
  if tr.offer_gems > 0 then perform add_gems(tr.to_char, tr.offer_gems, 'troca_recebida', tr.id::text); end if;
  if tr.to_gold > 0 then perform add_gold(tr.from_char, tr.to_gold, 'troca_recebida', tr.id::text); end if;
  if tr.to_gems > 0 then perform add_gems(tr.from_char, tr.to_gems, 'troca_recebida', tr.id::text); end if;
  update trades set status = 'aceita', closed_at = now() where id = tr.id;
  insert into account_audit_log(user_id, action, meta) values (c.user_id, 'trade_done', jsonb_build_object('trade', tr.id));
  return get_state();
end $$;
create or replace function trade_cancel(p_trade uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; tr trades;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into tr from trades where id = p_trade and status = 'aberta' for update; if tr.id is null then raise exception 'troca não está aberta'; end if;
  if c.id not in (tr.from_char, tr.to_char) then raise exception 'troca de outros jogadores'; end if;
  if tr.mode <> 'bilateral' then return close_trade(p_trade, case when c.id = tr.from_char then 'cancelar' else 'recusar' end); end if;
  perform trade_release(tr.from_char, tr.offer_items, tr.from_stacks, tr.offer_gold, tr.offer_gems, tr.id::text);
  perform trade_release(tr.to_char, tr.to_items, tr.to_stacks, tr.to_gold, tr.to_gems, tr.id::text);
  update trades set status = case when c.id = tr.from_char then 'cancelada' else 'recusada' end, closed_at = now() where id = tr.id;
  return get_state();
end $$;

-- =====================================================================================
-- CARTEIRA: 100 GEMAS = 1 USDT, COM LASTRO FECHADO ENTRE JOGADORES
-- =====================================================================================
-- gemas sacáveis: só as que vieram de outros jogadores (Market, ordens, trocas), menos o que já saiu em saque
create or replace function withdrawable_gems(cid uuid) returns bigint language sql stable as $$
  select greatest(0, least((select gems from wallets where character_id = cid),
    coalesce((select sum(amount) from ledger where character_id = cid and currency = 'gems' and amount > 0 and reason in ('venda_market','ordem_venda','troca_recebida')), 0)
    - coalesce((select sum(gems) from withdrawal_requests where character_id = cid and status <> 'rejected'), 0))) $$;
create or replace function wallet_view() returns jsonb language plpgsql security definer set search_path = public stable as $$
declare c characters; k jsonb := cfg('p2e'); tp treasury_pool;
begin
  select * into c from characters where user_id = auth.uid(); if c.id is null then raise exception 'sem personagem'; end if;
  select * into tp from treasury_pool where id = 1;
  return jsonb_build_object('config', k - 'treasury_share' - 'platform_share', 'gems', (select gems from wallets where character_id = c.id), 'withdrawable', withdrawable_gems(c.id),
    'today', coalesce((select sum(gems) from withdrawal_requests where character_id = c.id and status <> 'rejected' and created_at > now() - interval '24 hours'), 0),
    'deposits', (select coalesce(jsonb_agg(to_jsonb(d) - 'character_id' order by d.created_at desc), '[]') from (select * from deposit_requests where character_id = c.id order by created_at desc limit 20) d),
    'withdrawals', (select coalesce(jsonb_agg(to_jsonb(w) - 'character_id' order by w.created_at desc), '[]') from (select * from withdrawal_requests where character_id = c.id order by created_at desc limit 20) w),
    'backing', jsonb_build_object('usdt', tp.usdt_balance, 'pending_usdt', (select coalesce(sum(usdt), 0) from withdrawal_requests where status in ('pending','approved'))),
    'admin', is_admin());
end $$;
create or replace function create_deposit(p_package text, p_method text, p_reference text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; k jsonb := cfg('p2e'); pk jsonb; n int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if not (k ->> 'enabled')::boolean then raise exception 'carteira desligada'; end if;
  select x into pk from jsonb_array_elements(k -> 'packages') x where x ->> 'id' = p_package; if pk is null then raise exception 'pacote inválido'; end if;
  if p_method not in ('polygon','bep20','trc20','pix') then raise exception 'forma de pagamento inválida'; end if;
  if length(btrim(coalesce(p_reference, ''))) < 6 then raise exception 'informe o hash da transação ou o código do PIX'; end if;
  if exists (select 1 from deposit_requests where reference = btrim(p_reference) and status <> 'rejected') then raise exception 'essa referência já foi usada'; end if;
  select count(*) into n from deposit_requests where character_id = c.id and status = 'pending'; if n >= 3 then raise exception 'você já tem 3 depósitos esperando confirmação'; end if;
  insert into deposit_requests(character_id, package_id, gems, usdt, method, reference) values (c.id, p_package, (pk ->> 'gems')::bigint, (pk ->> 'usdt')::numeric, p_method, btrim(p_reference));
  insert into account_audit_log(user_id, action, meta) values (c.user_id, 'deposito_pedido', jsonb_build_object('package', p_package, 'method', p_method));
  return wallet_view();
end $$;
create or replace function request_usdt_withdrawal(p_gems bigint, p_network text, p_address text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; k jsonb := cfg('p2e'); fee bigint; v_usdt numeric; today bigint; tp treasury_pool; pend numeric; addr text := btrim(coalesce(p_address, ''));
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  perform 1 from wallets where character_id = c.id for update;
  if not (k ->> 'enabled')::boolean then raise exception 'saques desligados'; end if;
  if p_gems < (k ->> 'withdraw_min_gems')::bigint then raise exception 'saque mínimo: % gemas', k ->> 'withdraw_min_gems'; end if;
  if c.level < (k ->> 'withdraw_min_level')::int then raise exception 'saque liberado a partir do nível %', k ->> 'withdraw_min_level'; end if;
  if c.created_at > now() - make_interval(days => (k ->> 'withdraw_min_account_days')::int) then raise exception 'conta precisa ter % dias pra sacar', k ->> 'withdraw_min_account_days'; end if;
  if p_network not in ('polygon','bep20','trc20') then raise exception 'rede inválida'; end if;
  if p_network in ('polygon','bep20') and addr !~ '^0x[0-9a-fA-F]{40}$' then raise exception 'endereço inválido pra %: começa com 0x e tem 42 caracteres', p_network; end if;
  if p_network = 'trc20' and addr !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$' then raise exception 'endereço TRC-20 inválido: começa com T e tem 34 caracteres'; end if;
  select coalesce(sum(gems), 0) into today from withdrawal_requests where character_id = c.id and status <> 'rejected' and created_at > now() - interval '24 hours';
  if today + p_gems > (k ->> 'withdraw_daily_max_gems')::bigint then raise exception 'limite diário: % gemas (já pediu %)', k ->> 'withdraw_daily_max_gems', today; end if;
  if p_gems > withdrawable_gems(c.id) then raise exception 'só dá pra sacar gemas recebidas de outros jogadores: você pode sacar %', withdrawable_gems(c.id); end if;
  fee := ceil(p_gems * (k ->> 'withdraw_fee_pct')::numeric / 100.0); v_usdt := round((p_gems - fee)::numeric / (k ->> 'gems_per_usdt')::numeric, 2);
  select * into tp from treasury_pool where id = 1 for update; select coalesce(sum(w2.usdt), 0) into pend from withdrawal_requests w2 where w2.status in ('pending','approved');
  if tp.usdt_balance - pend < v_usdt then raise exception 'o fundo de lastro não cobre esse saque agora: tente um valor menor'; end if;
  perform add_gems(c.id, -p_gems, 'saque_custodia', null);
  insert into withdrawal_requests(character_id, gems, fee_gems, usdt, network, address) values (c.id, p_gems, fee, v_usdt, p_network, addr);
  insert into account_audit_log(user_id, action, meta) values (c.user_id, 'saque_pedido', jsonb_build_object('gems', p_gems, 'usdt', v_usdt, 'network', p_network));
  return wallet_view();
end $$;
-- painel do dono
create or replace function admin_p2e_view() returns jsonb language plpgsql security definer set search_path = public stable as $$
begin
  if not is_admin() then raise exception 'só administrador'; end if;
  return jsonb_build_object('treasury', (select to_jsonb(t) from treasury_pool t where id = 1),
    'deposits', (select coalesce(jsonb_agg(to_jsonb(d) || jsonb_build_object('name', ch.name) order by d.created_at), '[]') from deposit_requests d join characters ch on ch.id = d.character_id where d.status = 'pending'),
    'withdrawals', (select coalesce(jsonb_agg(to_jsonb(w) || jsonb_build_object('name', ch.name) order by w.created_at), '[]') from withdrawal_requests w join characters ch on ch.id = w.character_id where w.status in ('pending','approved')),
    'ledger', (select coalesce(jsonb_agg(to_jsonb(l) order by l.id desc), '[]') from (select * from treasury_ledger order by id desc limit 30) l));
end $$;
create or replace function admin_deposit(p_id uuid, p_action text, p_note text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare d deposit_requests; k jsonb := cfg('p2e');
begin
  if not is_admin() then raise exception 'só administrador'; end if;
  select * into d from deposit_requests where id = p_id and status = 'pending' for update; if d.id is null then raise exception 'depósito não está pendente'; end if;
  if p_action = 'confirmar' then
    perform add_gems(d.character_id, d.gems, 'compra_gemas', d.id::text);
    update treasury_pool set usdt_balance = usdt_balance + round(d.usdt * (k ->> 'treasury_share')::numeric, 2), platform_revenue = platform_revenue + round(d.usdt * (k ->> 'platform_share')::numeric, 2), gems_issued = gems_issued + d.gems, updated_at = now() where id = 1;
    insert into treasury_ledger(kind, usdt, gems, ref) values ('deposito', d.usdt, d.gems, d.id::text);
    update deposit_requests set status = 'confirmed', admin_note = p_note, decided_at = now() where id = d.id;
  elsif p_action = 'rejeitar' then update deposit_requests set status = 'rejected', admin_note = p_note, decided_at = now() where id = d.id;
  else raise exception 'ação inválida'; end if;
  insert into account_audit_log(user_id, action, meta) values (auth.uid(), 'admin_deposito', jsonb_build_object('id', d.id, 'acao', p_action));
  return admin_p2e_view();
end $$;
create or replace function admin_withdrawal(p_id uuid, p_action text, p_tx_hash text default null, p_note text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare w withdrawal_requests;
begin
  if not is_admin() then raise exception 'só administrador'; end if;
  select * into w from withdrawal_requests where id = p_id and status in ('pending','approved') for update; if w.id is null then raise exception 'saque não está aberto'; end if;
  if p_action = 'aprovar' then update withdrawal_requests set status = 'approved', admin_note = p_note, decided_at = now() where id = w.id;
  elsif p_action = 'pagar' then
    if length(btrim(coalesce(p_tx_hash, ''))) < 10 then raise exception 'informe o hash da transação'; end if;
    update treasury_pool set usdt_balance = usdt_balance - w.usdt, gems_burned = gems_burned + w.gems, updated_at = now() where id = 1;
    insert into treasury_ledger(kind, usdt, gems, ref) values ('saque_pago', -w.usdt, w.gems, w.id::text);
    update withdrawal_requests set status = 'paid', tx_hash = btrim(p_tx_hash), admin_note = p_note, decided_at = now() where id = w.id;
  elsif p_action = 'rejeitar' then
    perform add_gems(w.character_id, w.gems, 'saque_devolvido', w.id::text);
    update withdrawal_requests set status = 'rejected', admin_note = p_note, decided_at = now() where id = w.id;
  else raise exception 'ação inválida'; end if;
  insert into account_audit_log(user_id, action, meta) values (auth.uid(), 'admin_saque', jsonb_build_object('id', w.id, 'acao', p_action));
  return admin_p2e_view();
end $$;

-- =====================================================================================
-- CLÃS 2.0: COFRE, IMPOSTO, CONSTRUÇÕES E FORTE CINZENTO
-- =====================================================================================
create or replace function clan_vault_action(p_action text, p_args jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; cl uuid; role text; a jsonb := coalesce(p_args, '{}'); g bigint; gm bigint; b text; lvl int; k jsonb := cfg('clan_buildings') -> 'cost'; need jsonb; key text; val int; have int; s record; left_ int; fo uuid;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select m.clan_id, m.role into cl, role from clan_members m where m.character_id = c.id;
  if cl is null then raise exception 'você não está num clã'; end if;
  insert into clan_vault(clan_id) values (cl) on conflict do nothing;
  perform fort_decay();
  if p_action = 'depositar' then
    g := coalesce((a ->> 'gold')::bigint, 0); gm := coalesce((a ->> 'gems')::bigint, 0);
    if g < 0 or gm < 0 then raise exception 'valor inválido'; end if;
    if g > 0 then perform add_gold(c.id, -g, 'cofre_cla', cl::text); update clan_vault set gold = gold + g where clan_id = cl; insert into clan_vault_logs(clan_id, character_id, name, action, currency, amount) values (cl, c.id, c.name, 'deposito', 'gold', g); end if;
    if gm > 0 then perform add_gems(c.id, -gm, 'cofre_cla', cl::text); update clan_vault set gems = gems + gm where clan_id = cl; insert into clan_vault_logs(clan_id, character_id, name, action, currency, amount) values (cl, c.id, c.name, 'deposito', 'gems', gm); end if;
    if a ? 't' then perform stack_take(c.id, a ->> 't', (a ->> 'purity')::int, (a ->> 'qty')::int);
      insert into clan_vault_stacks(clan_id, template_id, purity, qty) values (cl, a ->> 't', (a ->> 'purity')::int, (a ->> 'qty')::int) on conflict (clan_id, template_id, purity) do update set qty = clan_vault_stacks.qty + excluded.qty;
      insert into clan_vault_logs(clan_id, character_id, name, action, template_id, purity, qty) values (cl, c.id, c.name, 'deposito', a ->> 't', (a ->> 'purity')::int, (a ->> 'qty')::int); end if;
  elsif p_action = 'sacar' then
    if role = 'membro' then raise exception 'só líder e oficiais sacam do cofre'; end if;
    g := coalesce((a ->> 'gold')::bigint, 0); gm := coalesce((a ->> 'gems')::bigint, 0);
    if g < 0 or gm < 0 then raise exception 'valor inválido'; end if;
    if g > 0 then update clan_vault set gold = gold - g where clan_id = cl and gold >= g; if not found then raise exception 'cofre sem gold suficiente'; end if; perform add_gold(c.id, g, 'cofre_cla_saque', cl::text); insert into clan_vault_logs(clan_id, character_id, name, action, currency, amount) values (cl, c.id, c.name, 'saque', 'gold', g); end if;
    if gm > 0 then update clan_vault set gems = gems - gm where clan_id = cl and gems >= gm; if not found then raise exception 'cofre sem gemas suficientes'; end if; perform add_gems(c.id, gm, 'cofre_cla_saque', cl::text); insert into clan_vault_logs(clan_id, character_id, name, action, currency, amount) values (cl, c.id, c.name, 'saque', 'gems', gm); end if;
    if a ? 't' then
      update clan_vault_stacks set qty = qty - (a ->> 'qty')::int where clan_id = cl and template_id = a ->> 't' and purity = (a ->> 'purity')::int and qty >= (a ->> 'qty')::int; if not found then raise exception 'cofre sem esse material'; end if;
      delete from clan_vault_stacks where clan_id = cl and qty <= 0; perform stack_add(c.id, a ->> 't', (a ->> 'purity')::int, (a ->> 'qty')::int);
      insert into clan_vault_logs(clan_id, character_id, name, action, template_id, purity, qty) values (cl, c.id, c.name, 'saque', a ->> 't', (a ->> 'purity')::int, (a ->> 'qty')::int); end if;
  elsif p_action = 'imposto' then
    if role <> 'lider' then raise exception 'só o líder define o imposto'; end if;
    if (a ->> 'pct')::int not between 0 and cfg('clan_tax_max')::text::int then raise exception 'imposto de 0 a % por cento', cfg('clan_tax_max')::text; end if;
    update clans set tax_pct = (a ->> 'pct')::int where id = cl; insert into clan_vault_logs(clan_id, character_id, name, action, amount) values (cl, c.id, c.name, 'imposto_definido', (a ->> 'pct')::int);
  elsif p_action = 'construir' then
    if role = 'membro' then raise exception 'só líder e oficiais constroem'; end if;
    b := a ->> 'building'; if b not in ('forja','mina','quartel','cambio') then raise exception 'construção inválida'; end if;
    insert into clan_buildings(clan_id, building) values (cl, b) on conflict do nothing;
    select level + 1 into lvl from clan_buildings where clan_id = cl and building = b for update;
    if lvl > (cfg('clan_buildings') ->> 'max_level')::int then raise exception 'já está no nível máximo'; end if;
    need := jsonb_build_object('tabua_comum', (k ->> 'tabua_comum')::int * lvl, 'pedra', (k ->> 'pedra')::int * lvl, 'barra_ferro', (k ->> 'barra_ferro')::int * lvl);
    if lvl >= (k ->> 'diamante_bruto_from')::int then need := need || jsonb_build_object('diamante_bruto', lvl - (k ->> 'diamante_bruto_from')::int + 1); end if;
    g := round((k ->> 'gold_base')::numeric * power(lvl, (k ->> 'gold_pow')::numeric));
    update clan_vault set gold = gold - g where clan_id = cl and gold >= g; if not found then raise exception 'o cofre precisa de % gold', g; end if;
    for key, val in select x.key, x.value::int from jsonb_each_text(need) x loop
      select coalesce(sum(qty), 0) into have from clan_vault_stacks where clan_id = cl and template_id = key;
      if have < val then raise exception 'o cofre precisa de % × % (tem %)', val, (select name from item_templates where id = key), have; end if;
      left_ := val;
      for s in select * from clan_vault_stacks where clan_id = cl and template_id = key order by purity for update loop
        exit when left_ <= 0; update clan_vault_stacks set qty = qty - least(left_, s.qty) where clan_id = cl and template_id = key and purity = s.purity; left_ := left_ - least(left_, s.qty);
      end loop;
    end loop;
    delete from clan_vault_stacks where clan_id = cl and qty <= 0;
    update clan_buildings set level = lvl where clan_id = cl and building = b;
    insert into clan_vault_logs(clan_id, character_id, name, action, currency, amount, template_id) values (cl, c.id, c.name, 'construcao', 'gold', g, b || ':' || lvl);
  elsif p_action = 'suprimentos' then
    -- entrega ao Comandante do Forte: sai do jogador, vira influência do clã
    need := cfg('fort') -> 'supply';
    perform add_gold(c.id, -(need ->> 'gold')::bigint, 'suprimentos_forte', cl::text);
    for key, val in select x.key, x.value::int from jsonb_each_text(need - 'gold') x loop
      left_ := val;
      for s in select * from inventory_stacks where character_id = c.id and template_id = key order by purity for update loop
        exit when left_ <= 0; perform stack_take(c.id, key, s.purity, least(left_, s.qty)); left_ := left_ - least(left_, s.qty);
      end loop;
      if left_ > 0 then raise exception 'faltam % × %', left_, (select name from item_templates where id = key); end if;
    end loop;
    insert into fort_influence(clan_id, points) values (cl, (cfg('fort') ->> 'supply_points')::numeric) on conflict (clan_id) do update set points = fort_influence.points + excluded.points, updated_at = now();
    insert into clan_vault_logs(clan_id, character_id, name, action, amount) values (cl, c.id, c.name, 'suprimentos_forte', (cfg('fort') ->> 'supply_points')::int);
  elsif p_action <> 'ver' then raise exception 'ação inválida'; end if;
  fo := fort_owner();
  return jsonb_build_object('vault', (select to_jsonb(v) from clan_vault v where clan_id = cl), 'stacks', (select coalesce(jsonb_agg(jsonb_build_object('t', template_id, 'purity', purity, 'qty', qty) order by template_id), '[]') from clan_vault_stacks where clan_id = cl),
    'logs', (select coalesce(jsonb_agg(to_jsonb(l) order by l.id desc), '[]') from (select * from clan_vault_logs where clan_id = cl order by id desc limit 30) l),
    'buildings', (select coalesce(jsonb_object_agg(building, level), '{}') from clan_buildings where clan_id = cl), 'tax_pct', (select tax_pct from clans where id = cl), 'role', role,
    'fort', jsonb_build_object('owner', (select name from clans where id = fo), 'owner_tag', (select tag from clans where id = fo), 'mine', fo = cl, 'ranking', (select coalesce(jsonb_agg(jsonb_build_object('clan', cl2.name, 'tag', cl2.tag, 'points', round(f.points)) order by f.points desc), '[]') from fort_influence f join clans cl2 on cl2.id = f.clan_id where f.points > 0)),
    'config', jsonb_build_object('buildings', cfg('clan_buildings'), 'fort', cfg('fort'), 'tax_max', cfg('clan_tax_max')), 'state', get_state());
end $$;
-- estado, chat por mundo
create or replace function get_state() returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare c characters; out jsonb;
begin
  select * into c from characters where user_id = auth.uid();
  if c.id is null then return jsonb_build_object('character', null); end if;
  select jsonb_build_object(
    'character', (select to_jsonb(c) - 'user_id') || jsonb_build_object('hp_max', hp_max(c), 'mana_max', mana_max(c), 'atk', round(atk_of(c)), 'def', round(def_of(c)), 'power', round(power_of(c)), 'exp_next', exp_for(c.level + 1), 'exp_cur', exp_for(c.level)),
    'gold', (select gold from wallets where character_id = c.id),
    'gems', (select gems from wallets where character_id = c.id),
    'stats', stats_of(c), 'points_free', points_total(c) - points_spent(c),
    'class', (select to_jsonb(cl) from classes cl where cl.id = coalesce(c.class_id, 'aventureiro')), 'spec', (select to_jsonb(sp) from class_specializations sp where sp.id = c.spec_id),
    'skills_on', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind, 'req', s.req_level, 'on', s.req_level <= c.level, 'effect', s.effect, 'description', s.description) order by s.req_level), '[]') from skills s where (s.class_id = c.class_id and s.spec_id is null) or s.spec_id = c.spec_id),
    'professions', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'category', p.category, 'level', coalesce(cp.level, 1), 'exp', coalesce(cp.exp, 0), 'cur', prof_exp_for(coalesce(cp.level, 1)), 'next', prof_exp_for(coalesce(cp.level, 1) + 1), 'tier', (select t ->> 1 from jsonb_array_elements(cfg('prof') -> 'tiers') t where (t ->> 0)::int <= coalesce(cp.level, 1) order by (t ->> 0)::int desc limit 1)) order by p.sort), '[]') from professions p left join character_professions cp on cp.profession_id = p.id and cp.character_id = c.id),
    'stacks', (select coalesce(jsonb_agg(jsonb_build_object('t', s.template_id, 'purity', s.purity, 'qty', s.qty, 'band', purity_band(s.purity), 'cat', t.category, 'rarity', t.base_rarity, 'weight', t.weight, 'sell', t.sell) order by t.category, t.base_rarity desc, s.template_id, s.purity desc), '[]') from inventory_stacks s join item_templates t on t.id = s.template_id where s.character_id = c.id),
    'carry', jsonb_build_object('used', round(carry_weight(c.id), 1), 'cap', (stats_of(c) ->> 'carry')::numeric),
    'gather_job', (select to_jsonb(g) from gather_jobs g where g.character_id = c.id and g.status = 'ativo' limit 1),
    'craft_jobs', (select coalesce(jsonb_agg(to_jsonb(j) - 'consumed' order by j.started_at), '[]') from craft_jobs j where j.character_id = c.id and j.status = 'ativo'),
    'clan', (select jsonb_build_object('id', cl.id, 'name', cl.name, 'tag', cl.tag, 'role', m.role, 'description', cl.description, 'members', (select jsonb_agg(jsonb_build_object('name', ch.name, 'level', ch.level, 'vocation', ch.vocation, 'role', mm.role, 'online', ch.last_seen_at > now() - interval '60 seconds') order by mm.role, ch.level desc) from clan_members mm join characters ch on ch.id = mm.character_id where mm.clan_id = cl.id), 'requests', (select coalesce(jsonb_agg(jsonb_build_object('name', ch.name, 'level', ch.level)), '[]') from clan_requests rq join characters ch on ch.id = rq.character_id where rq.clan_id = cl.id)) from clan_members m join clans cl on cl.id = m.clan_id where m.character_id = c.id),
    'quests', (select coalesce(jsonb_agg(jsonb_build_object('id', q.quest_id, 'status', q.status, 'progress', q.progress)), '[]') from quest_progress q where q.character_id = c.id),
    'clan_invites', (select coalesce(jsonb_agg(jsonb_build_object('clan_id', cl.id, 'name', cl.name, 'tag', cl.tag, 'by', ib.name, 'members', (select count(*) from clan_members m where m.clan_id = cl.id), 'created_at', ci.created_at) order by ci.created_at desc), '[]') from clan_invites ci join clans cl on cl.id = ci.clan_id left join characters ib on ib.id = ci.invited_by where ci.character_id = c.id),
    'clan_sent', (select coalesce(jsonb_agg(jsonb_build_object('name', ch.name, 'level', ch.level)), '[]') from clan_invites ci join characters ch on ch.id = ci.character_id where ci.clan_id = (select clan_id from clan_members where character_id = c.id)),
    'trades', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'from', f.name, 'to', tt.name, 'mine', t.from_char = c.id, 'mode', t.mode, 'version', t.version, 'accepted_a', t.accepted_a, 'accepted_b', t.accepted_b, 'updated_at', t.updated_at,
      'offer_gold', t.offer_gold, 'offer_gems', t.offer_gems, 'want_gold', t.want_gold, 'want_gems', t.want_gems, 'from_stacks', t.from_stacks, 'to_stacks', t.to_stacks, 'to_gold', t.to_gold, 'to_gems', t.to_gems,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'template', i.template_id, 'rarity', i.rarity, 'roll', i.roll)), '[]') from items i where i.id = any(t.offer_items)),
      'to_items_list', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'template', i.template_id, 'rarity', i.rarity, 'roll', i.roll)), '[]') from items i where i.id = any(t.to_items)), 'created_at', t.created_at) order by t.created_at desc), '[]') from trades t join characters f on f.id = t.from_char join characters tt on tt.id = t.to_char where t.status = 'aberta' and (t.from_char = c.id or t.to_char = c.id)),
    'dungeon', (select to_jsonb(d) from dungeon_runs d where d.character_id = c.id order by d.started_at desc limit 1),
    'inventory', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'template', i.template_id, 'rarity', i.rarity, 'roll', i.roll, 'container', inv.container, 'slot', inv.slot, 'value', item_value(i)) order by inv.container, inv.idx), '[]') from inventory inv join items i on i.id = inv.item_id where inv.character_id = c.id),
    'session', (select to_jsonb(s) from hunt_sessions s where s.character_id = c.id and s.status = 'ativa' limit 1),
    'reports', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id desc), '[]') from (select * from session_reports where character_id = c.id and seen = false order by id desc limit 5) r),
    'hunt_state', (select coalesce(jsonb_object_agg(hunt_id, jsonb_build_object('population', round(population), 'state', state)), '{}') from hunt_state),
    'presence', (select coalesce(jsonb_object_agg(hunt_id, n), '{}') from (select s.hunt_id, count(*) n from hunt_sessions s join characters pc on pc.id = s.character_id where s.status = 'ativa' and pc.last_seen_at > now() - interval '60 seconds' group by s.hunt_id) p),
    'occupants', (select coalesce(jsonb_agg(jsonb_build_object('hunt_id', s.hunt_id, 'type', 'char', 'id', pc.id, 'name', pc.name, 'kingdom', pc.kingdom, 'level', pc.level, 'vocation', pc.vocation)), '[]') from hunt_sessions s join characters pc on pc.id = s.character_id where s.status = 'ativa' and pc.last_seen_at > now() - interval '60 seconds'),
    'online', (select count(*) from characters where last_seen_at > now() - interval '60 seconds'),
    'ranking', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'kingdom', kingdom, 'vocation', vocation, 'level', level) order by level desc, exp desc), '[]') from (select * from characters order by level desc, exp desc limit 50) x),
    'influence', (select coalesce(jsonb_agg(jsonb_build_object('hunt_id', t.hunt_id, 'type', t.actor_type, 'id', t.actor_id, 'kingdom', t.kingdom, 'influence', round(t.influence))), '[]') from territory_influence t where t.influence > 1),
    'events', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from world_events e where e.state = 'ativo' and e.ends_at > now()),
    'median_level', (select coalesce(percentile_cont(0.5) within group (order by level), 1) from characters where last_seen_at > now() - interval '7 days'),
    'world', (select to_jsonb(w) from worlds w where w.id = c.world_id),
    'usdt_equiv', round((select gems from wallets where character_id = c.id)::numeric / cfgn('p2e','gems_per_usdt'), 2),
    'clan_extra', (select jsonb_build_object('tax_pct', cl.tax_pct, 'buildings', (select coalesce(jsonb_object_agg(building, level), '{}') from clan_buildings b where b.clan_id = cl.id)) from clan_members m join clans cl on cl.id = m.clan_id where m.character_id = c.id),
    'fort_owner', (select jsonb_build_object('name', name, 'tag', tag) from clans where id = fort_owner()),
    'market_news', (select count(*) from market_transactions where (seller_id = c.id or buyer_id = c.id) and created_at > c.market_seen_at and kind in ('listing','buy_order') and not (buyer_id = c.id and kind = 'listing')),
    'admin', is_admin(),
    'server_time', now()
  ) into out;
  return out;
end $$;

create or replace function send_chat(p_channel text, p_body text) returns void language plpgsql security definer set search_path = public as $$
declare c characters; last timestamptz; tag text; cl uuid; b text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
begin
  select * into c from characters where user_id = auth.uid(); if c.id is null then raise exception 'sem personagem'; end if;
  if length(b) < 1 or length(b) > 240 then raise exception 'mensagem de 1 a 240 caracteres'; end if;
  select max(created_at) into last from chat_messages where character_id = c.id; if last > now() - interval '1.5 seconds' then raise exception 'devagar: uma mensagem a cada 1,5 s'; end if;
  select m.clan_id, cl2.tag into cl, tag from clan_members m join clans cl2 on cl2.id = m.clan_id where m.character_id = c.id;
  if p_channel = 'cla' then if cl is null then raise exception 'você não está num clã'; end if; p_channel := 'cla:' || cl::text;
  elsif p_channel = 'mundo' then p_channel := 'mundo:' || c.world_id;
  elsif p_channel not in ('global','comercio') then raise exception 'canal inválido'; end if;
  insert into chat_messages(channel, character_id, name, kingdom, clan_tag, body) values (p_channel, c.id, c.name, c.kingdom, tag, b);
end $$;

create or replace function get_chat(p_channel text, p_after bigint default 0) returns jsonb language plpgsql security definer set search_path = public stable as $$
declare c characters; ch text := p_channel; cl uuid;
begin
  select * into c from characters where user_id = auth.uid(); if c.id is null then return '[]'; end if;
  if p_channel = 'cla' then select clan_id into cl from clan_members where character_id = c.id; if cl is null then return '[]'; end if; ch := 'cla:' || cl::text; end if;
  if p_channel = 'mundo' then ch := 'mundo:' || c.world_id; end if;
  return (select coalesce(jsonb_agg(to_jsonb(x) - 'character_id' order by x.id), '[]') from (select * from chat_messages where channel = ch and id > p_after order by id desc limit 60) x);
end $$;


-- permissões: jogador chama só as funções de jogador; administração confere is_admin() dentro
do $$ declare f text; begin
  foreach f in array array['travel_world(int)','worlds_view()','world_boss_action(text,text)','list_stack(text,int,int,bigint,text)','create_buy_order(text,int,bigint,text,int,int)','fulfill_buy_order(uuid,int,int,uuid)','cancel_buy_order(uuid)','market_view2()','market_history(text)','market_seen()',
    'trade_open(text)','trade_set(uuid,uuid[],jsonb,bigint,bigint)','trade_confirm(uuid,int)','trade_cancel(uuid)','wallet_view()','create_deposit(text,text,text)','request_usdt_withdrawal(bigint,text,text)','admin_p2e_view()','admin_deposit(uuid,text,text)','admin_withdrawal(uuid,text,text,text)','clan_vault_action(text,jsonb)','is_admin()'] loop
    execute format('revoke all on function %s from public, anon', f); execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['trade_take(uuid,uuid[],jsonb,bigint,bigint,text)','trade_release(uuid,uuid[],jsonb,bigint,bigint,text)','collect_fee(bigint,text,text)','pay(uuid,text,bigint,text,text)','npc_budget_use(uuid,bigint)','npc_budget_left(uuid)','forge_build(text,jsonb,numeric,int,text,numeric,uuid)','fort_decay()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
-- =====================================================================================
-- VENDA AO NPC: preço regional do mundo + caixa que renova a cada 6 h
-- =====================================================================================
create or replace function sell_stack(p_tpl text, p_purity int, p_qty int) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; t item_templates; v bigint; left_ bigint;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into t from item_templates where id = p_tpl; if t.id is null or not t.stackable then raise exception 'item inválido'; end if;
  if t.category = 'artefato' then raise exception 'artefatos não se vendem pro NPC'; end if;
  if p_qty < 1 then raise exception 'quantidade inválida'; end if;
  v := floor(t.sell * p_qty * (0.6 + p_purity / 100.0 * 0.6) * price_mult(c.world_id, t) * (1 + least(0.15, prof_level(c.id, 'comercio') * 0.0015)));
  left_ := npc_budget_left(c.id);
  if v > left_ then raise exception 'o NPC só tem % gold em caixa agora (renova a cada % h). Venda menos ou use o Market.', left_, cfg('npc_budget') ->> 'regen_h'; end if;
  perform stack_take(c.id, p_tpl, p_purity, p_qty);
  perform add_gold(c.id, v, 'venda_npc_material', p_tpl); perform npc_budget_use(c.id, v);
  perform prof_gain(c.id, 'comercio', greatest(1, v / 50));
  return jsonb_build_object('gold', v, 'budget_left', left_ - v, 'state', get_state());
end $$;
create or replace function sell_npc(p_item uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; it items; v bigint; left_ bigint;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select i.* into it from items i join inventory inv on inv.item_id = i.id where i.id = p_item and inv.character_id = c.id and inv.container in ('bag','protected');
  if it.id is null then raise exception 'item não está na sua mochila'; end if;
  v := item_value(it); left_ := npc_budget_left(c.id);
  if v > left_ then raise exception 'o NPC só tem % gold em caixa agora (renova a cada % h). Use o Market.', left_, cfg('npc_budget') ->> 'regen_h'; end if;
  delete from inventory where item_id = p_item; delete from items where id = p_item;
  perform add_gold(c.id, v, 'venda_npc', p_item::text); perform npc_budget_use(c.id, v);
  return get_state();
end $$;
create or replace function npc_budget_view() returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; b npc_budget; k jsonb := cfg('npc_budget'); left_ bigint;
begin
  select * into c from characters where user_id = auth.uid(); if c.id is null then raise exception 'sem personagem'; end if;
  left_ := npc_budget_left(c.id); select * into b from npc_budget where character_id = c.id and world_id = c.world_id;
  return jsonb_build_object('left', left_, 'cap', (k ->> 'base')::bigint + c.level * (k ->> 'per_level')::bigint, 'renews_at', b.window_start + make_interval(hours => (k ->> 'regen_h')::int),
    'prices', (select coalesce(jsonb_object_agg(rp.category, rp.mult), '{}') from regional_prices rp where rp.realm_id = any(coalesce((select realms from worlds where id = c.world_id), '{eldoria}'))));
end $$;
revoke all on function npc_budget_view() from public, anon; grant execute on function npc_budget_view() to authenticated;
