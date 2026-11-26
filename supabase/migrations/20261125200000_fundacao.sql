-- Hunt Taken · fundação: contas, personagens, mundo, economia, sessões. Cliente nunca escreve direto: tudo por RPC (security definer).
create extension if not exists citext;
create extension if not exists pgcrypto;

-- ---------- dados estáticos do mundo ----------
create table if not exists kingdoms (id text primary key, name text not null, bonus jsonb not null default '{}');
create table if not exists vocations (id text primary key, name text not null, cfg jsonb not null default '{}');
create table if not exists creatures (
  id text primary key, name text not null, level int not null, hp int not null, atk int not null, def int not null,
  exp int not null, gold_min int not null, gold_max int not null, drop_item text, drop_chance numeric default 0, boss boolean default false, sprite text);
create table if not exists item_templates (
  id text primary key, name text not null, slot text, atk int default 0, def int default 0, sell int default 0, price int,
  mat boolean default false, voc text[], icon text, extra jsonb default '{}');
create table if not exists hunts (
  id text primary key, region text not null, name text not null, creature_id text not null references creatures(id),
  spawns int not null, respawn_ms int not null, rect jsonb not null, door jsonb not null, boss_id text references creatures(id), rare int default 1, level_min int default 1);

-- ---------- estado do mundo ----------
create table if not exists hunt_state (
  hunt_id text primary key references hunts(id), population numeric not null default 100, pressure numeric not null default 0,
  state text not null default 'abundante', updated_at timestamptz not null default now());
create table if not exists rival_agents (
  id text primary key, name text not null, kingdom text not null references kingdoms(id), vocation text not null references vocations(id),
  level int not null, profile jsonb not null default '{}', hunt_id text references hunts(id), since timestamptz default now(), state text default 'idle', rating int default 1000);
create table if not exists world_events (
  id uuid primary key default gen_random_uuid(), type text not null, hunt_id text references hunts(id), region text,
  starts_at timestamptz not null default now(), ends_at timestamptz not null, payload jsonb default '{}', state text default 'ativo');
create table if not exists world_meta (key text primary key, value jsonb, updated_at timestamptz default now());

-- ---------- contas e personagens ----------
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade, nickname citext unique not null,
  status text not null default 'ativo', created_at timestamptz default now(), terms_version text, terms_at timestamptz);
create table if not exists characters (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
  name citext unique not null, vocation text not null references vocations(id), kingdom text not null references kingdoms(id),
  level int not null default 1, exp bigint not null default 0, hp int not null default 115, mana int not null default 35,
  skills jsonb not null default '{"sword":10,"distance":10,"magic":0,"shield":10}', skill_xp jsonb not null default '{}',
  pots int not null default 5, bless boolean default false, premium boolean default false,
  x int default 8, y int default 8, hunt_id text references hunts(id), task text not null default 'idle',
  behavior jsonb not null default '{"postura":"equilibrada","alvo":"proximo","pocao":50,"recuo":20,"reposicao":"mochila","objetivo":"exp"}',
  last_simulated_at timestamptz not null default now(), deaths int default 0, kills bigint default 0,
  created_at timestamptz default now(), updated_at timestamptz default now(), status text default 'ativo');
create table if not exists wallets (character_id uuid primary key references characters(id) on delete cascade, gold bigint not null default 0 check (gold >= 0));
create table if not exists ledger (id bigserial primary key, character_id uuid not null references characters(id) on delete cascade, amount bigint not null, reason text not null, ref text, created_at timestamptz default now());
create index if not exists ledger_char_idx on ledger(character_id, created_at desc);

-- ---------- itens ----------
create table if not exists items (
  id uuid primary key default gen_random_uuid(), template_id text not null references item_templates(id), rarity int not null default 0,
  roll jsonb not null default '{}', origin text, seed text, created_at timestamptz default now());
create table if not exists inventory (
  item_id uuid primary key references items(id) on delete cascade, character_id uuid not null references characters(id) on delete cascade,
  container text not null check (container in ('bag','protected','equip','market')), slot text, idx int default 0, updated_at timestamptz default now());
create index if not exists inventory_char_idx on inventory(character_id, container);
create unique index if not exists inventory_equip_slot on inventory(character_id, slot) where container = 'equip';

-- ---------- mercado ----------
create table if not exists market_listings (
  id uuid primary key default gen_random_uuid(), seller_character_id uuid references characters(id), seller_rival_id text references rival_agents(id),
  item_id uuid not null references items(id), price bigint not null check (price > 0), status text not null default 'aberto',
  created_at timestamptz default now(), expires_at timestamptz not null default now() + interval '7 days');
create table if not exists market_transactions (
  id uuid primary key default gen_random_uuid(), listing_id uuid references market_listings(id), buyer_id uuid references characters(id),
  seller_id uuid references characters(id), price bigint not null, fee bigint not null, created_at timestamptz default now());

-- ---------- sessões e território ----------
create table if not exists hunt_sessions (
  id uuid primary key default gen_random_uuid(), character_id uuid not null references characters(id) on delete cascade, hunt_id text not null references hunts(id),
  behavior jsonb not null default '{}', started_at timestamptz default now(), ended_at timestamptz, status text not null default 'ativa',
  totals jsonb not null default '{"exp":0,"gold":0,"kills":0,"deaths":0,"pots":0,"drops":0}');
create index if not exists sessions_char_idx on hunt_sessions(character_id, status);
create table if not exists session_reports (
  id bigserial primary key, session_id uuid references hunt_sessions(id) on delete cascade, character_id uuid not null references characters(id) on delete cascade,
  from_at timestamptz not null, to_at timestamptz not null, exp bigint default 0, gold_in bigint default 0, gold_out bigint default 0, kills int default 0,
  deaths int default 0, pots int default 0, drops jsonb default '[]', events jsonb default '[]', seen boolean default false, created_at timestamptz default now());
create table if not exists hunt_presence (
  hunt_id text not null references hunts(id), actor_type text not null check (actor_type in ('char','rival')), actor_id text not null,
  entered_at timestamptz default now(), last_active_at timestamptz default now(), contribution numeric default 0, primary key (hunt_id, actor_type, actor_id));
create table if not exists territory_influence (
  hunt_id text not null references hunts(id), actor_type text not null, actor_id text not null, kingdom text references kingdoms(id),
  influence numeric not null default 0, updated_at timestamptz default now(), primary key (hunt_id, actor_type, actor_id));
create table if not exists account_audit_log (id bigserial primary key, user_id uuid, action text not null, meta jsonb default '{}', created_at timestamptz default now());

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table characters enable row level security;
alter table wallets enable row level security;
alter table ledger enable row level security;
alter table items enable row level security;
alter table inventory enable row level security;
alter table market_listings enable row level security;
alter table market_transactions enable row level security;
alter table hunt_sessions enable row level security;
alter table session_reports enable row level security;
alter table hunt_presence enable row level security;
alter table territory_influence enable row level security;
alter table account_audit_log enable row level security;
alter table kingdoms enable row level security; alter table vocations enable row level security; alter table creatures enable row level security;
alter table item_templates enable row level security; alter table hunts enable row level security; alter table hunt_state enable row level security;
alter table rival_agents enable row level security; alter table world_events enable row level security; alter table world_meta enable row level security;

-- dados públicos do jogo: leitura pra qualquer usuário logado
do $$ declare t text; begin
  foreach t in array array['kingdoms','vocations','creatures','item_templates','hunts','hunt_state','rival_agents','world_events','world_meta','hunt_presence','territory_influence','market_listings'] loop
    execute format('drop policy if exists "read_%s" on %I', t, t);
    execute format('create policy "read_%s" on %I for select to authenticated using (true)', t, t);
  end loop; end $$;
-- dados próprios
create policy "own_profile" on profiles for select to authenticated using (user_id = auth.uid());
create policy "own_character" on characters for select to authenticated using (user_id = auth.uid());
create policy "own_wallet" on wallets for select to authenticated using (character_id in (select id from characters where user_id = auth.uid()));
create policy "own_ledger" on ledger for select to authenticated using (character_id in (select id from characters where user_id = auth.uid()));
create policy "own_inventory" on inventory for select to authenticated using (character_id in (select id from characters where user_id = auth.uid()));
create policy "items_visible" on items for select to authenticated using (
  id in (select item_id from inventory where character_id in (select id from characters where user_id = auth.uid()))
  or id in (select item_id from market_listings where status = 'aberto'));
create policy "own_sessions" on hunt_sessions for select to authenticated using (character_id in (select id from characters where user_id = auth.uid()));
create policy "own_reports" on session_reports for select to authenticated using (character_id in (select id from characters where user_id = auth.uid()));
create policy "own_tx" on market_transactions for select to authenticated using (buyer_id in (select id from characters where user_id = auth.uid()) or seller_id in (select id from characters where user_id = auth.uid()));
create policy "own_audit" on account_audit_log for select to authenticated using (user_id = auth.uid());

-- vista pública de personagens (nunca expõe e-mail ou ids de auth)
create or replace view public_characters as
  select c.id, c.name::text as name, c.vocation, c.kingdom, c.level, c.hunt_id, c.task from characters c where c.status = 'ativo';
grant select on public_characters to authenticated;

-- ---------- helpers ----------
create or replace function ht_rand(seed text) returns double precision language sql immutable as $$
  select (('x' || substr(md5(seed), 1, 13))::bit(52)::bigint)::double precision / 4503599627370496.0 $$;
create or replace function exp_for(l int) returns bigint language sql immutable as $$ select greatest(0, round(50.0/3 * (l::numeric^3 - 6*l::numeric^2 + 17*l - 12)))::bigint $$;
create or replace function my_character() returns characters language sql security definer set search_path = public stable as $$
  select * from characters where user_id = auth.uid() limit 1 $$;
create or replace function hp_max(c characters) returns int language sql immutable as $$
  select 100 + (case c.vocation when 'knight' then 15 when 'paladin' then 10 else 5 end) * c.level $$;
create or replace function mana_max(c characters) returns int language sql immutable as $$
  select 30 + (case c.vocation when 'knight' then 5 when 'paladin' then 15 else 30 end) * c.level $$;
create or replace function main_skill(c characters) returns int language sql immutable as $$
  select coalesce((c.skills ->> (case c.vocation when 'knight' then 'sword' when 'paladin' then 'distance' else 'magic' end))::int, 10) $$;
-- soma de atributo do equipamento (atk/def), com raridade
create or replace function equip_sum(cid uuid, k text) returns numeric language sql stable as $$
  select coalesce(sum((case k when 'atk' then t.atk when 'def' then t.def else 0 end) * (array[1,1.15,1.35,1.7])[i.rarity+1] + coalesce((i.roll ->> k)::numeric, 0)), 0)
  from inventory inv join items i on i.id = inv.item_id join item_templates t on t.id = i.template_id where inv.character_id = cid and inv.container = 'equip' $$;
create or replace function atk_of(c characters) returns numeric language sql stable as $$
  select (case c.vocation when 'knight' then 8 when 'paladin' then 10 when 'sorcerer' then 14 else 11 end) + main_skill(c) * 1.1 + equip_sum(c.id, 'atk') $$;
create or replace function def_of(c characters) returns numeric language sql stable as $$
  select (equip_sum(c.id, 'def') + coalesce((c.skills->>'shield')::numeric, 10) * 0.3) * (case c.vocation when 'knight' then 1.25 when 'paladin' then 1.0 when 'sorcerer' then 0.75 else 0.85 end) $$;
create or replace function power_of(c characters) returns numeric language sql stable as $$
  select c.level * 2 + main_skill(c) * 3 + coalesce((c.skills->>'shield')::numeric, 10) * 2 + equip_sum(c.id, 'atk') * 2 + equip_sum(c.id, 'def') * 2 + c.pots * 0.5 $$;
create or replace function rival_power(r rival_agents) returns numeric language sql immutable as $$ select r.level * 2 + (10 + r.level) * 5 + r.level * 1.5 + 5 $$;
create or replace function add_gold(cid uuid, amt bigint, why text, ref text default null) returns void language plpgsql as $$
begin
  update wallets set gold = gold + amt where character_id = cid;
  if not found then insert into wallets(character_id, gold) values (cid, greatest(0, amt)); end if;
  insert into ledger(character_id, amount, reason, ref) values (cid, amt, why, ref);
end $$;
create or replace function roll_item(tpl text, origin text, seed text) returns uuid language plpgsql as $$
declare r double precision := ht_rand(seed || ':rar'); rar int := 0; t item_templates; roll jsonb := '{}'; nid uuid;
begin
  select * into t from item_templates where id = tpl;
  if r > 0.70 then rar := 1; end if; if r > 0.92 then rar := 2; end if; if r > 0.99 then rar := 3; end if;
  if t.slot is not null then
    if t.atk > 0 then roll := roll || jsonb_build_object('atk', floor(ht_rand(seed || ':a') * (ceil(t.atk * 0.15) + 1))); end if;
    if t.def > 0 then roll := roll || jsonb_build_object('def', floor(ht_rand(seed || ':d') * (ceil(t.def * 0.15) + 1))); end if;
    if ht_rand(seed || ':s') < 0.25 then roll := roll || jsonb_build_object('skill', 1 + rar); end if;
  end if;
  insert into items(template_id, rarity, roll, origin, seed) values (tpl, rar, roll, origin, seed) returning id into nid;
  return nid;
end $$;
create or replace function item_value(it items) returns bigint language sql stable as $$
  select floor(coalesce(t.sell, 0) * (array[1,1.15,1.35,1.7])[it.rarity+1] * (1 + coalesce((select sum(v::numeric) from jsonb_each_text(it.roll) as e(k, v)), 0) * 0.05))::bigint
  from item_templates t where t.id = it.template_id $$;
