-- junta pilhas de purezas diferentes nas receitas por categoria; componente usa pureza média
set search_path = public;
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
      -- categoria: o jogador escolhe o material; sem pureza escolhida, junta pilhas do mesmo material da mais pura pra menos pura
      if ch is null or ch ->> 't' is null then raise exception 'escolha o material da etapa %', k; end if;
      if (select category from item_templates where id = ch ->> 't') <> inp ->> 'cat' then raise exception 'material errado na etapa %', k; end if;
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

grant execute on function balance_sim_node(text,int,int,int,numeric), economy_report() to service_role;
