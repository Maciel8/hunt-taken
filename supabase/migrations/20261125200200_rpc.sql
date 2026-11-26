-- Hunt Taken · regras do jogo no servidor (RPC security definer). O cliente envia intenção; o servidor calcula tudo.
set search_path = public;

-- ---------- conta e personagem ----------
create or replace function create_character(p_name text, p_vocation text, p_kingdom text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cid uuid; nm text := btrim(p_name);
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if length(nm) < 3 or length(nm) > 14 or nm !~ '^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]*$' then raise exception 'nome inválido: 3 a 14 letras'; end if;
  if not exists (select 1 from vocations where id = p_vocation) then raise exception 'vocação inválida'; end if;
  if not exists (select 1 from kingdoms where id = p_kingdom) then raise exception 'reino inválido'; end if;
  if exists (select 1 from characters where user_id = uid) then raise exception 'esta conta já tem personagem'; end if;
  insert into profiles(user_id, nickname, terms_version, terms_at) values (uid, nm, 'v1', now()) on conflict (user_id) do update set nickname = excluded.nickname;
  insert into characters(user_id, name, vocation, kingdom, hp, mana) values (uid, nm, p_vocation, p_kingdom, 115, 35) returning id into cid;
  insert into wallets(character_id, gold) values (cid, 0);
  perform add_gold(cid, 50, 'inicial');
  insert into account_audit_log(user_id, action, meta) values (uid, 'create_character', jsonb_build_object('name', nm, 'vocation', p_vocation, 'kingdom', p_kingdom));
  return get_state();
exception when unique_violation then raise exception 'nome já em uso';
end $$;

-- ---------- estado consolidado ----------
create or replace function get_state() returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare c characters; out jsonb;
begin
  select * into c from characters where user_id = auth.uid();
  if c.id is null then return jsonb_build_object('character', null); end if;
  select jsonb_build_object(
    'character', (select to_jsonb(c) - 'user_id') || jsonb_build_object('hp_max', hp_max(c), 'mana_max', mana_max(c), 'atk', round(atk_of(c)), 'def', round(def_of(c)), 'power', round(power_of(c)), 'exp_next', exp_for(c.level + 1), 'exp_cur', exp_for(c.level)),
    'gold', (select gold from wallets where character_id = c.id),
    'inventory', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'template', i.template_id, 'rarity', i.rarity, 'roll', i.roll, 'container', inv.container, 'slot', inv.slot, 'value', item_value(i)) order by inv.container, inv.idx), '[]') from inventory inv join items i on i.id = inv.item_id where inv.character_id = c.id),
    'session', (select to_jsonb(s) from hunt_sessions s where s.character_id = c.id and s.status = 'ativa' limit 1),
    'reports', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id desc), '[]') from (select * from session_reports where character_id = c.id and seen = false order by id desc limit 5) r),
    'hunt_state', (select coalesce(jsonb_object_agg(hunt_id, jsonb_build_object('population', round(population), 'state', state)), '{}') from hunt_state),
    'presence', (select coalesce(jsonb_object_agg(hunt_id, n), '{}') from (select hunt_id, count(*) n from hunt_presence where last_active_at > now() - interval '15 minutes' group by hunt_id) p),
    'occupants', (select coalesce(jsonb_agg(jsonb_build_object('hunt_id', p.hunt_id, 'type', p.actor_type, 'id', p.actor_id, 'name', coalesce(r.name, pc.name), 'kingdom', coalesce(r.kingdom, pc.kingdom), 'level', coalesce(r.level, pc.level), 'vocation', coalesce(r.vocation, pc.vocation))), '[]') from hunt_presence p left join rival_agents r on p.actor_type = 'rival' and r.id = p.actor_id left join public_characters pc on p.actor_type = 'char' and pc.id::text = p.actor_id where p.last_active_at > now() - interval '15 minutes'),
    'influence', (select coalesce(jsonb_agg(jsonb_build_object('hunt_id', t.hunt_id, 'type', t.actor_type, 'id', t.actor_id, 'kingdom', t.kingdom, 'influence', round(t.influence))), '[]') from territory_influence t where t.influence > 1),
    'rivals', (select coalesce(jsonb_agg(to_jsonb(r) - 'profile'), '[]') from rival_agents r),
    'events', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from world_events e where e.state = 'ativo' and e.ends_at > now()),
    'median_rival_level', (select percentile_cont(0.5) within group (order by level) from rival_agents),
    'server_time', now()
  ) into out;
  return out;
end $$;

create or replace function set_behavior(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; b jsonb;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  b := c.behavior
    || jsonb_build_object('postura', case when p->>'postura' in ('agressiva','equilibrada','defensiva') then p->>'postura' else c.behavior->>'postura' end)
    || jsonb_build_object('alvo', case when p->>'alvo' in ('forte','fraco','raro','proximo') then p->>'alvo' else c.behavior->>'alvo' end)
    || jsonb_build_object('pocao', least(90, greatest(10, coalesce((p->>'pocao')::int, (c.behavior->>'pocao')::int))))
    || jsonb_build_object('recuo', case when (p->>'recuo')::int in (0,10,20,30) then (p->>'recuo')::int else (c.behavior->>'recuo')::int end)
    || jsonb_build_object('reposicao', case when p->>'reposicao' in ('mochila','pocao','nunca') then p->>'reposicao' else c.behavior->>'reposicao' end)
    || jsonb_build_object('objetivo', case when p->>'objetivo' in ('exp','gold','materiais') then p->>'objetivo' else c.behavior->>'objetivo' end)
    || jsonb_build_object('pots_buy', least(30, greatest(0, coalesce((p->>'pots_buy')::int, coalesce((c.behavior->>'pots_buy')::int, 10)))));
  update characters set behavior = b, updated_at = now() where id = c.id;
  update hunt_sessions set behavior = b where character_id = c.id and status = 'ativa';
  return b;
end $$;

-- ---------- sessões ----------
create or replace function end_session(cid uuid, why text) returns void language plpgsql as $$
begin
  update hunt_sessions set status = 'encerrada', ended_at = now(), totals = totals || jsonb_build_object('motivo', why) where character_id = cid and status = 'ativa';
  delete from hunt_presence where actor_type = 'char' and actor_id = cid::text;
  update characters set hunt_id = null, task = 'idle', x = 8, y = 8 where id = cid;
end $$;

create or replace function start_hunt(p_hunt text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; h hunts;
begin
  perform simulate();
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into h from hunts where id = p_hunt; if h.id is null then raise exception 'hunt inválida'; end if;
  perform end_session(c.id, 'troca');
  insert into hunt_sessions(character_id, hunt_id, behavior) values (c.id, h.id, c.behavior);
  insert into hunt_presence(hunt_id, actor_type, actor_id) values (h.id, 'char', c.id::text) on conflict (hunt_id, actor_type, actor_id) do update set last_active_at = now();
  update characters set hunt_id = h.id, task = 'hunt', x = (h.rect->>'x')::int + 1, y = (h.rect->>'y')::int + 1, last_simulated_at = now(), updated_at = now() where id = c.id;
  return get_state();
end $$;

create or replace function return_home() returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters;
begin
  perform simulate();
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  perform end_session(c.id, 'voltou');
  perform deposit_routine(c.id);
  return get_state();
end $$;

-- vende materiais e repõe poções (automação de depósito)
create or replace function deposit_routine(cid uuid) returns jsonb language plpgsql as $$
declare c characters; sold bigint := 0; n int := 0; want int; g bigint; rec record;
begin
  select * into c from characters where id = cid;
  for rec in select inv.item_id, item_value(i) v from inventory inv join items i on i.id = inv.item_id join item_templates t on t.id = i.template_id where inv.character_id = cid and inv.container = 'bag' and t.mat loop
    delete from inventory where item_id = rec.item_id; delete from items where id = rec.item_id; sold := sold + rec.v; n := n + 1;
  end loop;
  if sold > 0 then perform add_gold(cid, sold, 'venda_npc_auto'); end if;
  select gold into g from wallets where character_id = cid;
  want := least(coalesce((c.behavior->>'pots_buy')::int, 10) - c.pots, (g / 20)::int);
  if want > 0 then perform add_gold(cid, -want * 20, 'pocoes'); update characters set pots = pots + want where id = cid; end if;
  return jsonb_build_object('sold', sold, 'n', n, 'pots', greatest(0, want));
end $$;

-- ---------- simulação ----------
create or replace function simulate() returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c characters; s hunt_sessions; h hunts; m creatures; hs hunt_state; b jsonb; ev record;
  t0 timestamptz; t1 timestamptz; cap interval; chunk interval; hours numeric;
  n_occ int; pf numeric; per_hour numeric; share numeric; atk numeric; def numeric; m_def numeric; dps numeric; ttk numeric; cap_kills numeric;
  kills int; exp_gain bigint; gold_gain bigint; mult_exp numeric := 1; mult_gold numeric := 1; drop_n int; drop_ch numeric; dmg_in numeric; need_pots int; used_pots int;
  danger numeric; deaths int := 0; i int; seed text; lost bigint; rep_exp bigint := 0; rep_gold bigint := 0; rep_kills int := 0; rep_deaths int := 0; rep_pots int := 0; rep_drops jsonb := '[]'; rep_events jsonb := '[]';
  from_at timestamptz; sk text; hits int; dep jsonb; bag_n int; k int; nid uuid; ended boolean := false; r double precision; med numeric;
begin
  select * into c from characters where user_id = auth.uid() for update;
  if c.id is null then return null; end if;
  perform world_tick();
  cap := make_interval(hours => case when c.premium then 24 else 12 end);
  t0 := c.last_simulated_at; t1 := now();
  if t1 - t0 < interval '5 seconds' then return null; end if;
  if t1 - t0 > cap then t0 := t1 - cap; end if;   -- tempo além do limite off-line não conta
  from_at := t0;
  select * into s from hunt_sessions where character_id = c.id and status = 'ativa' limit 1;
  if s.id is null or c.task <> 'hunt' then
    update characters set hp = hp_max(c), mana = mana_max(c), last_simulated_at = t1 where id = c.id; return null;
  end if;
  select * into h from hunts where id = s.hunt_id; select * into m from creatures where id = h.creature_id; b := s.behavior;
  select percentile_cont(0.5) within group (order by level) into med from rival_agents;
  sk := case c.vocation when 'knight' then 'sword' when 'paladin' then 'distance' else 'magic' end;
  while t0 < t1 and not ended loop
    chunk := least(t1 - t0, interval '60 minutes'); hours := extract(epoch from chunk) / 3600.0; seed := s.id::text || ':' || to_char(t0, 'YYYYMMDDHH24MI');
    select * into hs from hunt_state where hunt_id = h.id for update;
    select count(*) into n_occ from hunt_presence where hunt_id = h.id and last_active_at > t0 - interval '15 minutes'; n_occ := greatest(1, n_occ);
    pf := 0.2 + 0.8 * least(100, greatest(0, hs.population)) / 100.0;
    per_hour := h.spawns * 3600000.0 / (h.respawn_ms + 6000) * pf; share := 1.0 / n_occ;
    atk := atk_of(c) * (case b->>'postura' when 'agressiva' then 1.2 when 'defensiva' then 0.85 else 1 end) * (case c.kingdom when 'ash' then 1.05 else 1 end);
    def := def_of(c) * (case b->>'postura' when 'agressiva' then 0.8 when 'defensiva' then 1.3 else 1 end);
    m_def := m.def; dps := greatest(1, atk * 0.9 - m_def); ttk := m.hp / dps * 0.8; cap_kills := 3600.0 / (ttk + 2.0);
    mult_exp := 1; mult_gold := 1;
    for ev in select * from world_events where state = 'ativo' and ends_at > t0 and (hunt_id is null or hunt_id = h.id) loop
      mult_exp := mult_exp * (1 + coalesce((ev.payload->>'exp')::numeric, 0)); mult_gold := mult_gold * (1 + coalesce((ev.payload->>'loot')::numeric, 0));
    end loop;
    if c.level < med then mult_exp := mult_exp * 2; end if;
    if c.kingdom = 'grey' then mult_gold := mult_gold * 1.05; end if;
    if b->>'objetivo' = 'exp' then mult_exp := mult_exp * 1.1; elsif b->>'objetivo' = 'gold' then mult_gold := mult_gold * 1.1; end if;
    kills := floor(least(per_hour * share, cap_kills) * hours * (case b->>'alvo' when 'fraco' then 1.1 when 'raro' then 0.7 else 1 end) * (case b->>'objetivo' when 'materiais' then 0.9 else 1 end) + ht_rand(seed || ':k'));
    if c.level < h.level_min then kills := floor(kills * 0.5); end if;
    -- dano recebido e poções
    dmg_in := greatest(0, m.atk * 1.0 - def) * (ttk / 1.2) * kills;
    need_pots := ceil(dmg_in / (60 + c.level)); used_pots := least(c.pots, need_pots);
    danger := least(0.95, greatest(0.01, (m.level - c.level) * 0.06 + 0.03)) * (case (b->>'recuo')::int when 0 then 1.4 when 10 then 1.2 when 20 then 1.0 else 0.8 end)
              * (case when used_pots < need_pots then 2.5 else 1 end) * (case b->>'postura' when 'defensiva' then 0.6 when 'agressiva' then 1.3 else 1 end) * (case b->>'alvo' when 'forte' then 1.2 else 1 end);
    deaths := floor(hours * danger * 2 + case when ht_rand(seed || ':d') < hours * danger then 1 else 0 end);
    if kills = 0 then deaths := 0; end if;
    kills := floor(kills * (1 - 0.1 * deaths));
    exp_gain := floor(kills * m.exp * mult_exp * (case b->>'alvo' when 'forte' then 1.08 when 'fraco' then 0.9 else 1 end));
    gold_gain := floor(kills * (m.gold_min + m.gold_max) / 2.0 * mult_gold);
    -- drops
    drop_ch := coalesce(m.drop_chance, 0) * coalesce(h.rare, 1) * (case b->>'alvo' when 'raro' then 1.5 else 1 end) * (case b->>'objetivo' when 'materiais' then 1.3 else 1 end);
    drop_n := floor(kills * drop_ch + case when ht_rand(seed || ':dr') < (kills * drop_ch - floor(kills * drop_ch)) then 1 else 0 end);
    select count(*) into bag_n from inventory where character_id = c.id and container = 'bag';
    for i in 1..drop_n loop
      if bag_n >= 20 then rep_events := rep_events || to_jsonb('mochila cheia: drop perdido'::text); exit; end if;
      nid := roll_item(m.drop_item, 'drop:' || h.id, seed || ':item' || i);
      insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', bag_n); bag_n := bag_n + 1;
      rep_drops := rep_drops || jsonb_build_object('template', m.drop_item, 'id', nid);
    end loop;
    -- aplica
    c.exp := c.exp + exp_gain; c.pots := c.pots - used_pots; c.kills := c.kills + kills;
    for i in 1..deaths loop
      lost := floor(c.exp * (case when c.bless then 0.01 else 0.05 end)); c.exp := greatest(0, c.exp - lost); c.bless := false; c.deaths := c.deaths + 1;
      for k in 1..2 loop
        select item_id into nid from inventory where character_id = c.id and container = 'bag' order by random() limit 1;
        if nid is not null then delete from inventory where item_id = nid; delete from items where id = nid; bag_n := bag_n - 1; rep_events := rep_events || to_jsonb('morte: item perdido'::text); end if;
      end loop;
    end loop;
    while c.level > 1 and c.exp < exp_for(c.level) loop c.level := c.level - 1; end loop;
    while c.exp >= exp_for(c.level + 1) loop c.level := c.level + 1; end loop;
    -- skills por uso
    hits := kills * greatest(1, ceil(ttk / 0.8)); c.skill_xp := c.skill_xp || jsonb_build_object(sk, coalesce((c.skill_xp->>sk)::int, 0) + hits, 'shield', coalesce((c.skill_xp->>'shield')::int, 0) + floor(hits * 0.4));
    while (c.skill_xp->>sk)::int >= floor(40 * power(1.1, coalesce((c.skills->>sk)::int, 10) - 10)) loop
      c.skill_xp := c.skill_xp || jsonb_build_object(sk, (c.skill_xp->>sk)::int - floor(40 * power(1.1, coalesce((c.skills->>sk)::int, 10) - 10))); c.skills := c.skills || jsonb_build_object(sk, coalesce((c.skills->>sk)::int, 10) + 1);
    end loop;
    while (c.skill_xp->>'shield')::int >= floor(40 * power(1.1, coalesce((c.skills->>'shield')::int, 10) - 10)) loop
      c.skill_xp := c.skill_xp || jsonb_build_object('shield', (c.skill_xp->>'shield')::int - floor(40 * power(1.1, coalesce((c.skills->>'shield')::int, 10) - 10))); c.skills := c.skills || jsonb_build_object('shield', coalesce((c.skills->>'shield')::int, 10) + 1);
    end loop;
    if gold_gain > 0 then perform add_gold(c.id, gold_gain, 'loot', s.id::text); end if;
    -- mundo: população, presença, influência
    update hunt_state set population = greatest(0, population - kills * 0.25), updated_at = t0 + chunk where hunt_id = h.id;
    insert into hunt_presence(hunt_id, actor_type, actor_id, last_active_at, contribution) values (h.id, 'char', c.id::text, t0 + chunk, kills)
      on conflict (hunt_id, actor_type, actor_id) do update set last_active_at = t0 + chunk, contribution = hunt_presence.contribution + kills;
    insert into territory_influence(hunt_id, actor_type, actor_id, kingdom, influence) values (h.id, 'char', c.id::text, c.kingdom, least(100, kills * 0.5))
      on conflict (hunt_id, actor_type, actor_id) do update set influence = least(100, territory_influence.influence + kills * 0.5), updated_at = now();
    rep_exp := rep_exp + exp_gain; rep_gold := rep_gold + gold_gain; rep_kills := rep_kills + kills; rep_deaths := rep_deaths + deaths; rep_pots := rep_pots + used_pots;
    -- reposição
    if (bag_n >= 20 and b->>'reposicao' = 'mochila') or (c.pots = 0 and used_pots < need_pots and b->>'reposicao' in ('mochila','pocao')) then
      update characters set pots = c.pots, exp = c.exp, level = c.level where id = c.id;
      dep := deposit_routine(c.id); select pots into c.pots from characters where id = c.id;
      rep_events := rep_events || to_jsonb(format('depósito: vendeu %s materiais por %s gold, comprou %s poções', dep->>'n', dep->>'sold', dep->>'pots'));
      if c.pots = 0 and b->>'reposicao' <> 'nunca' then ended := true; rep_events := rep_events || to_jsonb('sem poção e sem gold: caça encerrada'::text); end if;
    end if;
    if deaths > 0 and (b->>'recuo')::int > 0 and ht_rand(seed || ':rt') < 0.3 then ended := true; rep_events := rep_events || to_jsonb('recuo após morte: caça encerrada'::text); end if;
    t0 := t0 + chunk;
  end loop;
  update characters set exp = c.exp, level = c.level, pots = c.pots, bless = c.bless, kills = c.kills, deaths = c.deaths, skills = c.skills, skill_xp = c.skill_xp,
    hp = greatest(1, floor(hp_max(c) * (case when rep_deaths > 0 then 0.6 else 0.9 end))), mana = mana_max(c), last_simulated_at = t1, updated_at = now() where id = c.id;
  update hunt_sessions set totals = jsonb_build_object('exp', (totals->>'exp')::bigint + rep_exp, 'gold', (totals->>'gold')::bigint + rep_gold, 'kills', (totals->>'kills')::int + rep_kills, 'deaths', (totals->>'deaths')::int + rep_deaths, 'pots', (totals->>'pots')::int + rep_pots, 'drops', (totals->>'drops')::int + jsonb_array_length(rep_drops)) where id = s.id;
  insert into session_reports(session_id, character_id, from_at, to_at, exp, gold_in, gold_out, kills, deaths, pots, drops, events, seen)
    values (s.id, c.id, from_at, t1, rep_exp, rep_gold, 0, rep_kills, rep_deaths, rep_pots, rep_drops, rep_events, (t1 - from_at) < interval '2 minutes');
  if ended then perform end_session(c.id, 'auto'); end if;
  return jsonb_build_object('exp', rep_exp, 'gold', rep_gold, 'kills', rep_kills, 'deaths', rep_deaths, 'pots', rep_pots, 'drops', rep_drops, 'events', rep_events, 'ended', ended, 'hours', round(extract(epoch from (t1 - from_at)) / 3600.0, 2));
end $$;

-- ---------- mundo vivo: recuperação, rivais, eventos ----------
create or replace function world_tick() returns void language plpgsql security definer set search_path = public as $$
declare last timestamptz; mins numeric; r rival_agents; cand hunts; seed text; hid text; n int;
begin
  if not pg_try_advisory_xact_lock(777001) then return; end if;
  select (value #>> '{}')::timestamptz into last from world_meta where key = 'ticked_at';
  if last is null then last := now() - interval '1 minute'; end if;
  mins := extract(epoch from (now() - last)) / 60.0;
  if mins < 1 then return; end if; mins := least(mins, 1440);
  -- população recupera: 2/min vazia, 0.8/min com gente
  update hunt_state hs set population = least(100, population + mins * (case when exists (select 1 from hunt_presence p where p.hunt_id = hs.hunt_id and p.last_active_at > now() - interval '15 minutes') then 0.8 else 2 end)),
    state = case when population >= 80 then 'abundante' when population >= 50 then 'pressionada' when population >= 20 then 'escassa' else 'colapso' end, updated_at = now() where true;
  update hunt_state set state = case when population >= 80 then 'abundante' when population >= 50 then 'pressionada' when population >= 20 then 'escassa' else 'colapso' end where true;
  -- influência decai 2%/min e some quando ninguém está lá
  update territory_influence set influence = influence * power(0.98, mins), updated_at = now() where true;
  delete from territory_influence where influence < 0.5;
  delete from hunt_presence where last_active_at < now() - interval '2 hours';
  -- rivais: entram e saem de hunts pelo level e perfil; sobem 1 level a cada 6 h
  for r in select * from rival_agents loop
    seed := r.id || ':' || to_char(now(), 'YYYYMMDDHH24');
    if extract(epoch from (now() - coalesce(r.since, now()))) / 3600 >= 6 and ht_rand(seed || ':lvl') < 0.5 then update rival_agents set level = level + 1 where id = r.id; end if;
    if r.hunt_id is not null then
      if ht_rand(seed || ':leave') < 0.25 * mins / 60 then update rival_agents set hunt_id = null, state = 'idle', since = now() where id = r.id; delete from hunt_presence where actor_type = 'rival' and actor_id = r.id; end if;
      update hunt_presence set last_active_at = now(), contribution = contribution + 3 * mins where hunt_id = r.hunt_id and actor_type = 'rival' and actor_id = r.id;
      insert into territory_influence(hunt_id, actor_type, actor_id, kingdom, influence) values (r.hunt_id, 'rival', r.id, r.kingdom, least(100, mins * 1.5 * coalesce((r.profile->>'agress')::numeric, 0.5)))
        on conflict (hunt_id, actor_type, actor_id) do update set influence = least(100, territory_influence.influence + mins * 1.5 * coalesce((r.profile->>'agress')::numeric, 0.5)), updated_at = now();
    elsif ht_rand(seed || ':enter') < 0.5 * mins / 60 + 0.05 then
      select h.* into cand from hunts h join creatures m on m.id = h.creature_id where abs(m.level - r.level) <= 15 order by (case when h.region = r.profile->>'pref' then 0 else 1 end), ht_rand(seed || h.id) limit 1;
      if cand.id is not null then
        update rival_agents set hunt_id = cand.id, state = 'hunt', since = now() where id = r.id;
        insert into hunt_presence(hunt_id, actor_type, actor_id) values (cand.id, 'rival', r.id) on conflict (hunt_id, actor_type, actor_id) do update set last_active_at = now();
      end if;
    end if;
  end loop;
  -- eventos locais: um novo a cada ~3 h em média, duram 30 a 90 min
  update world_events set state = 'encerrado' where state = 'ativo' and ends_at <= now();
  select count(*) into n from world_events where state = 'ativo' and hunt_id is not null;
  if n < 2 and ht_rand('ev:' || to_char(now(), 'YYYYMMDDHH24MI')) < mins / 180.0 then
    select id into hid from hunts order by ht_rand('evh:' || to_char(now(), 'YYYYMMDDHH24MI') || id) limit 1;
    insert into world_events(type, hunt_id, ends_at, payload) select t.type, hid, now() + (30 + floor(ht_rand('evd' || hid) * 60)) * interval '1 minute', t.payload
      from (values ('ninho', '{"name":"Ninho descoberto","loot":0.5,"exp":0}'::jsonb), ('tesouro', '{"name":"Tesouro enterrado","loot":0.3,"exp":0.1}'::jsonb), ('lua', '{"name":"Lua de sangue","exp":0.4,"loot":0.3,"risco":1.5}'::jsonb), ('migracao', '{"name":"Migração","exp":-0.3,"loot":-0.3}'::jsonb)) as t(type, payload)
      order by ht_rand('evt:' || to_char(now(), 'YYYYMMDDHH24MI')) limit 1;
  end if;
  insert into world_meta(key, value, updated_at) values ('ticked_at', to_jsonb(now()), now()) on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

-- ---------- inventário, loja, mercado ----------
create or replace function equip_item(p_item uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; it items; t item_templates; old uuid;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select i.* into it from items i join inventory inv on inv.item_id = i.id where i.id = p_item and inv.character_id = c.id and inv.container in ('bag','protected');
  if it.id is null then raise exception 'item não está na sua mochila'; end if;
  select * into t from item_templates where id = it.template_id;
  if t.slot is null then raise exception 'não equipável'; end if;
  if t.voc is not null and not (c.vocation = any(t.voc)) then raise exception 'outra vocação'; end if;
  select item_id into old from inventory where character_id = c.id and container = 'equip' and slot = t.slot;
  if old is not null then update inventory set container = 'bag', slot = null, updated_at = now() where item_id = old; end if;
  update inventory set container = 'equip', slot = t.slot, updated_at = now() where item_id = p_item;
  return get_state();
end $$;
create or replace function unequip_item(p_slot text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; n int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n >= 20 then raise exception 'mochila cheia'; end if;
  update inventory set container = 'bag', slot = null, updated_at = now() where character_id = c.id and container = 'equip' and slot = p_slot;
  return get_state();
end $$;
create or replace function protect_item(p_item uuid, p_on boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; n int;
begin
  select * into c from characters where user_id = auth.uid(); if c.id is null then raise exception 'sem personagem'; end if;
  if p_on then select count(*) into n from inventory where character_id = c.id and container = 'protected'; if n >= 5 then raise exception 'só 5 itens protegidos'; end if; end if;
  update inventory set container = case when p_on then 'protected' else 'bag' end, updated_at = now() where item_id = p_item and character_id = c.id and container in ('bag','protected');
  return get_state();
end $$;
create or replace function sell_npc(p_item uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; it items; v bigint;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select i.* into it from items i join inventory inv on inv.item_id = i.id where i.id = p_item and inv.character_id = c.id and inv.container in ('bag','protected');
  if it.id is null then raise exception 'item não está na sua mochila'; end if;
  v := item_value(it); delete from inventory where item_id = p_item; delete from items where id = p_item;
  perform add_gold(c.id, v, 'venda_npc', p_item::text);
  return get_state();
end $$;
create or replace function buy_shop(p_tpl text, p_qty int default 1) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; t item_templates; g bigint; n int; nid uuid; i int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if c.task <> 'idle' and not (c.x between 2 and 12 and c.y between 2 and 10) then raise exception 'só na capital'; end if;
  select * into t from item_templates where id = p_tpl and price is not null; if t.id is null then raise exception 'item não vendido na loja'; end if;
  p_qty := least(50, greatest(1, p_qty));
  select gold into g from wallets where character_id = c.id; if g < t.price * p_qty then raise exception 'gold insuficiente'; end if;
  if p_tpl = 'potion' then update characters set pots = pots + p_qty where id = c.id;
  else
    select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n + p_qty > 20 then raise exception 'mochila cheia'; end if;
    for i in 1..p_qty loop nid := roll_item(p_tpl, 'loja', c.id::text || clock_timestamp()::text || i); insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', n + i); end loop;
  end if;
  perform add_gold(c.id, -t.price * p_qty, 'loja', p_tpl);
  return get_state();
end $$;
create or replace function buy_bless() returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; g bigint;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if c.task <> 'idle' then raise exception 'só na capital'; end if;
  if c.bless then raise exception 'já tem bênção'; end if;
  select gold into g from wallets where character_id = c.id; if g < 200 then raise exception 'gold insuficiente'; end if;
  perform add_gold(c.id, -200, 'bencao'); update characters set bless = true where id = c.id;
  return get_state();
end $$;
create or replace function list_item(p_item uuid, p_price bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; n int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if p_price < 1 or p_price > 100000000 then raise exception 'preço inválido'; end if;
  select count(*) into n from market_listings where seller_character_id = c.id and status = 'aberto'; if n >= 10 then raise exception 'máximo de 10 anúncios'; end if;
  update inventory set container = 'market', slot = null, updated_at = now() where item_id = p_item and character_id = c.id and container in ('bag','protected');
  if not found then raise exception 'item não está na sua mochila'; end if;
  insert into market_listings(seller_character_id, item_id, price) values (c.id, p_item, p_price);
  return get_state();
end $$;
create or replace function cancel_listing(p_listing uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; l market_listings;
begin
  select * into c from characters where user_id = auth.uid(); if c.id is null then raise exception 'sem personagem'; end if;
  select * into l from market_listings where id = p_listing and seller_character_id = c.id and status = 'aberto' for update; if l.id is null then raise exception 'anúncio não encontrado'; end if;
  update market_listings set status = 'cancelado' where id = l.id; update inventory set container = 'bag', updated_at = now() where item_id = l.item_id;
  return get_state();
end $$;
create or replace function buy_listing(p_listing uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; l market_listings; g bigint; fee bigint; n int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into l from market_listings where id = p_listing and status = 'aberto' for update; if l.id is null then raise exception 'anúncio já vendido ou cancelado'; end if;
  if l.seller_character_id = c.id then raise exception 'é o seu próprio anúncio'; end if;
  select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n >= 20 then raise exception 'mochila cheia'; end if;
  select gold into g from wallets where character_id = c.id; if g < l.price then raise exception 'gold insuficiente'; end if;
  fee := floor(l.price * 0.05);
  perform add_gold(c.id, -l.price, 'compra_market', l.id::text);
  if l.seller_character_id is not null then perform add_gold(l.seller_character_id, l.price - fee, 'venda_market', l.id::text); end if;
  update market_listings set status = 'vendido' where id = l.id;
  delete from inventory where item_id = l.item_id;
  insert into inventory(item_id, character_id, container, idx) values (l.item_id, c.id, 'bag', n);
  insert into market_transactions(listing_id, buyer_id, seller_id, price, fee) values (l.id, c.id, l.seller_character_id, l.price, fee);
  return get_state();
end $$;
create or replace function market_view() returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'price', l.price, 'item', jsonb_build_object('id', i.id, 'template', i.template_id, 'rarity', i.rarity, 'roll', i.roll, 'value', item_value(i)),
    'seller', coalesce(r.name, pc.name), 'seller_kingdom', coalesce(r.kingdom, pc.kingdom), 'mine', (pc.id = (select id from characters where user_id = auth.uid())), 'created_at', l.created_at) order by l.created_at desc), '[]')
  from market_listings l join items i on i.id = l.item_id left join rival_agents r on r.id = l.seller_rival_id left join public_characters pc on pc.id = l.seller_character_id where l.status = 'aberto' and l.expires_at > now() $$;
create or replace function mark_reports_seen() returns void language sql security definer set search_path = public as $$
  update session_reports set seen = true where character_id = (select id from characters where user_id = auth.uid()) and seen = false $$;

-- desafio de hunt contra rival (fase 4 simplificada: poder + sorte, cooldown, proteção de iniciante)
create or replace function challenge_rival(p_rival text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; r rival_agents; pw numeric; rw numeric; win boolean; stolen bigint; g bigint;
begin
  perform simulate();
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into r from rival_agents where id = p_rival for update; if r.id is null then raise exception 'rival inválido'; end if;
  if c.hunt_id is null or r.hunt_id <> c.hunt_id then raise exception 'esse rival não está na sua hunt'; end if;
  if r.kingdom = c.kingdom then raise exception 'mesmo reino não se desafia'; end if;
  if c.level < 10 then raise exception 'abaixo do level 10 não se desafia'; end if;
  if (r.state = 'imune' and r.since > now() - interval '15 minutes') then raise exception 'rival protegido por 15 min'; end if;
  pw := power_of(c) * (1 + coalesce((select influence from territory_influence where hunt_id = c.hunt_id and actor_type = 'char' and actor_id = c.id::text), 0) / 400.0) * (0.9 + ht_rand(c.id::text || clock_timestamp()::text) * 0.2);
  rw := rival_power(r) * (1 + coalesce((select influence from territory_influence where hunt_id = c.hunt_id and actor_type = 'rival' and actor_id = r.id), 0) / 400.0) * (0.9 + ht_rand(r.id || clock_timestamp()::text) * 0.2);
  win := pw > rw;
  if win then
    stolen := 30 + r.level * 4; perform add_gold(c.id, stolen, 'hunt_taken', r.id);
    update rival_agents set hunt_id = null, state = 'imune', since = now() where id = r.id; delete from hunt_presence where actor_type = 'rival' and actor_id = r.id;
    update territory_influence set influence = influence * 0.5 where hunt_id = c.hunt_id and actor_type = 'rival' and actor_id = r.id;
    insert into account_audit_log(user_id, action, meta) values (c.user_id, 'challenge_win', jsonb_build_object('rival', r.id, 'gold', stolen));
    return jsonb_build_object('win', true, 'gold', stolen, 'state', get_state());
  else
    select gold into g from wallets where character_id = c.id; stolen := floor(g * 0.1); if stolen > 0 then perform add_gold(c.id, -stolen, 'expulso', r.id); end if;
    update characters set exp = greatest(0, exp - floor(exp * 0.01)) where id = c.id;
    perform end_session(c.id, 'expulso');
    update territory_influence set influence = influence * 0.5 where hunt_id = r.hunt_id and actor_type = 'char' and actor_id = c.id::text;
    insert into account_audit_log(user_id, action, meta) values (c.user_id, 'challenge_loss', jsonb_build_object('rival', r.id, 'gold', stolen));
    return jsonb_build_object('win', false, 'gold', stolen, 'state', get_state());
  end if;
end $$;

-- permissões: só usuários logados chamam RPC
revoke all on function create_character(text,text,text), get_state(), set_behavior(jsonb), start_hunt(text), return_home(), simulate(), world_tick(), equip_item(uuid), unequip_item(text), protect_item(uuid,boolean), sell_npc(uuid), buy_shop(text,int), buy_bless(), list_item(uuid,bigint), cancel_listing(uuid), buy_listing(uuid), market_view(), mark_reports_seen(), challenge_rival(text) from public, anon;
grant execute on function create_character(text,text,text), get_state(), set_behavior(jsonb), start_hunt(text), return_home(), simulate(), equip_item(uuid), unequip_item(text), protect_item(uuid,boolean), sell_npc(uuid), buy_shop(text,int), buy_bless(), list_item(uuid,bigint), cancel_listing(uuid), buy_listing(uuid), market_view(), mark_reports_seen(), challenge_rival(text) to authenticated;
-- helpers internos não ficam expostos
revoke all on function add_gold(uuid,bigint,text,text), roll_item(text,text,text), deposit_routine(uuid), end_session(uuid,text) from public, anon, authenticated;
