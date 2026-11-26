-- VIP e Passe de Batalha (modelo Pokeidle), pagos em diamantes 💎.
-- VIP: +50% de exp, caça off-line de 24 h com o rendimento do premium, selo 👑 no chat. 30/60/90 dias = 10/17/25 💎; renovar soma.
-- Passe: trilha de 30 dias de login (a partir do nível 10), um resgate por dia (vira à meia-noite de Brasília); faltou um dia,
-- volta pro Dia 1. Dias 7/14/21/28 ⭐ e Dia 30 lendário. Premium: 50 💎 por 30 dias corridos (acumula até 90), entrega o grátis + o Premium.
-- Boosts de exp e de loot (+50% cada) somam com o VIP. Prêmios do passe são gold, poções, boosts e dias de VIP: nada vai pro mercado.
insert into game_config(key, value) values
  ('vip', '{"exp": 0.5, "prices": {"30": 10, "60": 17, "90": 25}}'),
  ('battle_pass', '{"min_level": 10, "premium_gems": 50, "premium_days": 30, "premium_max_days": 90, "boost": 0.5, "tz": "America/Sao_Paulo"}')
on conflict (key) do nothing;
alter table characters add column if not exists vip_until timestamptz, add column if not exists pass_premium_until timestamptz;
create table if not exists character_boosts(character_id uuid not null references characters(id) on delete cascade, kind text not null check (kind in ('exp','loot')), until timestamptz not null, primary key (character_id, kind));
create table if not exists battle_pass(character_id uuid primary key references characters(id) on delete cascade, day int not null default 1, last_claim date, cycle int not null default 1, claims int not null default 0);
create table if not exists battle_pass_rewards(day int primary key check (day between 1 and 30), star boolean not null default false, free jsonb not null, premium jsonb not null);
alter table character_boosts enable row level security; alter table battle_pass enable row level security; alter table battle_pass_rewards enable row level security;
drop policy if exists boosts_own on character_boosts; create policy boosts_own on character_boosts for select using (character_id in (select id from characters where user_id = auth.uid()));
drop policy if exists pass_own on battle_pass; create policy pass_own on battle_pass for select using (character_id in (select id from characters where user_id = auth.uid()));
drop policy if exists pass_rewards_read on battle_pass_rewards; create policy pass_rewards_read on battle_pass_rewards for select using (true);
insert into battle_pass_rewards(day, star, free, premium) values
  (1, false, '{"gold": 2000, "pots": 11}', '{"gold": 6000, "vip_days": 3, "boost_loot_h": 3}'),
  (2, false, '{"gold": 2500}', '{"gold": 7500, "boost_exp_h": 3, "pots": 30}'),
  (3, false, '{"gold": 3000, "boost_loot_h": 1}', '{"gold": 9000}'),
  (4, false, '{"gold": 3500, "pots": 14}', '{"gold": 10500, "boost_exp_h": 3}'),
  (5, false, '{"gold": 4000, "boost_exp_h": 1}', '{"gold": 12000, "boost_loot_h": 3, "pots": 30}'),
  (6, false, '{"gold": 4500}', '{"gold": 13500, "boost_exp_h": 3}'),
  (7, true, '{"gold": 20000, "pots": 40, "boost_exp_h": 3, "boost_loot_h": 2}', '{"gold": 50000, "pots": 80, "boost_exp_h": 8, "boost_loot_h": 6}'),
  (8, false, '{"gold": 5500}', '{"gold": 16500, "boost_exp_h": 3, "pots": 30}'),
  (9, false, '{"gold": 6000, "boost_loot_h": 1}', '{"gold": 18000, "boost_loot_h": 3}'),
  (10, false, '{"gold": 6500, "pots": 20, "boost_exp_h": 1}', '{"gold": 19500, "vip_days": 3, "boost_exp_h": 3}'),
  (11, false, '{"gold": 7000}', '{"gold": 21000, "pots": 30}'),
  (12, false, '{"gold": 7500}', '{"gold": 22500, "boost_exp_h": 3}'),
  (13, false, '{"gold": 8000, "pots": 23}', '{"gold": 24000, "boost_loot_h": 3}'),
  (14, true, '{"gold": 34000, "pots": 40, "boost_exp_h": 3, "boost_loot_h": 2}', '{"gold": 85000, "pots": 80, "boost_exp_h": 8, "boost_loot_h": 6}'),
  (15, false, '{"gold": 9000, "boost_exp_h": 1, "boost_loot_h": 1}', '{"gold": 27000}'),
  (16, false, '{"gold": 9500, "pots": 26}', '{"gold": 28500, "boost_exp_h": 3}'),
  (17, false, '{"gold": 10000}', '{"gold": 30000, "boost_loot_h": 3, "pots": 30}'),
  (18, false, '{"gold": 10500}', '{"gold": 31500, "boost_exp_h": 3}'),
  (19, false, '{"gold": 11000, "pots": 29}', '{"gold": 33000}'),
  (20, false, '{"gold": 11500, "boost_exp_h": 1}', '{"gold": 34500, "vip_days": 3, "boost_exp_h": 3, "pots": 30}'),
  (21, true, '{"gold": 48000, "pots": 40, "boost_exp_h": 3, "boost_loot_h": 2}', '{"gold": 120000, "pots": 80, "boost_exp_h": 8, "boost_loot_h": 6}'),
  (22, false, '{"gold": 12500, "pots": 32}', '{"gold": 37500, "boost_exp_h": 3}'),
  (23, false, '{"gold": 13000}', '{"gold": 39000, "pots": 30}'),
  (24, false, '{"gold": 13500}', '{"gold": 40500, "boost_exp_h": 3}'),
  (25, false, '{"gold": 14000, "pots": 35, "boost_exp_h": 1}', '{"gold": 42000, "boost_loot_h": 3}'),
  (26, false, '{"gold": 14500}', '{"gold": 43500, "boost_exp_h": 3, "pots": 30}'),
  (27, false, '{"gold": 15000, "boost_loot_h": 1}', '{"gold": 45000}'),
  (28, true, '{"gold": 62000, "pots": 40, "boost_exp_h": 3, "boost_loot_h": 2}', '{"gold": 155000, "pots": 80, "boost_exp_h": 8, "boost_loot_h": 6}'),
  (29, false, '{"gold": 16000}', '{"gold": 48000, "vip_days": 3, "boost_loot_h": 3, "pots": 30}'),
  (30, true, '{"gold": 100000, "pots": 100, "boost_exp_h": 3, "boost_loot_h": 3}', '{"gold": 250000, "pots": 200, "boost_exp_h": 12, "boost_loot_h": 12, "vip_days": 7}')
on conflict (day) do nothing;

-- multiplicador dos bônus pagos (somam entre si; multiplicam os outros bônus do jogo)
create or replace function bonus_mult(c characters, p_kind text) returns numeric language sql stable security definer set search_path = public as $$
  select 1 + case when p_kind = 'exp' and c.vip_until > now() then cfgn('vip','exp') else 0 end
           + coalesce((select cfgn('battle_pass','boost') from character_boosts b where b.character_id = c.id and b.kind = p_kind and b.until > now()), 0) $$;
create or replace function is_vip(c characters) returns boolean language sql stable as $$ select coalesce(c.vip_until > now(), false) or c.premium $$;

create or replace function grant_reward(cid uuid, r jsonb, why text) returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce((r ->> 'gold')::bigint, 0) > 0 then perform add_gold(cid, (r ->> 'gold')::bigint, why, null); end if;
  if coalesce((r ->> 'pots')::int, 0) > 0 then update characters set pots = pots + (r ->> 'pots')::int where id = cid; end if;
  if coalesce((r ->> 'vip_days')::int, 0) > 0 then update characters set vip_until = greatest(coalesce(vip_until, now()), now()) + make_interval(days => (r ->> 'vip_days')::int) where id = cid; end if;
  if coalesce((r ->> 'boost_exp_h')::numeric, 0) > 0 then insert into character_boosts values (cid, 'exp', now() + make_interval(hours => (r ->> 'boost_exp_h')::int))
    on conflict (character_id, kind) do update set until = greatest(character_boosts.until, now()) + make_interval(hours => (r ->> 'boost_exp_h')::int); end if;
  if coalesce((r ->> 'boost_loot_h')::numeric, 0) > 0 then insert into character_boosts values (cid, 'loot', now() + make_interval(hours => (r ->> 'boost_loot_h')::int))
    on conflict (character_id, kind) do update set until = greatest(character_boosts.until, now()) + make_interval(hours => (r ->> 'boost_loot_h')::int); end if;
end $$;
revoke execute on function grant_reward(uuid, jsonb, text) from public, anon, authenticated;

create or replace function buy_vip(p_days int) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; price int := (cfg('vip') -> 'prices' ->> p_days::text)::int; g bigint;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if price is null then raise exception 'plano de VIP inválido'; end if;
  select gems into g from wallets where character_id = c.id for update; if coalesce(g, 0) < price then raise exception 'o VIP de % dias custa % diamantes (você tem %)', p_days, price, coalesce(g, 0); end if;
  perform add_gems(c.id, -price, 'vip', p_days || 'd');
  update characters set vip_until = greatest(coalesce(vip_until, now()), now()) + make_interval(days => p_days) where id = c.id;
  return pass_view();
end $$;
create or replace function buy_pass_premium() returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; k jsonb := cfg('battle_pass'); g bigint; nu timestamptz;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  nu := greatest(coalesce(c.pass_premium_until, now()), now()) + make_interval(days => (k ->> 'premium_days')::int);
  if nu > now() + make_interval(days => (k ->> 'premium_max_days')::int) + interval '1 minute' then raise exception 'o Passe Premium acumula no máximo % dias', k ->> 'premium_max_days'; end if;
  select gems into g from wallets where character_id = c.id for update; if coalesce(g, 0) < (k ->> 'premium_gems')::int then raise exception 'o Passe Premium custa % diamantes (você tem %)', k ->> 'premium_gems', coalesce(g, 0); end if;
  perform add_gems(c.id, -(k ->> 'premium_gems')::int, 'passe_premium', null);
  update characters set pass_premium_until = nu where id = c.id;
  return pass_view();
end $$;

create or replace function pass_view() returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; bp battle_pass; k jsonb := cfg('battle_pass'); today date; day_now int; can boolean; reset_at timestamptz;
begin
  select * into c from characters where user_id = auth.uid(); if c.id is null then raise exception 'sem personagem'; end if;
  today := (now() at time zone (k ->> 'tz'))::date;
  select * into bp from battle_pass where character_id = c.id;
  day_now := case when bp.character_id is null or bp.last_claim is null or bp.last_claim < today - 1 then 1 else bp.day end;
  can := c.level >= (k ->> 'min_level')::int and (bp.last_claim is null or bp.last_claim < today);
  -- a sequência zera se você não resgatar até o fim do dia seguinte ao último resgate
  reset_at := case when bp.last_claim is not null and bp.last_claim >= today - 1 then ((bp.last_claim + 2)::timestamp at time zone (k ->> 'tz')) end;
  return jsonb_build_object('level_ok', c.level >= (k ->> 'min_level')::int, 'min_level', k -> 'min_level', 'day', day_now, 'can_claim', can, 'claimed_today', bp.last_claim = today,
    'reset_at', reset_at, 'next_day_at', ((today + 1)::timestamp at time zone (k ->> 'tz')), 'cycle', coalesce(bp.cycle, 1),
    'premium_until', case when c.pass_premium_until > now() then c.pass_premium_until end, 'premium_gems', k -> 'premium_gems', 'premium_max_days', k -> 'premium_max_days',
    'vip_until', case when c.vip_until > now() then c.vip_until end, 'vip_prices', cfg('vip') -> 'prices', 'vip_exp', cfg('vip') -> 'exp',
    'boosts', (select coalesce(jsonb_object_agg(kind, until), '{}') from character_boosts where character_id = c.id and until > now()),
    'exp_mult', bonus_mult(c, 'exp'), 'loot_mult', bonus_mult(c, 'loot'), 'gems', (select gems from wallets where character_id = c.id),
    'rewards', (select jsonb_agg(jsonb_build_object('day', day, 'star', star, 'free', free, 'premium', premium) order by day) from battle_pass_rewards));
end $$;
create or replace function pass_claim() returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; bp battle_pass; k jsonb := cfg('battle_pass'); today date; d int; rw battle_pass_rewards; prem boolean; got jsonb;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if c.level < (k ->> 'min_level')::int then raise exception 'o Passe libera no nível %', k ->> 'min_level'; end if;
  today := (now() at time zone (k ->> 'tz'))::date;
  insert into battle_pass(character_id) values (c.id) on conflict do nothing;
  select * into bp from battle_pass where character_id = c.id for update;
  if bp.last_claim = today then raise exception 'você já resgatou hoje: o próximo prêmio libera à meia-noite (Brasília)'; end if;
  d := case when bp.last_claim is null or bp.last_claim < today - 1 then 1 else bp.day end;   -- faltou um dia: volta pro Dia 1
  select * into rw from battle_pass_rewards where day = d;
  prem := c.pass_premium_until > now();
  perform grant_reward(c.id, rw.free, 'passe_dia_' || d);
  if prem then perform grant_reward(c.id, rw.premium, 'passe_premium_dia_' || d); end if;
  got := jsonb_build_object('day', d, 'star', rw.star, 'free', rw.free, 'premium', case when prem then rw.premium end);
  update battle_pass set day = case when d >= 30 then 1 else d + 1 end, cycle = cycle + case when d >= 30 then 1 else 0 end, last_claim = today, claims = claims + 1 where character_id = c.id;
  return pass_view() || jsonb_build_object('claimed', got);
end $$;
grant execute on function buy_vip(int), buy_pass_premium(), pass_view(), pass_claim() to authenticated;

-- caça: VIP e boosts entram no exp/loot; VIP tem a caça off-line de 24 h
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
  cap := make_interval(hours => case when is_vip(c) then 24 else 12 end);
  t0 := c.last_simulated_at; t1 := now();
  if t1 - t0 < interval '5 seconds' then return null; end if;
  if t1 - t0 > interval '3 minutes' then eff := case when is_vip(c) then cfgn('progress','offline_eff_premium') else cfgn('progress','offline_eff') end; end if;   -- off-line rende menos que presença
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
    -- VIP e boosts do passe (somam entre si)
    mult_exp := mult_exp * bonus_mult(c, 'exp'); mult_gold := mult_gold * bonus_mult(c, 'loot'); ring_drop := ring_drop * bonus_mult(c, 'loot');
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

CREATE OR REPLACE FUNCTION public.fight_spawn(p_spawn text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c characters; sp world_spawns; m creatures; st spawn_state; cw jsonb := cfg('open_world'); rm jsonb := cfg('open_world') -> 'rare_mult';
  mhp numeric; matk numeric; atk numeric; def numeric; chp numeric; dps numeric; ttk numeric; taken numeric; heal numeric; npots int := 0; won boolean;
  exp_gain bigint := 0; gold_gain bigint := 0; drops jsonb := '[]'; e drop_entries; qn int; nid uuid; bag_n int; lvl0 int; home cities; dead timestamptz;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into sp from world_spawns where id = p_spawn; if sp.id is null then raise exception 'criatura inválida'; end if;
  if c.task = 'hunt' then raise exception 'você está numa caçada: saia dela pra lutar no mapa aberto'; end if;
  if c.pos_at is null or c.pos_at < now() - interval '60 seconds' or sqrt(power(c.x - sp.x, 2) + power(c.y - sp.y, 2)) > (cw ->> 'range')::numeric then raise exception 'chegue mais perto da criatura'; end if;
  if c.last_fight_at > now() - make_interval(secs => (cw ->> 'cd_s')::numeric) then raise exception 'devagar'; end if;
  insert into spawn_state(spawn_id) values (sp.id) on conflict do nothing;
  select * into st from spawn_state where spawn_id = sp.id for update;
  if st.dead_until > now() then raise exception 'essa criatura já foi derrotada (volta em % s)', ceil(extract(epoch from st.dead_until - now())); end if;
  select * into m from creatures where id = sp.creature_id;
  mhp := m.hp * (case when sp.rare then (rm ->> 'hp')::numeric else 1 end); matk := m.atk * (case when sp.rare then (rm ->> 'atk')::numeric else 1 end);
  atk := atk_of(c); def := def_of(c); chp := least(c.hp, hp_max(c)); heal := 60 + c.level;
  dps := greatest(1, atk * 0.9 - m.def); ttk := mhp / dps; taken := greatest(0, matk - def) * ttk / 1.2 * (0.85 + random() * 0.3);
  while taken >= chp * 0.7 + npots * heal and npots < c.pots and npots < 5 loop npots := npots + 1; end loop;
  won := taken < chp + npots * heal; lvl0 := c.level;
  if won then
    exp_gain := round(m.exp * (case when sp.rare then (rm ->> 'exp')::numeric else 1 end) * bonus_mult(c, 'exp'));
    gold_gain := round((m.gold_min + random() * (m.gold_max - m.gold_min)) * (case when sp.rare then (rm ->> 'gold')::numeric else 1 end) * bonus_mult(c, 'loot'));
    c.exp := c.exp + exp_gain; while c.exp >= exp_for(c.level + 1) loop c.level := c.level + 1; end loop;
    if gold_gain > 0 then perform add_gold(c.id, gold_gain, 'mapa_aberto', sp.id); end if;
    for e in select * from drop_entries where table_id = m.loot_table and min_world <= c.world_id loop
      if random() < e.chance * (case when sp.rare then (rm ->> 'drop')::numeric else 1 end) then qn := e.qty_min + floor(random() * (e.qty_max - e.qty_min + 1))::int;
        perform stack_add(c.id, e.template_id, round(e.purity_min + random() * (e.purity_max - e.purity_min))::int, qn); drops := drops || jsonb_build_object('template', e.template_id, 'q', qn); end if;
    end loop;
    if m.drop_item is not null and random() < coalesce(m.drop_chance, 0) * (case when sp.rare then (rm ->> 'drop')::numeric else 1 end) then
      select count(*) into bag_n from inventory where character_id = c.id and container = 'bag';
      if bag_n < 20 then nid := roll_item(m.drop_item, 'mapa:' || sp.id, sp.id || ':' || extract(epoch from now())::text); insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', bag_n); drops := drops || jsonb_build_object('template', m.drop_item, 'id', nid); end if;
    end if;
    insert into character_kills(character_id, creature_id, kills) values (c.id, m.id, 1) on conflict (character_id, creature_id) do update set kills = character_kills.kills + 1;
    perform quest_kills(c.id, m.id, 1);
    dead := now() + make_interval(secs => case when sp.rare then (cw ->> 'rare_respawn_s')::numeric else (cw ->> 'respawn_min_s')::numeric + random() * ((cw ->> 'respawn_max_s')::numeric - (cw ->> 'respawn_min_s')::numeric) end);
    update spawn_state set dead_until = dead, kills = kills + 1 where spawn_id = sp.id;
    update characters set exp = c.exp, level = c.level, hp = greatest(1, least(hp_max(c), floor(chp + npots * heal - taken))), pots = c.pots - npots, kills = kills + 1, last_fight_at = now(), updated_at = now() where id = c.id;
  else
    -- derrota: volta pra cidade mais perto com metade da vida (sem perder exp nem gold no mapa aberto)
    select * into home from cities order by (case when heart then sqrt(power(greatest(0 - c.x, 0, c.x - 300), 2) + power(greatest(0 - c.y, 0, c.y - 200), 2)) else sqrt(power(c.x - x, 2) + power(c.y - y, 2)) end) limit 1;
    update characters set x = case when home.heart then 52 else home.x end, y = case when home.heart then 42 else home.y + 3 end, pos_at = now(), city_id = home.id, ring = 1, pvp_mode = false,
      hp = greatest(1, floor(hp_max(c) * 0.5)), pots = c.pots - npots, deaths = deaths + 1, last_fight_at = now(), updated_at = now() where id = c.id;
  end if;
  select * into c from characters where id = c.id;
  return jsonb_build_object('won', won, 'exp', exp_gain, 'gold', gold_gain, 'drops', drops, 'pots', npots, 'hp', c.hp, 'hp_max', hp_max(c), 'level', c.level, 'level_up', c.level > lvl0,
    'dead_until', dead, 'x', c.x, 'y', c.y, 'rare', sp.rare, 'creature', m.name, 'rounds', ceil(ttk));
end $function$;

CREATE OR REPLACE FUNCTION public.boss_fight(p_boss text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c characters; b bosses; bc jsonb := cfg('bosses_cfg'); last_win timestamptz; last_loss timestamptz; atk numeric; def numeric; php numeric; pmax numeric; bhp numeric; bmax numeric;
  r int := 0; ab jsonb; dmg numeric; ev text; enraged boolean := false; shield int := 0; adds int := 0; npots int := 0; heal numeric; won boolean := false; log jsonb := '[]'; rew jsonb := '{}';
  e drop_entries; k int; qn int; nid uuid; bag_n int; drops jsonb := '[]'; home cities; mult numeric;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into b from bosses where id = p_boss and enabled; if b.id is null then raise exception 'chefe inválido'; end if;
  if c.task = 'hunt' then raise exception 'saia da caçada antes de enfrentar o chefe'; end if;
  if c.pos_at is null or c.pos_at < now() - interval '2 minutes' or sqrt(power(c.x - b.x, 2) + power(c.y - b.y, 2)) > (bc ->> 'range')::numeric then raise exception 'vá até o covil do chefe'; end if;
  if c.level < b.min_level then raise exception 'esse chefe exige nível %', b.min_level; end if;
  select max(ba.at) filter (where ba.won), max(ba.at) filter (where not ba.won) into last_win, last_loss from boss_attempts ba where ba.character_id = c.id and ba.boss_id = b.id;
  if last_win > now() - make_interval(hours => b.cooldown_h::int) then raise exception '% volta pra você em % min', b.name, ceil(extract(epoch from last_win + make_interval(hours => b.cooldown_h::int) - now()) / 60); end if;
  if last_loss > now() - make_interval(mins => b.retry_min::int) then raise exception 'recupere-se antes de tentar de novo (% min)', ceil(extract(epoch from last_loss + make_interval(mins => b.retry_min::int) - now()) / 60); end if;
  atk := atk_of(c); def := def_of(c); pmax := hp_max(c); php := least(c.hp, pmax); bmax := b.hp; bhp := bmax; heal := 60 + c.level * 2;
  while r < (bc ->> 'max_rounds')::int loop
    r := r + 1; ev := null;
    -- jogador ataca (crítico 10%); escudo do chefe reduz o dano
    dmg := greatest(1, atk * 0.9 - b.def) * (0.9 + random() * 0.2) * (case when random() < 0.1 then 1.6 else 1 end) * (case when shield > 0 then 0.4 else 1 end);
    bhp := bhp - dmg; if shield > 0 then shield := shield - 1; end if;
    if bhp <= 0 then won := true; log := log || jsonb_build_array(jsonb_build_array(r, round(php), 0, 'O chefe caiu!')); exit; end if;
    -- chefe: ataque normal + habilidades por padrão (a cada N rodadas) e fúria abaixo de X% da vida
    mult := 1;
    for ab in select * from jsonb_array_elements(b.abilities) loop
      if ab ->> 'kind' = 'furia' and not enraged and bhp < bmax * (ab ->> 'below')::numeric then enraged := true; ev := (ab ->> 'name') || ': o chefe entra em fúria!';
      elsif ab ? 'every' and r % (ab ->> 'every')::int = 0 then
        if ab ->> 'kind' = 'golpe' then mult := mult * (ab ->> 'power')::numeric; ev := ab ->> 'name';
        elsif ab ->> 'kind' = 'area' then php := php - b.atk * (ab ->> 'power')::numeric * 0.6 * (0.9 + random() * 0.2); ev := (ab ->> 'name') || ' (ignora defesa)';
        elsif ab ->> 'kind' = 'cura' then bhp := least(bmax, bhp + bmax * (ab ->> 'power')::numeric); ev := (ab ->> 'name') || ': o chefe se cura';
        elsif ab ->> 'kind' = 'escudo' then shield := 3; ev := (ab ->> 'name') || ': dano reduzido por 3 rodadas';
        elsif ab ->> 'kind' = 'invocar' then adds := adds + 1; ev := (ab ->> 'name') || ' (' || adds || ' lacaios)'; end if;
      end if;
    end loop;
    dmg := greatest(1, b.atk * (case when enraged then (select (x ->> 'power')::numeric from jsonb_array_elements(b.abilities) x where x ->> 'kind' = 'furia' limit 1) else 1 end) - def) * mult * (0.85 + random() * 0.3)
      + adds * greatest(1, b.atk - def) * coalesce((select (x ->> 'power')::numeric from jsonb_array_elements(b.abilities) x where x ->> 'kind' = 'invocar' limit 1), 0.25);   -- lacaios: também esbarram na defesa
    php := php - dmg;
    if php < pmax * (bc ->> 'pot_below')::numeric and npots < least(c.pots, (bc ->> 'max_pots')::int) and php > 0 then npots := npots + 1; php := least(pmax, php + heal); ev := coalesce(ev || ' · ', '') || 'você bebe uma poção'; end if;
    log := log || jsonb_build_array(jsonb_build_array(r, greatest(0, round(php)), greatest(0, round(bhp)), ev));
    if php <= 0 then exit; end if;
  end loop;
  if won then
    rew := b.rewards; perform add_gold(c.id, (rew ->> 'gold')::bigint, 'chefe', b.id); if (rew ->> 'gems')::int > 0 then perform add_gems(c.id, (rew ->> 'gems')::int, 'chefe', b.id); end if;
    c.exp := c.exp + round(b.exp * bonus_mult(c, 'exp')); while c.exp >= exp_for(c.level + 1) loop c.level := c.level + 1; end loop;
    for k in 1..coalesce((rew ->> 'loot_rolls')::int, 1) loop
      for e in select * from drop_entries where table_id = rew ->> 'loot_table' and min_world <= c.world_id loop
        if random() < least(1, e.chance * 4) then qn := e.qty_min + floor(random() * (e.qty_max - e.qty_min + 1))::int; perform stack_add(c.id, e.template_id, round(e.purity_min + random() * (e.purity_max - e.purity_min))::int, qn); drops := drops || jsonb_build_object('template', e.template_id, 'q', qn); end if;
      end loop; end loop;
    select count(*) into bag_n from inventory where character_id = c.id and container = 'bag';
    if rew ? 'item' and bag_n < 20 then nid := roll_item(rew ->> 'item', 'chefe:' || b.id, c.id::text || ':' || extract(epoch from now())::text); insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', bag_n); drops := drops || jsonb_build_object('template', rew ->> 'item', 'id', nid); end if;
    insert into character_kills(character_id, creature_id, kills) select c.id, b.id, 1 where exists (select 1 from creatures where id = b.id) on conflict (character_id, creature_id) do update set kills = character_kills.kills + 1;
    update characters set exp = c.exp, level = c.level, hp = greatest(1, floor(php)), pots = c.pots - npots, kills = kills + 1, last_fight_at = now(), updated_at = now() where id = c.id;
  else
    select * into home from cities order by (case when heart then sqrt(power(greatest(0 - c.x, 0, c.x - 300), 2) + power(greatest(0 - c.y, 0, c.y - 200), 2)) else sqrt(power(c.x - x, 2) + power(c.y - y, 2)) end) limit 1;
    update characters set x = case when home.heart then 52 else home.x end, y = case when home.heart then 42 else home.y + 3 end, pos_at = now(), city_id = home.id, ring = 1, pvp_mode = false,
      hp = greatest(1, floor(pmax * 0.5)), pots = c.pots - npots, deaths = deaths + 1, last_fight_at = now(), updated_at = now() where id = c.id;
  end if;
  insert into boss_attempts(character_id, boss_id, won, rounds, rewards) values (c.id, b.id, won, r, case when won then rew || jsonb_build_object('drops', drops) else null end);
  if won then insert into chat_messages(channel, character_id, name, body) values ('mundo', null, 'Sistema', format('%s derrotou %s!', c.name, b.name)); end if;
  select * into c from characters where id = c.id;
  return jsonb_build_object('won', won, 'rounds', r, 'log', log, 'boss', jsonb_build_object('id', b.id, 'name', b.name, 'hp', bmax, 'level', b.level), 'hp_max', pmax, 'pots', npots,
    'rewards', case when won then rew || jsonb_build_object('drops', drops, 'exp', b.exp) else null end, 'x', c.x, 'y', c.y, 'level', c.level);
end $function$;

-- chat: selo VIP
CREATE OR REPLACE FUNCTION public.get_chat(p_channel text, p_after bigint DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c characters; ch text := p_channel; cl uuid;
begin
  select * into c from characters where user_id = auth.uid(); if c.id is null then return '[]'; end if;
  if p_channel = 'cla' then select clan_id into cl from clan_members where character_id = c.id; if cl is null then return '[]'; end if; ch := 'cla:' || cl::text; end if;
  if p_channel = 'mundo' then ch := 'mundo:' || c.world_id; end if;
  return (select coalesce(jsonb_agg((to_jsonb(x) - 'character_id') || jsonb_build_object('vip', coalesce((select is_vip(ch) from characters ch where ch.id = x.character_id), false)) order by x.id), '[]') from (select * from chat_messages where channel = ch and id > p_after order by id desc limit 60) x);
end $function$;
