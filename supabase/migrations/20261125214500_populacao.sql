-- Balanceamento da pressão: população cai mais devagar e recupera mais rápido (duas pessoas colapsavam uma hunt em 30 min).
set search_path = public;
create or replace function world_tick() returns void language plpgsql security definer set search_path = public as $$
declare last timestamptz; mins numeric; r rival_agents; cand hunts; seed text; hid text; n int;
begin
  if not pg_try_advisory_xact_lock(777001) then return; end if;
  select (value #>> '{}')::timestamptz into last from world_meta where key = 'ticked_at';
  if last is null then last := now() - interval '1 minute'; end if;
  mins := extract(epoch from (now() - last)) / 60.0;
  if mins < 1 then return; end if; mins := least(mins, 1440);
  update hunt_state hs set population = least(100, population + mins * (case when exists (select 1 from hunt_presence p where p.hunt_id = hs.hunt_id and p.last_active_at > now() - interval '15 minutes') then 2.5 else 5 end)), updated_at = now() where true;
  update hunt_state set state = case when population >= 80 then 'abundante' when population >= 50 then 'pressionada' when population >= 20 then 'escassa' else 'colapso' end where true;
  update territory_influence set influence = influence * power(0.98, mins), updated_at = now() where true;
  delete from territory_influence where influence < 0.5;
  delete from hunt_presence where last_active_at < now() - interval '2 hours';
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
