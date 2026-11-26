-- Atributos compactos: 2 pontos por nível (antes 5), base 2 em cada atributo (antes 5).
-- Os coeficientes sobem na mesma proporção (×2,5) e as constantes de retorno decrescente descem (×0,4),
-- então o personagem fica com a MESMA força, só com números menores e menos cliques.
-- Todos os personagens são convertidos proporcionalmente e ganham uma redistribuição grátis.
set search_path = public;
update game_config set value = value || '{"points_per_level":2,"attr_base":2}' where key = 'level';
update game_config set value = value || jsonb_build_object(
  'hp_vit', 30, 'mp_int', 15, 'mp_sab', 10, 'def_res', 3.5, 'matk_int', 3, 'matk_sab', 0.875, 'mdef_sab', 3, 'patk_des', 0.75, 'patk_for', 2.5,
  'carry_for', 12.5, 'regen_sab', 0.25, 'regen_vit', 0.5, 'luck_per_point', 0.005, 'crit_k', 48, 'dodge_k', 60, 'acc_k', 32, 'aspd_k', 80) where key = 'stats';

create or replace function attr_base() returns int language sql stable as $$ select coalesce(cfgn('level','attr_base')::int, 5) $$;
create or replace function attr(c characters, k text) returns numeric language sql stable as $$ select coalesce((c.attrs ->> k)::numeric, attr_base()) $$;
create or replace function points_spent(c characters) returns int language sql stable as $$
  select coalesce((select sum(value::int) from jsonb_each_text(c.attrs)), 8 * attr_base())::int - 8 * attr_base() $$;
create or replace function base_attrs() returns jsonb language sql stable as $$
  select jsonb_build_object('for', attr_base(), 'vit', attr_base(), 'res', attr_base(), 'int', attr_base(), 'agi', attr_base(), 'des', attr_base(), 'sab', attr_base(), 'sor', attr_base()) $$;

-- redistribuição grátis uma vez (dada a todos nesta mudança)
alter table characters add column if not exists free_reset boolean not null default false;
alter table characters alter column attrs set default '{"for":2,"vit":2,"res":2,"int":2,"agi":2,"des":2,"sab":2,"sor":2}';

-- conversão: cada ponto gasto vira 0,4 ponto; se o arredondamento passar do total, tira do maior atributo
do $$ declare r record; na jsonb; tot int; sp int; k text; begin
  for r in select * from characters loop
    na := (select jsonb_object_agg(key, 2 + greatest(0, round((value::numeric - 5) * 0.4))::int) from jsonb_each_text(coalesce(r.attrs, '{}')));
    na := base_attrs() || coalesce(na, '{}');
    tot := (greatest(1, r.level) - 1) * 2;
    loop
      sp := (select sum(value::int) from jsonb_each_text(na)) - 16;
      exit when sp <= tot;
      select key into k from jsonb_each_text(na) order by value::int desc limit 1;
      na := na || jsonb_build_object(k, (na ->> k)::int - 1);
    end loop;
    update characters set attrs = na, free_reset = true where id = r.id;
  end loop;
end $$;

create or replace function spend_points(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; k text; v int; total int := 0; na jsonb;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  na := base_attrs() || c.attrs;
  for k, v in select key, value::int from jsonb_each_text(p) loop
    if k not in ('for','vit','res','int','agi','des','sab','sor') then raise exception 'atributo inválido'; end if;
    if v < 0 then raise exception 'valor inválido'; end if;
    total := total + v; na := na || jsonb_build_object(k, (na ->> k)::int + v);
  end loop;
  if total = 0 then raise exception 'nada pra distribuir'; end if;
  if points_spent(c) + total > points_total(c) then raise exception 'pontos insuficientes'; end if;
  update characters set attrs = na where id = c.id;
  return get_state();
end $$;
create or replace function reset_points() returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; cost bigint; g bigint;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if c.free_reset then cost := 0; else cost := 100 + c.level * 40; end if;
  select gold into g from wallets where character_id = c.id; if g < cost then raise exception 'redistribuir custa % gold', cost; end if;
  if cost > 0 then perform add_gold(c.id, -cost, 'redistribuir_atributos'); end if;
  update characters set attrs = base_attrs(), free_reset = false where id = c.id;
  return get_state();
end $$;

-- sugestão de distribuição por classe (peso de cada atributo)
alter table classes add column if not exists attr_weights jsonb not null default '{}';
update classes c set attr_weights = w.v from (values
 ('aventureiro','{"for":3,"vit":3,"res":2,"agi":1,"des":1}'::jsonb),
 ('guerreiro','{"for":4,"vit":3,"res":3,"agi":1}'),
 ('mago','{"int":5,"sab":3,"vit":2}'),
 ('arqueiro','{"des":4,"for":3,"agi":2,"vit":1}'),
 ('assassino','{"des":4,"agi":4,"for":2}'),
 ('paladino','{"for":3,"vit":3,"res":2,"sab":2,"int":1}'),
 ('necromante','{"int":4,"sab":3,"vit":3}'),
 ('druida','{"int":3,"sab":4,"vit":3}'),
 ('monge','{"agi":4,"for":3,"vit":2,"des":1}'),
 ('invocador','{"int":4,"sab":4,"vit":2}')) w(id, v) where c.id = w.id;

create or replace function stats_of(c characters) returns jsonb language plpgsql stable as $$
declare s jsonb := cfg('stats'); cl classes; lvl int := least(c.level, coalesce(cfgn('level','max')::int, c.level)); f numeric; v numeric; r numeric; i numeric; a numeric; d numeric; w numeric; l numeric; al numeric;
  hp numeric; mp numeric; patk numeric; matk numeric; def numeric; mdef numeric; crit numeric; dodge numeric; acc numeric; aspd numeric; regen numeric; carry numeric; luck numeric; dps numeric; el jsonb;
begin
  select * into cl from classes where id = coalesce(c.class_id, 'aventureiro');
  -- 'todos os atributos' do equipamento vale o mesmo em qualquer escala de pontos
  al := equip_roll(c.id, 'all_stats') * cfgn('level','points_per_level') / 5.0;
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
