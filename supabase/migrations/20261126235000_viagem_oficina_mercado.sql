-- ===================== 1. VIAGEM: só duas formas (a pé grátis ou rápida por diamantes) =====================
-- caçada (coração ou continente) só começa estando na área: nada de teleporte grátis
create or replace function hunt_near(c characters, h hunts) returns boolean language sql stable as $$
  select c.hunt_id is not distinct from h.id or (c.pos_at is not null and c.pos_at > now() - interval '5 minutes'
    and sqrt(power(c.x - ((h.rect ->> 'x')::int + (h.rect ->> 'w')::int / 2), 2) + power(c.y - ((h.rect ->> 'y')::int + (h.rect ->> 'h')::int / 2), 2)) <= greatest((h.rect ->> 'w')::int, (h.rect ->> 'h')::int) / 2 + 30) $$;
-- a viagem antiga entre cidades (gold) passa a ser a mesma viagem rápida: 2 diamantes, cobrados só se acontecer
create or replace function travel_city(p_city text) returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; c characters;
begin
  r := fast_travel('city', p_city);
  select * into c from characters where user_id = auth.uid();
  return jsonb_build_object('x', c.x, 'y', c.y, 'city', (select name from cities where id = p_city), 'cost', r -> 'travel' -> 'cost', 'currency', 'gems') || pvp_view(c);
end $$;

-- ===================== 2. OFICINA DIRETA =====================
alter table recipes add column if not exists simple boolean not null default true;
insert into recipes(id, name, profession_id, kind, req_level, tool, inputs, output, seconds, gold_cost, exp, techniques, description) values
 ('barra_cobre_direta', 'Barra de cobre', 'metalurgia', 'refino', 1, null, '[{"q":2,"t":"minerio_cobre"},{"q":1,"t":"carvao"}]', '{"q":1,"t":"barra_cobre"}', 12, 10, 18, false, 'Minério de cobre + carvão direto na barra.'),
 ('barra_ferro_direta', 'Barra de ferro', 'metalurgia', 'refino', 10, null, '[{"q":2,"t":"minerio_ferro"},{"q":2,"t":"carvao"}]', '{"q":1,"t":"barra_ferro"}', 16, 25, 30, false, 'Minério de ferro + carvão direto na barra.'),
 ('barra_prata_direta', 'Barra de prata', 'metalurgia', 'refino', 20, null, '[{"q":2,"t":"minerio_prata"},{"q":2,"t":"carvao"}]', '{"q":1,"t":"barra_prata"}', 20, 50, 45, false, 'Minério de prata + carvão direto na barra.'),
 ('barra_mitril_direta', 'Barra de mitril', 'metalurgia', 'refino', 40, null, '[{"q":2,"t":"minerio_mitril"},{"q":4,"t":"carvao"}]', '{"q":1,"t":"barra_mitril"}', 40, 1000, 90, false, 'Minério de mitril + carvão direto na barra.'),
 ('barra_adamantita_direta', 'Barra de adamantita', 'metalurgia', 'refino', 55, null, '[{"q":2,"t":"minerio_adamantita"},{"q":6,"t":"carvao"}]', '{"q":1,"t":"barra_adamantita"}', 60, 5500, 140, false, 'Minério de adamantita + carvão direto na barra.'),
 ('forjar_espada', 'Espada', 'ferraria', 'equipamento', 1, 'martelo', '[{"q":3,"cat":"barra"},{"q":1,"cat":"madeira"}]', '{"t":"espada_forjada"}', 30, 40, 30, false, 'Barras + madeira: espada pronta.'),
 ('forjar_picareta', 'Picareta', 'ferraria', 'equipamento', 1, 'martelo', '[{"q":2,"cat":"barra"},{"q":1,"cat":"madeira"}]', '{"t":"picareta_forjada"}', 22, 25, 20, false, 'Barras + madeira: picareta pronta.'),
 ('forjar_machado_lenhador', 'Machado de lenhador', 'ferraria', 'equipamento', 1, 'martelo', '[{"q":2,"cat":"barra"},{"q":1,"cat":"madeira"}]', '{"t":"machado_lenhador_forjado"}', 22, 25, 20, false, 'Barras + madeira: machado pronto.'),
 ('forjar_foice_direta', 'Foice', 'ferraria', 'equipamento', 1, 'martelo', '[{"q":1,"cat":"barra"},{"q":1,"cat":"madeira"}]', '{"t":"foice_forjada"}', 18, 20, 15, false, 'Barra + madeira: foice pronta.'),
 ('forjar_adaga_direta', 'Adaga', 'ferraria', 'equipamento', 5, 'martelo', '[{"q":2,"cat":"barra"},{"q":1,"cat":"madeira"}]', '{"t":"adaga_forjada"}', 20, 30, 25, false, 'Barras + madeira: adaga pronta.'),
 ('forjar_machado_direto', 'Machado de guerra', 'ferraria', 'equipamento', 8, 'martelo', '[{"q":3,"cat":"barra"},{"q":1,"cat":"madeira"}]', '{"t":"machado_forjado"}', 30, 50, 40, false, 'Barras + madeira: machado pronto.'),
 ('forjar_martelo_direto', 'Martelo de guerra', 'ferraria', 'equipamento', 12, 'martelo', '[{"q":3,"cat":"barra"},{"q":1,"cat":"madeira"}]', '{"t":"martelo_forjado"}', 32, 60, 45, false, 'Barras + madeira: martelo pronto.')
on conflict (id) do nothing;

-- espada e picareta direto das barras: ficha de forja própria (a montagem por peças continua igual)
update item_templates set props = props || '{"forge_direct": {"kind": "weapon", "dmg": 1, "dur": 1, "aspd": 1, "crit": 2, "label": "Espada"}}' where id = 'espada_forjada';
update item_templates set props = props || '{"forge_direct": {"kind": "tool", "tool": "picareta", "head": "cabeca", "label": "Picareta"}}' where id = 'picareta_forjada';
CREATE OR REPLACE FUNCTION public.forge_build(p_tpl text, consumed jsonb, avg_p numeric, pl integer, maker text, tool_tier numeric, cid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare t item_templates := (select x from item_templates x where x.id = p_tpl); f jsonb := coalesce(t.props -> 'forge', t.props -> 'forge_direct'); e jsonb; mt jsonb; mp jsonb := '{"power":4,"weight":1,"tough":30,"magic":0}'; gem jsonb := '{}'; gem_t text;
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
    cab := coalesce(parts -> (f ->> 'head'), case when mt is not null then make_part(f ->> 'head', mt ->> 't', avg_p, pl) end);   -- direto das barras: cabeça feita do metal
    res := jsonb_build_object('tool', f ->> 'tool', 'tier', coalesce((cab ->> 'tier')::int, 1), 'eff', round(1 + q / 100 * 0.5, 2), 'speed', round(1 + q / 100 * 0.4 - coalesce((cab ->> 'weight')::numeric, 1) * 0.05, 2), 'dur', round(coalesce((cab ->> 'tough')::numeric, 40) * 3), 'maxdur', round(coalesce((cab ->> 'tough')::numeric, 40) * 3));
    nm := (f ->> 'label') || ' de ' || lower(regexp_replace(coalesce(cab ->> 'mat_name', 'metal'), '^(Barra|Liga) de ', ''));
  end if;
  return res || jsonb_build_object('quality', round(q), 'purity', round(avg_p), 'rarity', rar, 'maker', maker, 'made_at', now(), 'origin', 'Oficina de ' || maker, 'name', nm,
    'components', parts || jsonb_build_object('base', jsonb_build_object('mat', mt ->> 't', 'purity', round(avg_p), 'mat_name', (select name from item_templates where id = mt ->> 't')), 'gem', gem_t));
end $function$;
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
  elsif coalesce((select props ? 'forge' or (props ? 'forge_direct' and not exists (select 1 from jsonb_array_elements(rc.inputs) x where x ? 'part')) from item_templates where id = rc.output ->> 't'), false) then
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
-- etapas intermediárias saem da tela simples (continuam no modo avançado)
update recipes set simple = false where kind in ('componente', 'montagem', 'modular') or id like 'triturar_%' or id in ('fundir_cobre', 'fundir_ferro', 'fundir_prata', 'fundir_mitril', 'fundir_adamantita', 'purificar_barra', 'forjar_adaga', 'forjar_machado', 'forjar_martelo', 'montar_machado_lenhador', 'montar_foice');

-- start_hunt: a regra de presença vale pra todas as caçadas
CREATE OR REPLACE FUNCTION public.start_hunt(p_hunt text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c characters; h hunts;
begin
  perform simulate();
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into h from hunts where id = p_hunt; if h.id is null then raise exception 'hunt inválida'; end if;
  -- a caçada (coração ou continente) começa onde o personagem está: chega a pé (grátis) ou pela viagem rápida (diamantes)
  if not hunt_near(c, h) then
    raise exception 'vá até a área de caça (a pé, grátis) ou use a viagem rápida (% diamantes)', coalesce((cfg('travel_fast') ->> 'gems')::int, 2);
  end if;
  perform end_session(c.id, 'troca');
  insert into hunt_sessions(character_id, hunt_id, behavior) values (c.id, h.id, c.behavior);
  insert into hunt_presence(hunt_id, actor_type, actor_id) values (h.id, 'char', c.id::text) on conflict (hunt_id, actor_type, actor_id) do update set last_active_at = now();
  update characters set hunt_id = h.id, task = 'hunt', x = (h.rect->>'x')::int + 1, y = (h.rect->>'y')::int + 1, last_simulated_at = now(), updated_at = now() where id = c.id;
  return get_state();
end $function$;

-- ===================== 3. MERCADO (modelo Loja do NPC + Mercado da Comunidade) =====================
-- Loja: compra de consumível em quantidade (poção até 9.999), sem taxa. Venda pro NPC continua igual.
-- Comunidade: sem taxa de anúncio; 20 anúncios; um anúncio por item (muda o preço editando, a cada 30 min);
-- depois que um anúncio sai, 30 min pra anunciar o mesmo item; 2 min de retenção + sorteio de 3 s entre quem
-- pedir; trava de preço (paga o menor, recusa se subiu); compra em lote dos mais baratos; comissão paga por quem vende.
update game_config set value = value || '{"max_listings": 20, "listing_fee_pct": 0, "hold_s": 120, "lottery_s": 3, "price_cd_min": 30, "relist_cd_min": 30,
  "fee_gold_pct": 15, "fee_gems_stack_pct": 15, "fee_gems_item_tiers": [[500, 13], [5000, 10], [null, 7.5]], "bulk_max": 500}'::jsonb where key = 'market';
alter table market_listings add column if not exists unit_price bigint, add column if not exists release_at timestamptz, add column if not exists price_changed_at timestamptz, add column if not exists closed_at timestamptz;
create index if not exists market_listings_open_tpl on market_listings(template_id, currency, unit_price) where status = 'aberto';
create or replace function market_closed_at() returns trigger language plpgsql as $$ begin if new.status <> 'aberto' and old.status = 'aberto' then new.closed_at := now(); end if; return new; end $$;
drop trigger if exists market_listings_closed on market_listings;
create trigger market_listings_closed before update of status on market_listings for each row execute function market_closed_at();
create table if not exists market_requests(listing_id uuid not null references market_listings(id) on delete cascade, character_id uuid not null references characters(id) on delete cascade,
  max_price bigint not null, qty int, at timestamptz not null default now(), primary key (listing_id, character_id));
alter table market_requests enable row level security;
drop policy if exists market_requests_own on market_requests; create policy market_requests_own on market_requests for select using (character_id in (select id from characters where user_id = auth.uid()));

-- comissão: ouro 15%; material em gemas 15%; equipamento em gemas por faixa (13% até 500, 10% até 5.000, 7,5% acima).
-- Comércio e o Câmbio do clã continuam dando desconto (o mesmo desconto de antes, em pontos percentuais).
create or replace function market_fee(p_seller uuid, p_currency text, p_price bigint, p_unique boolean) returns bigint language plpgsql stable security definer set search_path = public as $$
declare m jsonb := cfg('market'); disc numeric; f numeric := 0; lo numeric := 0; tier jsonb; cap numeric;
begin
  disc := greatest(0, cfgn('market','sale_fee_pct') - market_fee_pct(p_seller));
  if p_currency = 'gems' and p_unique then
    for tier in select * from jsonb_array_elements(m -> 'fee_gems_item_tiers') loop
      cap := coalesce((tier ->> 0)::numeric, 1e18); if p_price > lo then f := f + (least(p_price, cap) - lo) * (tier ->> 1)::numeric / 100; end if; lo := cap; end loop;
  else f := p_price * (case when p_currency = 'gems' then (m ->> 'fee_gems_stack_pct')::numeric else (m ->> 'fee_gold_pct')::numeric end) / 100; end if;
  return greatest(0, floor(f - p_price * disc / 100))::bigint;
end $$;

-- anunciar (item único ou material). p_price = preço do item, ou preço POR UNIDADE do material.
create or replace function market_list(p_item uuid, p_tpl text, p_purity int, p_qty int, p_price bigint, p_currency text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; n int; t item_templates; tpl text; m jsonb := cfg('market'); last_close timestamptz;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if p_currency not in ('gold','gems') then raise exception 'moeda inválida'; end if;
  if p_price < 1 or p_price > 100000000 then raise exception 'preço inválido'; end if;
  select count(*) into n from market_listings where seller_character_id = c.id and status = 'aberto';
  if n >= (m ->> 'max_listings')::int then raise exception 'você já tem % anúncios abertos (máximo)', n; end if;
  tpl := coalesce(p_tpl, (select template_id from items where id = p_item));
  select * into t from item_templates where id = tpl; if t.id is null then raise exception 'item inválido'; end if;
  if t.category = 'artefato' then raise exception 'artefatos não vão pro mercado'; end if;
  -- um anúncio por item: muda o preço editando o que já existe
  if p_item is null and exists (select 1 from market_listings where seller_character_id = c.id and status = 'aberto' and item_id is null and template_id = tpl and purity = p_purity) then
    raise exception 'você já anuncia esse material: edite o preço do anúncio aberto'; end if;
  select max(closed_at) into last_close from market_listings where seller_character_id = c.id and status <> 'aberto' and template_id = tpl and (p_item is not null or purity = p_purity)
    and (p_item is null or item_id = p_item);
  if last_close > now() - make_interval(mins => (m ->> 'relist_cd_min')::int) then
    raise exception 'esse item saiu do mercado há pouco: pode anunciar de novo em % min', ceil(extract(epoch from last_close + make_interval(mins => (m ->> 'relist_cd_min')::int) - now()) / 60); end if;
  if p_item is not null then
    update inventory set container = 'market', slot = null, updated_at = now() where item_id = p_item and character_id = c.id and container in ('bag','protected');
    if not found then raise exception 'item não está na sua mochila'; end if;
    insert into market_listings(seller_character_id, item_id, price, unit_price, currency, fee_paid, template_id, release_at) values (c.id, p_item, p_price, p_price, p_currency, 0, tpl, now() + make_interval(secs => (m ->> 'hold_s')::int));
  else
    if not t.stackable or t.deprecated or p_qty is null or p_qty < 1 then raise exception 'material inválido'; end if;
    perform stack_take(c.id, tpl, p_purity, p_qty);
    insert into market_listings(seller_character_id, item_id, price, unit_price, currency, fee_paid, template_id, purity, qty, release_at) values (c.id, null, p_price * p_qty, p_price, p_currency, 0, tpl, p_purity, p_qty, now() + make_interval(secs => (m ->> 'hold_s')::int));
  end if;
  return get_state();
end $$;
-- as funções antigas de anunciar passam pelas regras novas (preço total do lote vira preço por unidade)
create or replace function list_item(p_item uuid, p_price bigint, p_currency text default 'gold') returns jsonb language sql security definer set search_path = public as $$ select market_list(p_item, null, null, null, p_price, p_currency) $$;
create or replace function list_stack(p_tpl text, p_purity int, p_qty int, p_price bigint, p_currency text default 'gold') returns jsonb language sql security definer set search_path = public as $$ select market_list(null, p_tpl, p_purity, p_qty, greatest(1, ceil(p_price::numeric / greatest(p_qty, 1)))::bigint, p_currency) $$;

-- mudar o preço (uma vez a cada 30 min por anúncio)
create or replace function market_edit_price(p_listing uuid, p_price bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; l market_listings; cd int := cfgn('market','price_cd_min');
begin
  select * into c from characters where user_id = auth.uid(); if c.id is null then raise exception 'sem personagem'; end if;
  select * into l from market_listings where id = p_listing and seller_character_id = c.id and status = 'aberto' for update; if l.id is null then raise exception 'anúncio não encontrado'; end if;
  if p_price < 1 or p_price > 100000000 then raise exception 'preço inválido'; end if;
  if coalesce(l.price_changed_at, l.created_at) > now() - make_interval(mins => cd) then
    raise exception 'o preço só muda a cada % min (falta % min)', cd, ceil(extract(epoch from coalesce(l.price_changed_at, l.created_at) + make_interval(mins => cd) - now()) / 60); end if;
  update market_listings set unit_price = p_price, price = p_price * coalesce(qty, 1), price_changed_at = now() where id = l.id;
  return get_state();
end $$;

-- execução de uma compra (interna): paga o preço ATUAL, nunca acima do limite que o comprador aceitou
create or replace function market_exec(p_listing uuid, p_buyer uuid, p_qty int, p_max_unit bigint) returns bigint language plpgsql security definer set search_path = public as $$
declare l market_listings; unit bigint; q int; cost bigint; fee bigint; n int; it items;
begin
  select * into l from market_listings where id = p_listing and status = 'aberto' for update; if l.id is null then raise exception 'anúncio já vendido ou cancelado'; end if;
  if l.seller_character_id = p_buyer then raise exception 'é o seu próprio anúncio'; end if;
  unit := coalesce(l.unit_price, l.price / greatest(coalesce(l.qty, 1), 1));
  if unit > p_max_unit then raise exception 'o vendedor aumentou o preço: compra recusada'; end if;
  q := case when l.item_id is null then least(coalesce(p_qty, l.qty), l.qty) else 1 end; if q < 1 then raise exception 'quantidade inválida'; end if;
  cost := case when l.item_id is null then unit * q else l.price end;
  if l.item_id is not null then select count(*) into n from inventory where character_id = p_buyer and container = 'bag'; if n >= 20 then raise exception 'mochila cheia'; end if; end if;
  perform 1 from wallets where character_id = p_buyer for update;
  if balance_of(p_buyer, l.currency) < cost then raise exception '% insuficiente', case when l.currency = 'gems' then 'gemas' else 'gold' end; end if;
  fee := market_fee(l.seller_character_id, l.currency, cost, l.item_id is not null);
  perform pay(p_buyer, l.currency, -cost, 'compra_market', l.id::text); perform pay(l.seller_character_id, l.currency, cost - fee, 'venda_market', l.id::text); perform collect_fee(fee, l.currency, l.id::text);
  if l.item_id is not null then update inventory set character_id = p_buyer, container = 'bag', idx = n, updated_at = now() where item_id = l.item_id; select * into it from items where id = l.item_id;
    update market_listings set status = 'vendido' where id = l.id;
  else perform stack_add(p_buyer, l.template_id, l.purity, q);
    if q >= l.qty then update market_listings set status = 'vendido' where id = l.id; else update market_listings set qty = qty - q, price = unit * (qty - q) where id = l.id; end if; end if;
  insert into market_transactions(listing_id, buyer_id, seller_id, price, fee, currency, template_id, qty, purity, rarity, kind) values (l.id, p_buyer, l.seller_character_id, cost, fee, l.currency, l.template_id, q, l.purity, it.rarity, 'listing');
  perform prof_gain(l.seller_character_id, 'comercio', greatest(1, cost / 200));
  return cost;
end $$;
revoke execute on function market_exec(uuid, uuid, int, bigint) from public, anon, authenticated;

-- sorteio: quem pediu nos 3 s depois da liberação concorre com chance igual; quem perde não paga nada
create or replace function market_resolve(p_listing uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare l market_listings; rq market_requests; me uuid; won boolean := false; was boolean := false;
begin
  select id into me from characters where user_id = auth.uid();
  select * into l from market_listings where id = p_listing for update; if l.id is null then raise exception 'anúncio inválido'; end if;
  if now() < l.release_at + make_interval(secs => cfgn('market','lottery_s')) then return jsonb_build_object('pending', true, 'resolve_at', l.release_at + make_interval(secs => cfgn('market','lottery_s'))); end if;
  was := exists (select 1 from market_requests where listing_id = l.id and character_id = me);
  for rq in select * from market_requests where listing_id = l.id order by random() loop
    begin
      if (select status from market_listings where id = l.id) <> 'aberto' then exit; end if;
      perform market_exec(l.id, rq.character_id, rq.qty, rq.max_price); if rq.character_id = me then won := true; end if;
    exception when others then null; end;   -- sem saldo / preço subiu / mochila cheia: fica de fora
  end loop;
  delete from market_requests where listing_id = l.id;
  return jsonb_build_object('pending', false, 'participated', was, 'won', won, 'state', get_state());
end $$;

-- comprar um anúncio: antes da liberação recusa; nos 3 s do sorteio entra na fila; depois compra direto
create or replace function market_buy(p_listing uuid, p_max_unit bigint, p_qty int default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; l market_listings; lot timestamptz;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into l from market_listings where id = p_listing and status = 'aberto'; if l.id is null then raise exception 'anúncio já vendido ou cancelado'; end if;
  if l.seller_character_id = c.id then raise exception 'é o seu próprio anúncio'; end if;
  lot := coalesce(l.release_at, l.created_at) + make_interval(secs => cfgn('market','lottery_s'));
  if l.release_at > now() then raise exception 'esse anúncio libera em % s', ceil(extract(epoch from l.release_at - now())); end if;
  if now() < lot then
    if balance_of(c.id, l.currency) < coalesce(l.unit_price, l.price) * coalesce(least(p_qty, l.qty), 1) then raise exception '% insuficiente', case when l.currency = 'gems' then 'gemas' else 'gold' end; end if;
    insert into market_requests(listing_id, character_id, max_price, qty) values (l.id, c.id, p_max_unit, p_qty) on conflict (listing_id, character_id) do update set max_price = excluded.max_price, qty = excluded.qty;
    return jsonb_build_object('pending', true, 'resolve_at', lot);
  end if;
  if exists (select 1 from market_requests where listing_id = l.id) then perform market_resolve(l.id); end if;
  perform market_exec(l.id, c.id, p_qty, p_max_unit);
  return jsonb_build_object('pending', false, 'won', true, 'state', get_state());
end $$;
-- a compra antiga (anúncio inteiro) também passa pela retenção e pela trava
create or replace function buy_listing(p_listing uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; l market_listings;
begin select * into l from market_listings where id = p_listing; r := market_buy(p_listing, coalesce(l.unit_price, l.price), l.qty);
  if (r ->> 'pending')::boolean then raise exception 'entrou no sorteio desse anúncio: o resultado sai em 3 s'; end if; return r -> 'state'; end $$;

-- compra em lote: junta os anúncios mais baratos (já liberados) até a quantidade pedida
create or replace function market_buy_bulk(p_tpl text, p_min_purity int, p_qty int, p_max_unit bigint, p_currency text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; l record; got int := 0; spent bigint := 0; k int := 0; take int; cost bigint;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if p_qty < 1 then raise exception 'quantidade inválida'; end if;
  for l in select id, qty, unit_price from market_listings where status = 'aberto' and item_id is null and template_id = p_tpl and currency = p_currency and purity >= coalesce(p_min_purity, 0)
      and unit_price <= p_max_unit and seller_character_id <> c.id and release_at + make_interval(secs => cfgn('market','lottery_s')) <= now()
      order by unit_price, created_at limit cfgn('market','bulk_max') loop
    exit when got >= p_qty; take := least(l.qty, p_qty - got);
    if exists (select 1 from market_requests where listing_id = l.id) then perform market_resolve(l.id); end if;
    begin cost := market_exec(l.id, c.id, take, p_max_unit); got := got + take; spent := spent + cost; k := k + 1;
    exception when others then if sqlerrm like '%insuficiente%' then exit; end if; end;
  end loop;
  if got = 0 then raise exception 'nenhum anúncio liberado até esse preço (ou saldo insuficiente)'; end if;
  return jsonb_build_object('bought', got, 'spent', spent, 'listings', k, 'state', get_state());
end $$;

-- painel: anúncios abertos (com quando liberam), tabela de preços (30 dias), menor anúncio e média de 7 dias
create or replace function market_board() returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select id from characters where user_id = auth.uid())
  select jsonb_build_object('now', now(), 'cfg', cfg('market'),
    'listings', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'template', l.template_id, 'stack', l.item_id is null, 'qty', coalesce(l.qty, 1), 'purity', l.purity,
       'unit', coalesce(l.unit_price, l.price / greatest(coalesce(l.qty, 1), 1)), 'price', l.price, 'currency', l.currency, 'release_at', coalesce(l.release_at, l.created_at),
       'price_changed_at', l.price_changed_at, 'created_at', l.created_at, 'mine', l.seller_character_id = (select id from me), 'seller', ch.name,
       'item', case when l.item_id is not null then (select jsonb_build_object('rarity', i.rarity, 'roll', i.roll) from items i where i.id = l.item_id) end,
       'requested', exists (select 1 from market_requests r where r.listing_id = l.id and r.character_id = (select id from me))) order by l.created_at desc), '[]')
       from market_listings l left join characters ch on ch.id = l.seller_character_id where l.status = 'aberto'),
    'stats', (select coalesce(jsonb_object_agg(k, v), '{}') from (select t.template_id || ':' || t.currency k, jsonb_build_object('avg7', round(sum(t.price)::numeric / nullif(sum(t.qty), 0), 1), 'n7', sum(t.qty)) v
       from market_transactions t where t.created_at > now() - interval '7 days' group by t.template_id, t.currency) s)) $$;
create or replace function market_history(p_tpl text) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('at', t.created_at, 'unit', round(t.price::numeric / greatest(t.qty, 1), 1), 'qty', t.qty, 'currency', t.currency, 'purity', t.purity, 'rarity', t.rarity) order by t.created_at desc), '[]')
  from market_transactions t where t.created_at > now() - interval '30 days' and (p_tpl is null or t.template_id = p_tpl) $$;
grant execute on function market_list(uuid, text, int, int, bigint, text), market_edit_price(uuid, bigint), market_buy(uuid, bigint, int), market_resolve(uuid),
  market_buy_bulk(text, int, int, bigint, text), market_board(), market_history(text) to authenticated;

-- Loja do NPC: poção até 9.999 por compra
CREATE OR REPLACE FUNCTION public.buy_shop(p_tpl text, p_qty integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c characters; t item_templates; g bigint; n int; nid uuid; i int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if c.task <> 'idle' and not (c.x between 2 and 12 and c.y between 2 and 10) then raise exception 'só na capital'; end if;
  select * into t from item_templates where id = p_tpl and price is not null; if t.id is null then raise exception 'item não vendido na loja'; end if;
  p_qty := least(case when p_tpl = 'potion' then 9999 else 20 end, greatest(1, p_qty));   -- poção em quantidade, como consumível de loja
  select gold into g from wallets where character_id = c.id; if g < t.price * p_qty then raise exception 'gold insuficiente'; end if;
  if p_tpl = 'potion' then update characters set pots = pots + p_qty where id = c.id;
  else
    select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n + p_qty > 20 then raise exception 'mochila cheia'; end if;
    for i in 1..p_qty loop nid := roll_item(p_tpl, 'loja', c.id::text || clock_timestamp()::text || i); insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', n + i); end loop;
  end if;
  perform add_gold(c.id, -t.price * p_qty, 'loja', p_tpl);
  return get_state();
end $function$;
