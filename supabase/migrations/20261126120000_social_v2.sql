-- sem limite de nível; convite de clã; fundar clã pagando em gold ou gemas
set search_path = public;
update game_config set value = value || '{"max": null}' where key = 'level';
insert into game_config(key, value, note) values ('clan', '{"create_gold": 1000, "create_gems": 10, "min_level": 10, "max_members": 50}', 'custo pra fundar clã (escolhe gold ou gemas)') on conflict (key) do update set value = excluded.value;
create or replace function points_total(c characters) returns int language sql stable as $$ select (greatest(1, c.level) - 1) * cfgn('level','points_per_level')::int $$;

create table if not exists clan_invites (clan_id uuid not null references clans(id) on delete cascade, character_id uuid not null references characters(id) on delete cascade, invited_by uuid references characters(id) on delete set null, created_at timestamptz default now(), primary key (clan_id, character_id));
alter table clan_invites enable row level security;

drop function if exists create_clan(text, text, text);
create or replace function create_clan(p_name text, p_tag text, p_desc text, p_pay text default 'gold') returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; g bigint; gm bigint; cl uuid; k jsonb := cfg('clan');
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if exists (select 1 from clan_members where character_id = c.id) then raise exception 'você já está num clã'; end if;
  if c.level < (k->>'min_level')::int then raise exception 'precisa de level % pra fundar um clã', k->>'min_level'; end if;
  if length(btrim(p_name)) < 3 or length(btrim(p_name)) > 24 then raise exception 'nome do clã: 3 a 24 caracteres'; end if;
  if upper(coalesce(p_tag, '')) !~ '^[A-Z0-9]{2,4}$' then raise exception 'sigla: 2 a 4 letras ou números'; end if;
  select gold, gems into g, gm from wallets where character_id = c.id for update;
  if p_pay = 'gemas' then
    if gm < (k->>'create_gems')::bigint then raise exception 'fundar com gemas custa % gemas', k->>'create_gems'; end if;
    perform add_gems(c.id, -(k->>'create_gems')::bigint, 'fundar_cla', p_name);
  else
    if g < (k->>'create_gold')::bigint then raise exception 'fundar com gold custa % gold', k->>'create_gold'; end if;
    perform add_gold(c.id, -(k->>'create_gold')::bigint, 'fundar_cla', p_name);
  end if;
  insert into clans(name, tag, description, leader) values (btrim(p_name), upper(p_tag), left(coalesce(p_desc, ''), 200), c.id) returning id into cl;
  insert into clan_members(clan_id, character_id, role) values (cl, c.id, 'lider');
  delete from clan_requests where character_id = c.id; delete from clan_invites where character_id = c.id;
  return get_state();
exception when unique_violation then raise exception 'nome ou sigla já em uso';
end $$;
grant execute on function create_clan(text,text,text,text) to authenticated; revoke all on function create_clan(text,text,text,text) from anon;

create or replace function clan_action(p_action text, p_target text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; role text; t characters; myclan uuid; trole text; n int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select clan_id, clan_members.role into myclan, role from clan_members where character_id = c.id;
  if p_action = 'pedir' then
    if myclan is not null then raise exception 'você já está num clã'; end if;
    insert into clan_requests(clan_id, character_id) values (p_target::uuid, c.id) on conflict do nothing;
  elsif p_action in ('aceitar_convite', 'recusar_convite') then
    if not exists (select 1 from clan_invites where clan_id = p_target::uuid and character_id = c.id) then raise exception 'convite não encontrado'; end if;
    if p_action = 'recusar_convite' then delete from clan_invites where clan_id = p_target::uuid and character_id = c.id; return get_state(); end if;
    if myclan is not null then raise exception 'saia do seu clã antes de aceitar'; end if;
    select count(*) into n from clan_members where clan_id = p_target::uuid; if n >= 50 then raise exception 'clã cheio (50)'; end if;
    insert into clan_members(clan_id, character_id) values (p_target::uuid, c.id);
    delete from clan_invites where character_id = c.id; delete from clan_requests where character_id = c.id;
  elsif p_action = 'sair' then
    if myclan is null then raise exception 'você não está num clã'; end if;
    if role = 'lider' then select count(*) into n from clan_members where clan_id = myclan; if n > 1 then raise exception 'passe a liderança antes de sair'; end if; delete from clans where id = myclan;
    else delete from clan_members where character_id = c.id; end if;
  else
    if myclan is null or role = 'membro' then raise exception 'só líder ou oficial'; end if;
    select * into t from characters where name = p_target; if t.id is null then raise exception 'jogador não encontrado'; end if;
    select clan_members.role into trole from clan_members where character_id = t.id and clan_id = myclan;
    if p_action = 'convidar' then
      if t.id = c.id then raise exception 'você já está no clã'; end if;
      if exists (select 1 from clan_members where character_id = t.id) then raise exception '% já está num clã', t.name; end if;
      select count(*) into n from clan_members where clan_id = myclan; if n >= 50 then raise exception 'clã cheio (50)'; end if;
      select count(*) into n from clan_invites where clan_id = myclan; if n >= 30 then raise exception 'convites demais pendentes'; end if;
      insert into clan_invites(clan_id, character_id, invited_by) values (myclan, t.id, c.id) on conflict (clan_id, character_id) do update set created_at = now(), invited_by = excluded.invited_by;
    elsif p_action = 'cancelar_convite' then delete from clan_invites where clan_id = myclan and character_id = t.id;
    elsif p_action = 'aceitar' then
      if not exists (select 1 from clan_requests where clan_id = myclan and character_id = t.id) then raise exception 'sem pedido desse jogador'; end if;
      if exists (select 1 from clan_members where character_id = t.id) then delete from clan_requests where character_id = t.id; raise exception 'ele já entrou em outro clã'; end if;
      select count(*) into n from clan_members where clan_id = myclan; if n >= 50 then raise exception 'clã cheio (50)'; end if;
      insert into clan_members(clan_id, character_id) values (myclan, t.id); delete from clan_requests where character_id = t.id;
    elsif p_action = 'recusar' then delete from clan_requests where clan_id = myclan and character_id = t.id;
    elsif p_action = 'expulsar' then if trole is null or trole = 'lider' or (role = 'oficial' and trole = 'oficial') then raise exception 'não pode expulsar esse membro'; end if; delete from clan_members where character_id = t.id;
    elsif p_action = 'promover' then if role <> 'lider' or trole is null then raise exception 'só o líder promove'; end if; update clan_members set role = 'oficial' where character_id = t.id;
    elsif p_action = 'liderar' then if role <> 'lider' or trole is null then raise exception 'só o líder passa a liderança'; end if; update clan_members set role = 'lider' where character_id = t.id; update clan_members set role = 'oficial' where character_id = c.id; update clans set leader = t.id where id = myclan;
    else raise exception 'ação inválida'; end if;
  end if;
  return get_state();
end $$;

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
    'trades', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'from', f.name, 'to', tt.name, 'mine', t.from_char = c.id, 'offer_gold', t.offer_gold, 'offer_gems', t.offer_gems, 'want_gold', t.want_gold, 'want_gems', t.want_gems, 'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'template', i.template_id, 'rarity', i.rarity, 'roll', i.roll)), '[]') from items i where i.id = any(t.offer_items)), 'created_at', t.created_at) order by t.created_at desc), '[]') from trades t join characters f on f.id = t.from_char join characters tt on tt.id = t.to_char where t.status = 'aberta' and (t.from_char = c.id or t.to_char = c.id)),
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
    'server_time', now()
  ) into out;
  return out;
end $$;

create or replace function simulate() returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e2 drop_entries;
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
  if t1 - t0 > interval '3 minutes' then eff := 0.7; end if;   -- off-line rende menos que presença (doc, seção 10)
  if t1 - t0 > cap then t0 := t1 - cap; end if;
  from_at := t0;
  select * into s from hunt_sessions where character_id = c.id and status = 'ativa' limit 1;
  if s.id is null or c.task <> 'hunt' then
    update characters set hp = hp_max(c), mana = mana_max(c), last_simulated_at = t1 where id = c.id; return null;
  end if;
  select * into h from hunts where id = s.hunt_id; select * into m from creatures where id = h.creature_id; b := s.behavior;
  risky := h.zone in ('conflito','guerra');
  select coalesce(percentile_cont(0.5) within group (order by level), 1) into med from characters where last_seen_at > now() - interval '7 days';
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
    if risky then mult_exp := mult_exp * 1.15; mult_gold := mult_gold * 1.15; end if;   -- zona de conflito paga mais
    kills := floor(least(per_hour * share, cap_kills) * hours * eff * (case b->>'alvo' when 'fraco' then 1.1 when 'raro' then 0.7 else 1 end) * (case b->>'objetivo' when 'materiais' then 0.9 else 1 end) + ht_rand(seed || ':k'));
    if c.level < h.level_min then kills := floor(kills * 0.5); end if;
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
    if gold_gain > 0 then perform add_gold(c.id, gold_gain, 'loot', s.id::text); end if;
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
  if eff < 1 and rep_kills > 0 then rep_events := rep_events || to_jsonb('off-line: rendimento de 70%'::text); end if;
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
  return jsonb_build_object('exp', rep_exp, 'gold', rep_gold, 'gold_out', rep_gold_out, 'kills', rep_kills, 'deaths', rep_deaths, 'pots', rep_pots, 'drops', rep_drops, 'events', rep_events, 'ended', ended, 'offline', eff < 1, 'hours', round(extract(epoch from (t1 - from_at)) / 3600.0, 2));
end $$;

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
    update characters set exp = exp + 40000 where id = c.id; while exists (select 1 from characters where id = c.id and exp >= exp_for(level + 1)) loop update characters set level = level + 1 where id = c.id; end loop;
    insert into world_firsts(id, label, character_id, character_name) values ('guardiao_eldoria', 'Primeiro a derrotar o Ancião da Floresta', c.id, c.name) on conflict (id) do nothing returning true into first;
    insert into account_audit_log(user_id, action, meta) values (c.user_id, 'guardiao_eldoria', jsonb_build_object('first', coalesce(first, false)));
    update mythic_runs set status = 'vencida', result = jsonb_build_object('power', round(pw), 'first', coalesce(first, false)) where id = r.id;
    return jsonb_build_object('win', true, 'first', coalesce(first, false), 'gold', 3000, 'gems', 5, 'exp', 40000, 'state', get_state());
  elsif p_action = 'sair' then update mythic_runs set status = 'abandonada' where id = r.id; return jsonb_build_object('state', get_state());
  end if;
  raise exception 'ação inválida';
end $$;
