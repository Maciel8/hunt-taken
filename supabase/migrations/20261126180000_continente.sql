-- Continente 10.000 × 10.000: cidades, anéis de PvP, posição, PvP resolvido no servidor, banco de gold,
-- bônus de anel na caça, economia regional e especialidades das cidades. Só acrescenta (nada apagado).
-- Gerado por scripts a partir de assets/world-net.json (mesma geometria do cliente).

create table if not exists cities (id text primary key, name text not null, x int not null, y int not null, heart boolean not null default false,
  r jsonb not null, ph jsonb not null, spec text, bonus jsonb not null default '{}', sort int not null default 0);
create table if not exists city_prices (city_id text not null references cities(id), match text not null, mult numeric not null, label text, primary key (city_id, match));
create table if not exists city_influence (city_id text not null references cities(id), clan_id uuid not null references clans(id) on delete cascade, points numeric not null default 0,
  updated_at timestamptz not null default now(), primary key (city_id, clan_id));
create table if not exists pvp_log (id bigserial primary key, at timestamptz not null default now(), attacker uuid, winner uuid, loser uuid, city_id text, ring int,
  gold bigint not null default 0, item_tpl text, item_id uuid, x int, y int, rewarded boolean not null default true);
alter table cities enable row level security; alter table city_prices enable row level security; alter table city_influence enable row level security; alter table pvp_log enable row level security;
drop policy if exists cities_read on cities; create policy cities_read on cities for select using (true);
drop policy if exists city_prices_read on city_prices; create policy city_prices_read on city_prices for select using (true);
drop policy if exists city_influence_read on city_influence; create policy city_influence_read on city_influence for select using (true);
drop policy if exists pvp_log_read on pvp_log; create policy pvp_log_read on pvp_log for select using (winner in (select id from characters where user_id = auth.uid()) or loser in (select id from characters where user_id = auth.uid()));

alter table characters add column if not exists pvp_mode boolean not null default false;
alter table characters add column if not exists pvp_on_at timestamptz;
alter table characters add column if not exists combat_at timestamptz;
alter table characters add column if not exists pos_at timestamptz;
alter table characters add column if not exists city_id text;
alter table characters add column if not exists ring int not null default 1;
alter table wallets add column if not exists banked bigint not null default 0;
do $$ begin alter table wallets add constraint wallets_banked_ok check (banked >= 0); exception when duplicate_object then null; end $$;
alter table hunts add column if not exists city_id text;
alter table hunts add column if not exists ring int;

insert into game_config(key, value) values ('rings', '{"2": {"exp": 0.30, "drop": 0.25}, "3": {"exp": 0.80, "drop": 0.60}, "pvp_on": {"exp": 0.20, "loot": 0.15},
  "pvp_off_s": 60, "gold_loss": {"2": 0.10, "3": 0.20, "4": 0.10}, "pvp_range": 10, "pvp_cd_s": 15, "same_pair_min": 10, "max_speed": 9, "travel_cost": 200,
  "influence_kill": 10, "influence_hunt": 0.02, "fee_share": 0.20, "city_tax": 0.05, "fresh_s": 600}')
  on conflict (key) do nothing;

insert into cities(id, name, x, y, heart, r, ph, spec, bonus, sort) values
  ('arken', 'Vila de Arken', 52, 40, true, '[1,220,480]'::jsonb, '[[5.430441,4.229092,5.847685],[4.010259,0.829522,5.579172],[4.094571,6.021303,1.990315]]'::jsonb, 'Hub geral e Mercado Central', '{}'::jsonb, 0),
  ('valen', 'Porto de Valen', 3770, 250, false, '[90,230,460]'::jsonb, '[[4.721318,1.131343,2.420927],[2.990537,4.554601,3.617239],[3.578054,2.396867,1.460125]]'::jsonb, '+35% em peixes, couros e seda · porto para outros mundos', '{"porto":true}'::jsonb, 1),
  ('khazad', 'Forja de Khazad', 1250, -2450, false, '[90,230,460]'::jsonb, '[[3.814224,4.388208,5.23378],[2.443308,0.887236,5.694393],[1.794697,6.093415,0.97804]]'::jsonb, '+30% em minérios e barras · −20% em refino e conserto', '{"refino":0.8,"conserto":0.8}'::jsonb, 2),
  ('solkar', 'Oásis de Solkar', 100, 2850, false, '[90,230,460]'::jsonb, '[[2.306062,2.026699,0.913546],[2.669884,4.145662,6.224926],[3.472129,5.639489,1.252489]]'::jsonb, '+40% em gemas · lapidação e joalheria ganham pureza', '{"pureza":6}'::jsonb, 3),
  ('sylvana', 'Bosques de Sylvana', -3050, -700, false, '[90,230,460]'::jsonb, '[[1.404431,1.846633,3.136181],[5.421269,3.979214,3.052259],[0.132272,4.841477,3.673827]]'::jsonb, '+35% em toras e ervas · poções 25% mais baratas', '{"pocao":0.75}'::jsonb, 4),
  ('nocthar', 'Cidadela de Nocthar', -3150, -3150, false, '[90,230,460]'::jsonb, '[[3.266311,2.098627,0.89728],[4.208369,2.237035,1.005374],[0.986807,1.619031,2.820399]]'::jsonb, '+40% em essências sombrias, cristais celestes e fragmentos primordiais · único lugar com encantamento nível V', '{"encanto_v":true}'::jsonb, 5)
on conflict (id) do update set name = excluded.name, x = excluded.x, y = excluded.y, heart = excluded.heart, r = excluded.r, ph = excluded.ph, spec = excluded.spec, bonus = excluded.bonus, sort = excluded.sort;

insert into city_prices(city_id, match, mult, label) values
  ('valen', 'peixe%', 1.35, 'Peixes'),
  ('valen', '%couro%', 1.35, 'Couros'),
  ('valen', 'pele%', 1.35, 'Peles'),
  ('valen', '%seda%', 1.35, 'Seda'),
  ('khazad', 'minerio%', 1.3, 'Minérios'),
  ('khazad', 'barra%', 1.3, 'Barras'),
  ('khazad', 'pepita%', 1.3, 'Pepitas'),
  ('solkar', '%gema%', 1.4, 'Gemas'),
  ('solkar', 'diamante%', 1.4, 'Diamantes'),
  ('solkar', 'rubi%', 1.4, 'Rubis'),
  ('solkar', 'esmeralda%', 1.4, 'Esmeraldas'),
  ('solkar', 'safira%', 1.4, 'Safiras'),
  ('solkar', 'ametista%', 1.4, 'Ametistas'),
  ('solkar', 'topazio%', 1.4, 'Topázios'),
  ('sylvana', 'tora%', 1.35, 'Toras'),
  ('sylvana', 'erva%', 1.35, 'Ervas'),
  ('sylvana', '%madeira%', 1.35, 'Madeira'),
  ('nocthar', 'essencia%', 1.4, 'Essências sombrias'),
  ('nocthar', 'cristal_celeste%', 1.4, 'Cristais celestes'),
  ('nocthar', 'fragmento_primordial%', 1.4, 'Fragmentos primordiais')
on conflict (city_id, match) do update set mult = excluded.mult, label = excluded.label;

insert into world_regions(id, realm_id, name, tier, level_min, level_max, biome, description) values
  ('valen', 'eldoria', 'Porto de Valen', 'segura', 1, 999, 'costa', '+35% em peixes, couros e seda · porto para outros mundos'),
  ('khazad', 'eldoria', 'Forja de Khazad', 'segura', 1, 999, 'montanha', '+30% em minérios e barras · −20% em refino e conserto'),
  ('solkar', 'eldoria', 'Oásis de Solkar', 'segura', 1, 999, 'deserto', '+40% em gemas · lapidação e joalheria ganham pureza'),
  ('sylvana', 'eldoria', 'Bosques de Sylvana', 'segura', 1, 999, 'floresta', '+35% em toras e ervas · poções 25% mais baratas'),
  ('nocthar', 'eldoria', 'Cidadela de Nocthar', 'segura', 1, 999, 'sombrio', '+40% em essências sombrias, cristais celestes e fragmentos primordiais · único lugar com encantamento nível V')
on conflict (id) do nothing;

insert into creatures(id, name, level, hp, atk, def, exp, gold_min, gold_max, drop_item, drop_chance, boss, sprite, family, category, realm_id, biome, resist, weak, abilities, behavior, description, loot_table)
  select m.id, m.name, m.lvl, (f->>'hp')::int, (f->>'atk')::int, (f->>'def')::int, (f->>'exp')::int, (f->>'gmin')::int, (f->>'gmax')::int, null, 0, false, m.sprite, m.fam, m.cat, 'eldoria', m.biome, '{}', '{}', '[]', 'agressivo', m.descr, m.loot
  from (values
    ('pirata_baia', 'Pirata da baía', 22, 'bandit', 'humano', 'comum', 'costa', 'Ronda os anéis de Porto de Valen.', 'cr_bandido'),
    ('afogado_porto', 'Afogado do porto', 30, 'drowned', 'morto_vivo', 'incomum', 'costa', 'Ronda os anéis de Porto de Valen.', 'cr_afogado'),
    ('capitao_fantasma', 'Capitão fantasma', 40, 'fallen', 'morto_vivo', 'elite', 'costa', 'Ronda os anéis de Porto de Valen.', 'cr_cavaleiro'),
    ('lobo_khazad', 'Lobo de Khazad', 50, 'wolf', 'lobo', 'comum', 'montanha', 'Ronda os anéis de Forja de Khazad.', 'cr_lobo'),
    ('minerador_maldito', 'Minerador maldito', 63, 'miner', 'morto_vivo', 'incomum', 'montanha', 'Ronda os anéis de Forja de Khazad.', 'cr_mineiro'),
    ('golem_magma', 'Golem de magma', 75, 'golem', 'golem', 'elite', 'montanha', 'Ronda os anéis de Forja de Khazad.', 'cr_golem'),
    ('saqueador_areia', 'Saqueador das areias', 40, 'bandit', 'humano', 'comum', 'deserto', 'Ronda os anéis de Oásis de Solkar.', 'cr_bandido'),
    ('escorpiao_gigante', 'Escorpião gigante', 52, 'spider', 'aracnideo', 'incomum', 'deserto', 'Ronda os anéis de Oásis de Solkar.', 'cr_aranha'),
    ('vespa_solar', 'Vespa solar', 62, 'wasp', 'inseto', 'elite', 'deserto', 'Ronda os anéis de Oásis de Solkar.', 'cr_vespa'),
    ('lobo_bosque', 'Lobo do bosque', 30, 'wolf', 'lobo', 'comum', 'floresta', 'Ronda os anéis de Bosques de Sylvana.', 'cr_lobo'),
    ('aranha_ancestral', 'Aranha ancestral', 40, 'spider', 'aracnideo', 'incomum', 'floresta', 'Ronda os anéis de Bosques de Sylvana.', 'cr_aranha'),
    ('guardiao_bosque', 'Guardião do bosque', 50, 'golem', 'planta', 'elite', 'floresta', 'Ronda os anéis de Bosques de Sylvana.', 'cr_golem'),
    ('esqueleto_nocthar', 'Esqueleto de Nocthar', 70, 'fallen', 'morto_vivo', 'comum', 'sombrio', 'Ronda os anéis de Cidadela de Nocthar.', 'cr_cavaleiro'),
    ('cavaleiro_sombrio', 'Cavaleiro sombrio', 85, 'fallen', 'morto_vivo', 'incomum', 'sombrio', 'Ronda os anéis de Cidadela de Nocthar.', 'cr_cavaleiro'),
    ('sentinela_abismo', 'Sentinela do abismo', 98, 'guardian', 'golem', 'miniboss', 'sombrio', 'Ronda os anéis de Cidadela de Nocthar.', 'cr_guardiao')
  ) m(id, name, lvl, sprite, fam, cat, biome, descr, loot), lateral creature_fit(m.lvl, m.cat) f
on conflict (id) do nothing;

insert into hunts(id, region, name, creature_id, spawns, respawn_ms, rect, door, boss_id, rare, level_min, zone, wregion, tier, city_id, ring) values
  ('valen_a1', 'valen', 'Arredores de Valen', 'pirata_baia', 7, 14000, '{"x":3788,"y":284,"w":19,"h":19}'::jsonb, '[3797,284]'::jsonb, null, 1, 18, 'protegida', 'valen', 'selvagem', 'valen', 1),
  ('valen_a2', 'valen', 'Terras disputadas de Valen', 'afogado_porto', 7, 14000, '{"x":3769,"y":96,"w":19,"h":19}'::jsonb, '[3778,96]'::jsonb, null, 1, 26, 'protegida', 'valen', 'hostil', 'valen', 2),
  ('valen_a3', 'valen', 'Zona vermelha de Valen', 'capitao_fantasma', 6, 18000, '{"x":3443,"y":346,"w":19,"h":19}'::jsonb, '[3452,346]'::jsonb, null, 2, 36, 'guerra', 'valen', 'lendaria', 'valen', 3),
  ('khazad_a1', 'khazad', 'Arredores de Khazad', 'lobo_khazad', 7, 14000, '{"x":1195,"y":-2481,"w":19,"h":19}'::jsonb, '[1204,-2481]'::jsonb, null, 1, 46, 'protegida', 'khazad', 'selvagem', 'khazad', 1),
  ('khazad_a2', 'khazad', 'Terras disputadas de Khazad', 'minerador_maldito', 7, 14000, '{"x":1369,"y":-2340,"w":19,"h":19}'::jsonb, '[1378,-2340]'::jsonb, null, 1, 59, 'protegida', 'khazad', 'hostil', 'khazad', 2),
  ('khazad_a3', 'khazad', 'Zona vermelha de Khazad', 'golem_magma', 6, 18000, '{"x":1528,"y":-2587,"w":19,"h":19}'::jsonb, '[1537,-2587]'::jsonb, null, 2, 71, 'guerra', 'khazad', 'lendaria', 'khazad', 3),
  ('solkar_a1', 'solkar', 'Arredores de Solkar', 'saqueador_areia', 7, 14000, '{"x":45,"y":2819,"w":19,"h":19}'::jsonb, '[54,2819]'::jsonb, null, 1, 36, 'protegida', 'solkar', 'selvagem', 'solkar', 1),
  ('solkar_a2', 'solkar', 'Terras disputadas de Solkar', 'escorpiao_gigante', 7, 14000, '{"x":224,"y":2899,"w":19,"h":19}'::jsonb, '[233,2899]'::jsonb, null, 1, 48, 'protegida', 'solkar', 'hostil', 'solkar', 2),
  ('solkar_a3', 'solkar', 'Zona vermelha de Solkar', 'vespa_solar', 6, 18000, '{"x":378,"y":2713,"w":19,"h":19}'::jsonb, '[387,2713]'::jsonb, null, 2, 58, 'guerra', 'solkar', 'lendaria', 'solkar', 3),
  ('sylvana_a1', 'sylvana', 'Arredores de Sylvana', 'lobo_bosque', 7, 14000, '{"x":-3019,"y":-741,"w":19,"h":19}'::jsonb, '[-3010,-741]'::jsonb, null, 1, 26, 'protegida', 'sylvana', 'selvagem', 'sylvana', 1),
  ('sylvana_a2', 'sylvana', 'Terras disputadas de Sylvana', 'aranha_ancestral', 7, 14000, '{"x":-3204,"y":-653,"w":19,"h":19}'::jsonb, '[-3195,-653]'::jsonb, null, 1, 36, 'protegida', 'sylvana', 'hostil', 'sylvana', 2),
  ('sylvana_a3', 'sylvana', 'Zona vermelha de Sylvana', 'guardiao_bosque', 6, 18000, '{"x":-2765,"y":-598,"w":19,"h":19}'::jsonb, '[-2756,-598]'::jsonb, null, 2, 46, 'guerra', 'sylvana', 'lendaria', 'sylvana', 3),
  ('nocthar_a1', 'nocthar', 'Arredores de Nocthar', 'esqueleto_nocthar', 7, 14000, '{"x":-3119,"y":-3191,"w":19,"h":19}'::jsonb, '[-3110,-3191]'::jsonb, null, 1, 66, 'protegida', 'nocthar', 'selvagem', 'nocthar', 1),
  ('nocthar_a2', 'nocthar', 'Terras disputadas de Nocthar', 'cavaleiro_sombrio', 7, 14000, '{"x":-3045,"y":-3068,"w":19,"h":19}'::jsonb, '[-3036,-3068]'::jsonb, null, 1, 81, 'protegida', 'nocthar', 'hostil', 'nocthar', 2),
  ('nocthar_a3', 'nocthar', 'Zona vermelha de Nocthar', 'sentinela_abismo', 6, 18000, '{"x":-2865,"y":-3048,"w":19,"h":19}'::jsonb, '[-2856,-3048]'::jsonb, null, 2, 94, 'guerra', 'nocthar', 'lendaria', 'nocthar', 3)
on conflict (id) do update set rect = excluded.rect, door = excluded.door, city_id = excluded.city_id, ring = excluded.ring;

insert into hunt_state(hunt_id) select id from hunts where city_id is not null on conflict do nothing;

-- depósitos dos anéis: copiam os parâmetros de um depósito existente do mesmo tipo; os do anel 3 são do clã que domina a cidade
insert into resource_nodes(id, name, kind, profession_id, tool, tool_tier, req_level, hardness, extract_s, capacity, respawn_s, drop_table, exp, x, y, region, owner)
  select v.id, b.name, b.kind, b.profession_id, b.tool, b.tool_tier, b.req_level, b.hardness, b.extract_s, b.capacity, b.respawn_s, b.drop_table, b.exp, v.x, v.y, v.region, v.owner
  from (values
    ('valen_rocha_1', 'rocha', 3803, 280, 'campos', null),
    ('valen_arvore_1', 'arvore', 3804, 305, 'campos', null),
    ('valen_erva_1', 'erva', 3791, 306, 'campos', null),
    ('valen_veio_ferro_2', 'veio_ferro', 3776, 119, 'campos', null),
    ('valen_veio_prata_2', 'veio_prata', 3775, 119, 'campos', null),
    ('valen_carvalho_antigo_2', 'carvalho_antigo', 3787, 116, 'campos', null),
    ('valen_veio_mitril_3', 'veio_mitril', 3463, 364, 'campos', 'city:valen'),
    ('valen_veio_profundo_3', 'veio_profundo', 3444, 344, 'campos', 'city:valen'),
    ('valen_veio_diamante_3', 'veio_diamante', 3466, 353, 'campos', 'city:valen'),
    ('khazad_rocha_1', 'rocha', 1210, -2485, 'montanhas', null),
    ('khazad_arvore_1', 'arvore', 1211, -2460, 'montanhas', null),
    ('khazad_erva_1', 'erva', 1198, -2459, 'montanhas', null),
    ('khazad_veio_ferro_2', 'veio_ferro', 1376, -2317, 'montanhas', null),
    ('khazad_veio_prata_2', 'veio_prata', 1375, -2317, 'montanhas', null),
    ('khazad_carvalho_antigo_2', 'carvalho_antigo', 1387, -2320, 'montanhas', null),
    ('khazad_veio_mitril_3', 'veio_mitril', 1548, -2569, 'montanhas', 'city:khazad'),
    ('khazad_veio_profundo_3', 'veio_profundo', 1529, -2589, 'montanhas', 'city:khazad'),
    ('khazad_veio_diamante_3', 'veio_diamante', 1551, -2580, 'montanhas', 'city:khazad'),
    ('solkar_rocha_1', 'rocha', 60, 2815, 'minas', null),
    ('solkar_arvore_1', 'arvore', 61, 2840, 'minas', null),
    ('solkar_erva_1', 'erva', 48, 2841, 'minas', null),
    ('solkar_veio_ferro_2', 'veio_ferro', 231, 2922, 'minas', null),
    ('solkar_veio_prata_2', 'veio_prata', 230, 2922, 'minas', null),
    ('solkar_carvalho_antigo_2', 'carvalho_antigo', 242, 2919, 'minas', null),
    ('solkar_veio_mitril_3', 'veio_mitril', 398, 2731, 'minas', 'city:solkar'),
    ('solkar_veio_profundo_3', 'veio_profundo', 379, 2711, 'minas', 'city:solkar'),
    ('solkar_veio_diamante_3', 'veio_diamante', 401, 2720, 'minas', 'city:solkar'),
    ('sylvana_rocha_1', 'rocha', -3004, -745, 'floresta', null),
    ('sylvana_arvore_1', 'arvore', -3003, -720, 'floresta', null),
    ('sylvana_erva_1', 'erva', -3016, -719, 'floresta', null),
    ('sylvana_veio_ferro_2', 'veio_ferro', -3197, -630, 'floresta', null),
    ('sylvana_veio_prata_2', 'veio_prata', -3198, -630, 'floresta', null),
    ('sylvana_carvalho_antigo_2', 'carvalho_antigo', -3186, -633, 'floresta', null),
    ('sylvana_veio_mitril_3', 'veio_mitril', -2745, -580, 'floresta', 'city:sylvana'),
    ('sylvana_veio_profundo_3', 'veio_profundo', -2764, -600, 'floresta', 'city:sylvana'),
    ('sylvana_veio_diamante_3', 'veio_diamante', -2742, -591, 'floresta', 'city:sylvana'),
    ('nocthar_rocha_1', 'rocha', -3104, -3195, 'ruinas', null),
    ('nocthar_arvore_1', 'arvore', -3103, -3170, 'ruinas', null),
    ('nocthar_erva_1', 'erva', -3116, -3169, 'ruinas', null),
    ('nocthar_veio_ferro_2', 'veio_ferro', -3038, -3045, 'ruinas', null),
    ('nocthar_veio_prata_2', 'veio_prata', -3039, -3045, 'ruinas', null),
    ('nocthar_carvalho_antigo_2', 'carvalho_antigo', -3027, -3048, 'ruinas', null),
    ('nocthar_veio_mitril_3', 'veio_mitril', -2845, -3030, 'ruinas', 'city:nocthar'),
    ('nocthar_veio_profundo_3', 'veio_profundo', -2864, -3050, 'ruinas', 'city:nocthar'),
    ('nocthar_veio_diamante_3', 'veio_diamante', -2842, -3041, 'ruinas', 'city:nocthar')
  ) v(id, kind, x, y, region, owner) join lateral (select * from resource_nodes r where r.kind = v.kind and r.owner is null order by r.req_level desc, r.id limit 1) b on true
on conflict (id) do nothing;


-- ---------- zona: raio irregular igual ao do cliente (js/terrain.js ringRadius/zoneAt) ----------
create or replace function ring_radius(r jsonb, ph jsonb, k int, th double precision) returns double precision language sql immutable as $$
  select (r->>(k-1))::double precision * (1 + 0.16 * sin(3 * th + (ph->(k-1)->>0)::double precision) + 0.09 * sin(5 * th + (ph->(k-1)->>1)::double precision) + 0.05 * sin(11 * th + (ph->(k-1)->>2)::double precision)) $$;
create or replace function zone_at(px int, py int) returns jsonb language plpgsql stable set search_path = public as $$
declare c cities; d double precision; th double precision; k int; rg int; best jsonb; bs double precision := 1e18; sc double precision; ccx double precision; ccy double precision;
begin
  if py >= 4816 then return jsonb_build_object('city', 'arken', 'ring', 1, 'name', 'Vila de Arken'); end if;   -- interiores
  for c in select * from cities loop
    if c.heart then d := sqrt(power(greatest(0 - px, 0, px - 300), 2) + power(greatest(0 - py, 0, py - 200), 2)); ccx := 150; ccy := 100;
    else d := sqrt(power(px - c.x, 2) + power(py - c.y, 2)); ccx := c.x; ccy := c.y; end if;
    th := atan2(py - ccy, px - ccx); rg := 4;
    for k in 1..3 loop if d < ring_radius(c.r, c.ph, k, th) then rg := k; exit; end if; end loop;
    sc := rg * 1e6 + d; if sc < bs then bs := sc; best := jsonb_build_object('city', c.id, 'ring', rg, 'name', c.name, 'd', round(d::numeric, 1)); end if;
  end loop;
  return best;
end $$;
create or replace function in_city(c characters) returns text language sql stable set search_path = public as $$
  select case when c.ring = 1 and coalesce(c.pos_at, c.updated_at) > now() - make_interval(secs => cfgn('rings','fresh_s')) then coalesce(c.city_id, 'arken') end $$;
create or replace function city_bonus(c characters, k text) returns jsonb language sql stable set search_path = public as $$
  select ci.bonus -> k from cities ci where ci.id = in_city(c) $$;
create or replace function city_sell_mult(c characters, t item_templates) returns numeric language sql stable set search_path = public as $$
  select coalesce((select max(p.mult) from city_prices p where p.city_id = in_city(c) and t.id like p.match), 1) $$;
create or replace function city_owner(p_city text) returns uuid language sql stable set search_path = public as $$
  select clan_id from city_influence where city_id = p_city and points > 0 order by points desc, updated_at limit 1 $$;
create or replace function clan_of(cid uuid) returns uuid language sql stable set search_path = public as $$ select clan_id from clan_members where character_id = cid $$;

-- ---------- posição e PvP ----------
create or replace function pvp_view(c characters) returns jsonb language plpgsql stable set search_path = public as $$
declare z jsonb := zone_at(c.x, c.y); cl uuid := clan_of(c.id); near jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'level', o.level, 'x', o.x, 'y', o.y, 'ring', o.ring, 'pvp', o.pvp_mode or o.ring = 3,
      'clan', (select tag from clans where id = clan_of(o.id)), 'ally', cl is not null and clan_of(o.id) = cl) order by o.level desc), '[]') into near
    from characters o where o.id <> c.id and o.pos_at > now() - interval '45 seconds' and abs(o.x - c.x) <= 40 and abs(o.y - c.y) <= 30 and o.world_id = c.world_id;
  return jsonb_build_object('zone', z, 'ring', c.ring, 'city', c.city_id, 'pvp', c.pvp_mode or c.ring = 3, 'forced', c.ring = 3, 'combat_at', c.combat_at,
    'off_in', greatest(0, ceil(cfgn('rings','pvp_off_s') - extract(epoch from (now() - coalesce(c.combat_at, now() - interval '1 day'))))),
    'banked', (select banked from wallets where character_id = c.id), 'near', near,
    'owner', (select jsonb_build_object('clan', cl2.name, 'tag', cl2.tag) from clans cl2 where cl2.id = city_owner(c.city_id)));
end $$;
create or replace function report_position(p_x int, p_y int) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; dt numeric; dist numeric; z jsonb; rg int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if p_x < -4900 or p_x > 5100 or p_y < -5200 or p_y > 5100 then raise exception 'fora do mapa'; end if;
  dt := extract(epoch from (now() - coalesce(c.pos_at, now() - interval '1 hour')));
  dist := sqrt(power(p_x - c.x, 2) + power(p_y - c.y, 2));
  -- anti-teleporte: velocidade máxima de caminhada (+ folga); viagens oficiais usam travel_city
  if c.pos_at is not null and dt < 600 and dist > cfgn('rings','max_speed') * dt + 14 and c.task <> 'hunt' then
    return jsonb_build_object('ok', false, 'x', c.x, 'y', c.y, 'why', 'movimento rápido demais') || pvp_view(c);
  end if;
  z := zone_at(p_x, p_y); rg := (z->>'ring')::int;
  update characters set x = p_x, y = p_y, pos_at = now(), city_id = z->>'city', ring = rg,
    pvp_mode = case when rg = 1 then false when rg = 3 then true else pvp_mode end, last_seen_at = now()
    where id = c.id returning * into c;
  return jsonb_build_object('ok', true) || pvp_view(c);
end $$;
create or replace function pvp_toggle(p_on boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; left_s numeric;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if c.ring = 1 then raise exception 'zona segura: PvP desligado aqui'; end if;
  if c.ring = 3 and not p_on then raise exception 'no anel 3 o PvP é obrigatório'; end if;
  if not p_on and c.combat_at is not null then left_s := cfgn('rings','pvp_off_s') - extract(epoch from (now() - c.combat_at));
    if left_s > 0 then raise exception 'em combate: espere % s sem lutar pra desligar', ceil(left_s); end if; end if;
  update characters set pvp_mode = p_on, pvp_on_at = case when p_on then now() else pvp_on_at end where id = c.id returning * into c;
  return pvp_view(c);
end $$;
-- duelo resolvido no servidor: chance pelo poder de cada um; o perdedor volta pra cidade mais perto,
-- perde parte do gold não depositado e 1 item fora dos espaços protegidos (Bênção evita o item)
create or replace function pvp_resolve(p_target uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare a characters; b characters; w characters; l characters; za jsonb; zb jsonb; ring int; pa numeric; pb numeric; won boolean; g bigint; lost bigint := 0; nid uuid; tpl text;
  n int; home cities; rew boolean := true; cfgr jsonb := cfg('rings'); ca uuid; cb uuid; inf numeric;
begin
  select * into a from characters where user_id = auth.uid() for update; if a.id is null then raise exception 'sem personagem'; end if;
  select * into b from characters where id = p_target for update; if b.id is null or b.id = a.id then raise exception 'alvo inválido'; end if;
  if b.world_id is distinct from a.world_id then raise exception 'o alvo está em outro mundo'; end if;
  if a.pos_at is null or a.pos_at < now() - interval '45 seconds' or b.pos_at is null or b.pos_at < now() - interval '45 seconds' then raise exception 'o alvo não está por perto'; end if;
  if sqrt(power(a.x - b.x, 2) + power(a.y - b.y, 2)) > (cfgr->>'pvp_range')::numeric then raise exception 'chegue mais perto (até % tiles)', cfgr->>'pvp_range'; end if;
  za := zone_at(a.x, a.y); zb := zone_at(b.x, b.y); ring := greatest((za->>'ring')::int, (zb->>'ring')::int);
  if (za->>'ring')::int = 1 or (zb->>'ring')::int = 1 then raise exception 'zona segura: sem PvP'; end if;
  ca := clan_of(a.id); cb := clan_of(b.id);
  if ca is not null and ca = cb then raise exception 'não dá pra atacar o próprio clã'; end if;
  if ring < 3 and not (a.pvp_mode and b.pvp_mode) then raise exception 'os dois precisam estar com PvP ligado fora do anel 3'; end if;
  if exists (select 1 from pvp_log where attacker = a.id and at > now() - make_interval(secs => (cfgr->>'pvp_cd_s')::numeric)) then raise exception 'recuperando do último duelo'; end if;
  if b.hp <= 0 then raise exception 'o alvo já caiu'; end if;
  pa := power_of(a) * (0.85 + random() * 0.3); pb := power_of(b) * (0.85 + random() * 0.3);
  won := random() < pa / greatest(1, pa + pb);
  if won then w := a; l := b; else w := b; l := a; end if;
  -- mesma dupla em pouco tempo: luta conta, mas sem prêmio (evita farm combinado)
  if exists (select 1 from pvp_log where ((winner = w.id and loser = l.id) or (winner = l.id and loser = w.id)) and rewarded and at > now() - make_interval(mins => (cfgr->>'same_pair_min')::int)) then rew := false; end if;
  if rew then
    select gold into g from wallets where character_id = l.id for update;
    lost := floor(coalesce(g, 0) * coalesce((cfgr->'gold_loss'->>ring::text)::numeric, 0.1));
    if lost > 0 then perform add_gold(l.id, -lost, 'pvp_perda', w.id::text); perform add_gold(w.id, lost, 'pvp_ganho', l.id::text); end if;
    if l.bless then update characters set bless = false where id = l.id;
    else
      select item_id into nid from inventory where character_id = l.id and container = 'bag' order by random() limit 1;
      if nid is not null then
        select template_id into tpl from items where id = nid;
        select count(*) into n from inventory where character_id = w.id and container = 'bag';
        update inventory set character_id = w.id, container = case when n < 20 then 'bag' else 'warehouse' end, idx = n, slot = null, updated_at = now() where item_id = nid;
      end if;
    end if;
  end if;
  -- perdedor volta pra cidade mais perto, com metade da vida
  select * into home from cities order by (case when heart then sqrt(power(greatest(0 - l.x, 0, l.x - 300), 2) + power(greatest(0 - l.y, 0, l.y - 200), 2)) else sqrt(power(l.x - x, 2) + power(l.y - y, 2)) end) limit 1;
  if l.task = 'hunt' then perform end_session(l.id, 'pvp'); end if;
  update characters set x = case when home.heart then 52 else home.x end, y = case when home.heart then 42 else home.y + 3 end, pos_at = now(), city_id = home.id, ring = 1,
    pvp_mode = false, combat_at = now(), deaths = deaths + 1, hp = greatest(1, floor(hp_max(l) * 0.5)) where id = l.id;
  update characters set combat_at = now(), kills = kills + 1 where id = w.id;
  -- anel 3: vitória rende influência do clã na cidade
  inf := (cfgr->>'influence_kill')::numeric;
  if ring = 3 and clan_of(w.id) is not null and rew then
    insert into city_influence(city_id, clan_id, points) values (coalesce(zb->>'city', za->>'city'), clan_of(w.id), inf)
      on conflict (city_id, clan_id) do update set points = city_influence.points + excluded.points, updated_at = now();
  end if;
  insert into pvp_log(attacker, winner, loser, city_id, ring, gold, item_tpl, item_id, x, y, rewarded) values (a.id, w.id, l.id, coalesce(zb->>'city', za->>'city'), ring, lost, tpl, nid, b.x, b.y, rew);
  insert into chat_messages(channel, character_id, name, body) select 'mundo', null, 'Sistema', format('%s venceu %s em duelo (anel %s de %s)', w.name, l.name, ring, coalesce(zb->>'name', ''))
;
  select * into a from characters where id = a.id;
  return jsonb_build_object('won', won, 'winner', w.name, 'loser', l.name, 'gold', lost, 'item', tpl, 'rewarded', rew, 'ring', ring) || pvp_view(a);
end $$;
-- viagem entre cidades: só de dentro de uma cidade, custa gold
create or replace function travel_city(p_city text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; t cities; cost bigint := cfgn('rings','travel_cost'); g bigint;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into t from cities where id = p_city; if t.id is null then raise exception 'cidade inválida'; end if;
  if in_city(c) is null then raise exception 'viagens saem de dentro de uma cidade (anel 1)'; end if;
  if in_city(c) = t.id then raise exception 'você já está em %', t.name; end if;
  if c.task = 'hunt' then raise exception 'saia da caça antes de viajar'; end if;
  select gold into g from wallets where character_id = c.id for update; if g < cost then raise exception 'a viagem custa % gold', cost; end if;
  perform add_gold(c.id, -cost, 'viagem', t.id);
  update characters set x = case when t.heart then 52 else t.x end, y = case when t.heart then 42 else t.y + 3 end, pos_at = now(), city_id = t.id, ring = 1, pvp_mode = false where id = c.id returning * into c;
  return jsonb_build_object('x', c.x, 'y', c.y, 'city', t.name, 'cost', cost) || pvp_view(c);
end $$;
-- banco: gold depositado não se perde em PvP
create or replace function bank_action(p_action text, p_amount bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; wl wallets;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if in_city(c) is null then raise exception 'o banco fica nas cidades (anel 1)'; end if;
  if p_amount is null or p_amount < 1 then raise exception 'valor inválido'; end if;
  select * into wl from wallets where character_id = c.id for update;
  if p_action = 'depositar' then if wl.gold < p_amount then raise exception 'você só tem % gold na mão', wl.gold; end if;
    perform add_gold(c.id, -p_amount, 'banco_deposito', null); update wallets set banked = banked + p_amount where character_id = c.id;
  elsif p_action = 'sacar' then if wl.banked < p_amount then raise exception 'você só tem % gold no banco', wl.banked; end if;
    update wallets set banked = banked - p_amount where character_id = c.id; perform add_gold(c.id, p_amount, 'banco_saque', null);
  else raise exception 'ação inválida'; end if;
  select * into wl from wallets where character_id = c.id;
  return jsonb_build_object('gold', wl.gold, 'banked', wl.banked);
end $$;
-- painel das cidades: dono do anel 3, influência, preços regionais, bônus
create or replace function cities_view() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', ci.id, 'name', ci.name, 'x', ci.x, 'y', ci.y, 'heart', ci.heart, 'spec', ci.spec, 'bonus', ci.bonus,
    'prices', (select coalesce(jsonb_agg(jsonb_build_object('label', p.label, 'mult', p.mult)), '[]') from city_prices p where p.city_id = ci.id),
    'owner', (select jsonb_build_object('name', cl.name, 'tag', cl.tag, 'points', round(i.points)) from city_influence i join clans cl on cl.id = i.clan_id where i.city_id = ci.id and i.clan_id = city_owner(ci.id)),
    'ranking', (select coalesce(jsonb_agg(jsonb_build_object('tag', cl.tag, 'points', round(i.points)) order by i.points desc), '[]') from (select * from city_influence where city_id = ci.id order by points desc limit 5) i join clans cl on cl.id = i.clan_id)
  ) order by ci.sort), '[]') from cities ci $$;
grant execute on function report_position(int, int), pvp_toggle(boolean), pvp_resolve(uuid), travel_city(text), bank_action(text, bigint), cities_view(), zone_at(int, int) to authenticated;

-- caça: bônus dos anéis (o resto da função é igual)
CREATE OR REPLACE FUNCTION public.simulate()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e2 drop_entries; wd worlds; st0 jsonb; el jsonb; aspd0 numeric; qb numeric; diff int; tax bigint := 0; rep_tax bigint := 0; my_clan uuid; tax_pct int := 0; fk numeric := 0; fl jsonb;
  c characters; s hunt_sessions; h hunts; m creatures; hs hunt_state; b jsonb; ev record;
  t0 timestamptz; t1 timestamptz; cap interval; chunk interval; hours numeric; eff numeric := 1;
  n_occ int; pf numeric; per_hour numeric; share numeric; atk numeric; def numeric; m_def numeric; dps numeric; ttk numeric; cap_kills numeric;
  kills int; exp_gain bigint; gold_gain bigint; mult_exp numeric := 1; mult_gold numeric := 1; ring_drop numeric := 1; rk jsonb; drop_n int; drop_ch numeric; dmg_in numeric; need_pots int; used_pots int;
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
    -- anéis do continente: anel 2 +30% exp/+25% drop, anel 3 +80%/+60%; PvP ligado no anel 2 soma +20% exp e +15% loot
    ring_drop := 1;
    if h.ring is not null then rk := cfg('rings') -> (h.ring::text);
      if rk is not null then mult_exp := mult_exp * (1 + coalesce((rk->>'exp')::numeric, 0)); mult_gold := mult_gold * (1 + coalesce((rk->>'drop')::numeric, 0)); ring_drop := 1 + coalesce((rk->>'drop')::numeric, 0); end if;
      if h.ring = 2 and c.pvp_mode then mult_exp := mult_exp * (1 + (cfg('rings')->'pvp_on'->>'exp')::numeric); mult_gold := mult_gold * (1 + (cfg('rings')->'pvp_on'->>'loot')::numeric); ring_drop := ring_drop * (1 + (cfg('rings')->'pvp_on'->>'loot')::numeric); end if;
    end if;
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
    drop_ch := coalesce(m.drop_chance, 0) * ring_drop * coalesce(h.rare, 1) * (case b->>'alvo' when 'raro' then 1.5 else 1 end) * (case b->>'objetivo' when 'materiais' then 1.3 else 1 end);
    drop_n := floor(kills * drop_ch + case when ht_rand(seed || ':dr') < (kills * drop_ch - floor(kills * drop_ch)) then 1 else 0 end);
    select count(*) into bag_n from inventory where character_id = c.id and container = 'bag';
    for i in 1..drop_n loop
      if bag_n >= 20 then rep_events := rep_events || to_jsonb('mochila cheia: drop perdido'::text); exit; end if;
      nid := roll_item(m.drop_item, 'drop:' || h.id, seed || ':item' || i);
      insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', bag_n); bag_n := bag_n + 1;
      rep_drops := rep_drops || jsonb_build_object('template', m.drop_item, 'id', nid);
    end loop;
    -- drops de criatura: chance por abate, independente; vira material na pilha
    for e2 in select * from drop_entries where table_id = m.loot_table and min_world <= c.world_id loop
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
end $function$;

-- coleta: depósitos do anel 3 são do clã que domina a cidade (sem dono = livre)
CREATE OR REPLACE FUNCTION public.gather_start(p_node text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c characters; n resource_nodes; st resource_node_state; tool jsonb; pl int; secs numeric; jid uuid; last timestamptz; cap numeric;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into n from resource_nodes where id = p_node; if n.id is null then raise exception 'depósito inválido'; end if;
  if exists (select 1 from gather_jobs where character_id = c.id and status = 'ativo') then raise exception 'você já está coletando'; end if;
  if n.owner = 'forte' and (fort_owner() is null or fort_owner() is distinct from (select clan_id from clan_members where character_id = c.id)) then raise exception 'só o clã que domina o Forte Cinzento coleta aqui'; end if;
  if n.owner like 'city:%' and city_owner(substr(n.owner, 6)) is not null and city_owner(substr(n.owner, 6)) is distinct from clan_of(c.id) then raise exception 'depósito exclusivo do clã que domina %', (select name from cities where id = substr(n.owner, 6)); end if;
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
end $function$;

-- loja: desconto de poção em Sylvana e taxa local das cidades
CREATE OR REPLACE FUNCTION public.shop_buy(p_shop text, p_tpl text, p_qty integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c characters; it npc_shop_items; t item_templates; price bigint; tax bigint := 0; own uuid; city text; st int; g bigint; n int; i int; nid uuid;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into it from npc_shop_items where shop_id = p_shop and template_id = p_tpl; if it.shop_id is null then raise exception 'essa loja não vende isso'; end if;
  select * into t from item_templates where id = p_tpl;
  if p_qty < 1 or p_qty > 1000 then raise exception 'quantidade inválida'; end if;
  st := shop_stock(p_shop, p_tpl); if st is not null and st < p_qty then raise exception 'estoque: % (renova em até % h)', st, it.restock_h; end if;
  price := ceil(it.price * price_mult(c.world_id, t)) * p_qty;
  -- Bosques de Sylvana: poções mais baratas; cidades do continente cobram taxa local (parte vai pro clã que domina a cidade)
  city := in_city(c);
  if (p_tpl = 'potion' or p_tpl like 'pocao%') and city_bonus(c, 'pocao') is not null then price := ceil(price * (city_bonus(c, 'pocao'))::text::numeric); end if;
  if city is not null and city <> 'arken' then tax := ceil(price * cfgn('rings','city_tax')); price := price + tax; end if;
  select gold into g from wallets where character_id = c.id for update; if g < price then raise exception 'custa % gold', price; end if;
  if p_tpl = 'potion' then update characters set pots = pots + p_qty where id = c.id;
  elsif t.stackable then perform stack_add(c.id, p_tpl, 50, p_qty);
  else
    select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n + p_qty > 20 then raise exception 'mochila sem espaço'; end if;
    for i in 1..p_qty loop insert into items(template_id, rarity, roll, origin) values (p_tpl, 0, '{}', 'loja:' || p_shop) returning id into nid; insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', n + i - 1); end loop;
  end if;
  if st is not null then update npc_shop_stock set stock = stock - p_qty where shop_id = p_shop and template_id = p_tpl; end if;
  perform add_gold(c.id, -price, 'loja_' || p_shop, p_tpl);
  own := case when city is not null then city_owner(city) end;
  if tax > 0 and own is not null and floor(tax * cfgn('rings','fee_share')) > 0 then
    insert into clan_vault(clan_id, gold) values (own, floor(tax * cfgn('rings','fee_share'))) on conflict (clan_id) do update set gold = clan_vault.gold + excluded.gold, updated_at = now();
    insert into clan_vault_logs(clan_id, character_id, name, action, currency, amount) values (own, c.id, c.name, 'taxa_cidade', 'gold', floor(tax * cfgn('rings','fee_share')));
  end if;
  return get_state();
end $function$;

-- venda: preço regional da cidade onde o personagem está
CREATE OR REPLACE FUNCTION public.shop_sell(p_shop text, p_args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c characters; sh npc_shops; t item_templates; it items; v bigint; left_ bigint; q int; pur int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into sh from npc_shops where id = p_shop; if sh.id is null or not ('sell' = any(sh.services)) then raise exception 'essa loja não compra'; end if;
  if p_args ? 'item' then
    select i.* into it from items i join inventory v2 on v2.item_id = i.id where i.id = (p_args ->> 'item')::uuid and v2.character_id = c.id and v2.container in ('bag','protected');
    if it.id is null then raise exception 'item não está na mochila'; end if;
    select * into t from item_templates where id = it.template_id;
    if not shop_accepts(p_shop, t) then raise exception '% não compra %', sh.name, t.name; end if;
    v := floor(item_value(it) * price_mult(c.world_id, t) * sh.sell_mult * city_sell_mult(c, t));
  else
    select * into t from item_templates where id = p_args ->> 't'; q := (p_args ->> 'qty')::int; pur := (p_args ->> 'purity')::int;
    if t.id is null or not t.stackable or q is null or q < 1 then raise exception 'material inválido'; end if;
    if not shop_accepts(p_shop, t) then raise exception '% não compra %', sh.name, t.name; end if;
    v := floor(t.sell * q * (0.6 + pur / 100.0 * 0.6) * price_mult(c.world_id, t) * sh.sell_mult * city_sell_mult(c, t) * (1 + least(0.15, prof_level(c.id, 'comercio') * 0.0015)));
  end if;
  left_ := npc_budget_left(c.id); if v > left_ then raise exception 'o caixa da loja só tem % gold agora (renova a cada % h)', left_, cfg('npc_budget') ->> 'regen_h'; end if;
  if it.id is not null then delete from inventory where item_id = it.id; delete from items where id = it.id; else perform stack_take(c.id, t.id, pur, q); end if;
  perform add_gold(c.id, v, 'venda_loja_' || p_shop, t.id); perform npc_budget_use(c.id, v); perform prof_gain(c.id, 'comercio', greatest(1, v / 50));
  return jsonb_build_object('gold', v, 'state', get_state());
end $function$;

-- itens: conserto 20% mais barato em Khazad; encantamento nível V só em Nocthar
CREATE OR REPLACE FUNCTION public.item_action(p_item uuid, p_action text, p_arg jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    cost := ceil((maxd - dur) * cfgn('craft','repair_cost_per_point') * coalesce((city_bonus(c, 'conserto'))::text::numeric, 1)); select gold into g from wallets where character_id = c.id; if g < cost then raise exception 'conserto custa % gold', cost; end if;
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
        if tier >= 5 and city_bonus(c, 'encanto_v') is null then raise exception 'encantamento nível V só na Cidadela de Nocthar'; end if;
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
end $function$;

-- oficina: refino e forja 20% mais baratos em Khazad
CREATE OR REPLACE FUNCTION public.craft_start(p_recipe text, p_technique text DEFAULT 'segura'::text, p_qty integer DEFAULT 1, p_choices jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  cost := ceil(rc.gold_cost * (tech ->> 'gold_mult')::numeric * qty * (case when rc.profession_id in ('metalurgia','ferraria') then coalesce((city_bonus(c, 'refino'))::text::numeric, 1) else 1 end));
  select gold into g from wallets where character_id = c.id; if g < cost then raise exception 'custa % gold', cost; end if;
  if cost > 0 then perform add_gold(c.id, -cost, 'oficina', rc.id); end if;
  secs := rc.seconds * qty / (1 + pl * 0.006);
  insert into craft_jobs(character_id, recipe_id, technique, qty, consumed, ready_at) values (c.id, rc.id, p_technique, qty, consumed, now() + make_interval(secs => secs)) returning id into jid;
  return jsonb_build_object('job', jid, 'seconds', round(secs, 1), 'state', get_state());
end $function$;

-- oficina: lapidação e joalheria em Solkar ganham pureza extra
CREATE OR REPLACE FUNCTION public.craft_finish(p_job uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    perform prof_gain(c.id, rc.profession_id, ceil(rc.exp * j.qty * 0.3)::bigint);
    update craft_jobs set status = 'pronto', result = '{"fail":true}' where id = j.id;
    return jsonb_build_object('fail', true, 'state', get_state());
  end if;
  if rc.kind = 'modular' then
    res := modular_finish(c, j, rc); rar := (res ->> 'rarity')::int; q := (res ->> 'quality')::numeric;
  elsif coalesce((select props ? 'forge' from item_templates where id = rc.output ->> 't'), false) then
    -- equipamento forjado (arsenal das classes, elmo, anel, amuleto, ferramentas): montador genérico
    tl := tool_of(c.id, 'martelo');
    res := forge_build(rc.output ->> 't', j.consumed, avg_p, pl, c.name, coalesce((tl ->> 'tier')::numeric, 1), c.id); rar := (res ->> 'rarity')::int; q := (res ->> 'quality')::numeric;
    select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n >= 20 then raise exception 'mochila cheia'; end if;
    insert into items(template_id, rarity, roll, origin, crafted_by, crafted_at) values (rc.output ->> 't', rar, res - 'rarity', 'oficina', c.name, now()) returning id into nid;
    insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', n);
    res := res || jsonb_build_object('id', nid);
    insert into account_audit_log(user_id, action, meta) values (c.user_id, 'fabricou', jsonb_build_object('item', nid, 'tpl', rc.output ->> 't', 'rarity', rar, 'quality', round(q)));
  elsif rc.kind = 'refino' then
    pur := greatest(0, least(100, round(avg_p + (tech ->> 'purity_gain')::numeric * (0.6 + pl / 250.0) + rand_normal() * (tech ->> 'spread')::numeric
      + case when rc.profession_id in ('lapidacao','joalheria') then coalesce((city_bonus(c, 'pureza'))::text::numeric, 0) else 0 end)));
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
end $function$;

-- processamento de pedras: 20% mais barato em Khazad
CREATE OR REPLACE FUNCTION public.process_stones_start(p_stone text, p_method text, p_qty integer, p_purity integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c characters; mt stone_methods; lvl int; pr jsonb; e jsonb; r double precision; acc numeric; got jsonb := '{}'; lost int := 0; i int; need int; st record; take int; cost bigint; g bigint; secs numeric; jid uuid; pur int; key text; n int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if not exists (select 1 from stone_types where id = p_stone) then raise exception 'isso não é pedra bruta'; end if;
  select * into mt from stone_methods where id = p_method; if mt.id is null then raise exception 'método inválido'; end if;
  lvl := prof_level(c.id, 'processamento'); if lvl < mt.req_level then raise exception '% pede Processamento mineral nível %', mt.name, mt.req_level; end if;
  if mt.only_stones is not null and not (p_stone = any(mt.only_stones)) then raise exception '% só serve pra pedras dimensionais e primordiais', mt.name; end if;
  if p_qty < 1 or p_qty > 10000 then raise exception 'quantidade de 1 a 10.000'; end if;
  select count(*) into n from stone_jobs where character_id = c.id and status = 'ativo'; if n >= 2 then raise exception 'o Centro processa no máximo 2 lotes seus por vez'; end if;
  cost := ceil(mt.cost::bigint * p_qty * coalesce((city_bonus(c, 'refino'))::text::numeric, 1)); select gold into g from wallets where character_id = c.id for update; if g < cost then raise exception 'o serviço custa % gold', cost; end if;
  need := p_qty;
  for st in select * from inventory_stacks where character_id = c.id and template_id = p_stone and (p_purity is null or purity = p_purity) order by purity desc for update loop
    exit when need <= 0; take := least(need, st.qty); perform stack_take(c.id, p_stone, st.purity, take); need := need - take;
  end loop;
  if need > 0 then raise exception 'faltam % × %', need, (select name from item_templates where id = p_stone); end if;
  perform add_gold(c.id, -cost, 'processamento', p_stone);
  pr := stone_probs(p_stone, p_method, lvl);
  -- uma tentativa independente por pedra, resultados mutuamente exclusivos
  for i in 1..p_qty loop
    r := random(); acc := 0; e := null;
    for e in select * from jsonb_array_elements(pr -> 'entries') loop acc := acc + (e ->> 'p')::numeric; if r < acc then exit; end if; e := null; end loop;
    if e is null then lost := lost + 1; continue; end if;
    pur := greatest(0, least(100, round((e ->> 'pur_min')::int + random() * ((e ->> 'pur_max')::int - (e ->> 'pur_min')::int) + case when e ->> 'cat' = 'gem' then mt.gem_purity else 0 end) / 5 * 5))::int;
    key := (e ->> 't') || '|' || pur; got := got || jsonb_build_object(key, coalesce((got ->> key)::int, 0) + 1);
  end loop;
  secs := greatest(3, least(3600, p_qty * mt.secs / (1 + lvl * 0.01)));
  insert into stone_jobs(character_id, stone_id, method_id, qty, cost, ready_at, result) values (c.id, p_stone, p_method, p_qty, cost, now() + make_interval(secs => secs), jsonb_build_object('got', got, 'lost', lost)) returning id into jid;
  insert into account_audit_log(user_id, action, meta) values (c.user_id, 'processamento', jsonb_build_object('job', jid, 'stone', p_stone, 'qty', p_qty, 'method', p_method));
  return jsonb_build_object('job', jid, 'seconds', round(secs, 1), 'cost', cost, 'state', get_state());
end $function$;
