-- Expansão, fase 1: atributos, classes, especializações, habilidades, fórmulas configuráveis, nível máximo 100.
set search_path = public;

-- ---------- configuração central (balanceamento sem mexer no código) ----------
create table if not exists game_config (key text primary key, value jsonb not null, note text, updated_at timestamptz default now());
alter table game_config enable row level security;
drop policy if exists game_config_read on game_config; create policy game_config_read on game_config for select to authenticated using (true);
create or replace function cfg(k text) returns jsonb language sql stable as $$ select value from game_config where key = k $$;
create or replace function cfgn(k text, f text) returns numeric language sql stable as $$ select (value ->> f)::numeric from game_config where key = k $$;

insert into game_config(key, value, note) values
 ('level', '{"max": 100, "points_per_level": 5, "class_level": 5, "spec_level": 30}', 'nível máximo convencional, pontos por nível, níveis de classe e especialização'),
 ('stats', '{"hp_base":100,"hp_vit":12,"mp_base":30,"mp_int":6,"mp_sab":4,"patk_for":1.0,"patk_des":0.3,"matk_int":1.2,"matk_sab":0.35,"atk_lvl":0.8,"def_res":1.4,"def_lvl":0.6,"mdef_sab":1.2,"crit_cap":40,"crit_k":120,"dodge_cap":30,"dodge_k":150,"acc_base":85,"acc_k":80,"aspd_k":200,"regen_vit":0.2,"regen_sab":0.1,"carry_base":100,"carry_for":5,"luck_cap":0.25,"luck_per_point":0.002}', 'fórmulas de atributos com retorno decrescente'),
 ('rarities', '[{"id":0,"name":"Comum","color":"#a8a8a8","mult":1.0},{"id":1,"name":"Incomum","color":"#5bd16b","mult":1.12},{"id":2,"name":"Raro","color":"#4f8cff","mult":1.28},{"id":3,"name":"Épico","color":"#a35bff","mult":1.5},{"id":4,"name":"Lendário","color":"#ffbf3a","mult":1.8},{"id":5,"name":"Mítico","color":"#ff4a4a","mult":2.2},{"id":6,"name":"Divino","color":"#3fe6ff","mult":2.7},{"id":7,"name":"Primordial","color":"#ff3fd2","mult":3.4}]', 'raridades e cores'),
 ('item_rarity_roll', '[0.60,0.25,0.10,0.01,0.001,0.0001,0.00001,0.000001]', 'chance de referência por raridade em drops de criatura (o resto cai em Comum)')
on conflict (key) do update set value = excluded.value, note = excluded.note, updated_at = now();

-- ---------- classes, especializações e habilidades ----------
create table if not exists classes (id text primary key, name text not null, role text not null, dmg_type text not null default 'fisico', description text, hp_lvl numeric not null default 10, mp_lvl numeric not null default 5, def_mul numeric not null default 1, weapons text[] not null default '{}', pros text, cons text, sprite text not null default 'knight');
create table if not exists class_specializations (id text primary key, class_id text not null references classes(id), name text not null, req_level int not null default 30, description text);
create table if not exists skills (id text primary key, class_id text references classes(id), spec_id text references class_specializations(id), name text not null, kind text not null check (kind in ('ativa','passiva')), req_level int not null default 1, cooldown_s int default 0, effect jsonb not null default '{}', description text);
alter table classes enable row level security; alter table class_specializations enable row level security; alter table skills enable row level security;
do $$ declare t text; begin foreach t in array array['classes','class_specializations','skills'] loop execute format('drop policy if exists "read_%s" on %I', t, t); execute format('create policy "read_%s" on %I for select to authenticated using (true)', t, t); end loop; end $$;

insert into classes(id, name, role, dmg_type, description, hp_lvl, mp_lvl, def_mul, weapons, pros, cons, sprite) values
 ('aventureiro','Aventureiro','iniciante','fisico','Ainda sem classe. Escolhe uma no nível 5.',10,6,1,'{espada,machado,arco,cajado,adaga}','Usa qualquer arma básica','Sem habilidades de classe','knight'),
 ('guerreiro','Guerreiro','tanque e dano corpo a corpo','fisico','Linha de frente. Muita vida e defesa.',16,4,1.25,'{espada,machado,martelo,escudo}','Aguenta muito dano','Lento e sem magia','knight'),
 ('mago','Mago','dano mágico à distância','magico','Dano alto em área, frágil.',6,22,0.75,'{cajado,varinha,tomo}','Maior dano mágico','Pouca vida','sorcerer'),
 ('arqueiro','Arqueiro','dano físico à distância','fisico','Ataca de longe com precisão.',10,8,0.95,'{arco,besta}','Crítico e alcance','Fraco cercado','paladin'),
 ('assassino','Assassino','dano explosivo','fisico','Esquiva e críticos altos.',9,8,0.85,'{adaga,garra}','Críticos devastadores','Pouca defesa','paladin'),
 ('paladino','Paladino','híbrido sagrado','misto','Defende e cura com fé.',14,12,1.15,'{espada,martelo,escudo}','Equilibrado e resistente','Dano médio','knight'),
 ('necromante','Necromante','magia sombria','magico','Drena vida e comanda mortos.',8,18,0.8,'{cajado,foice}','Sustenta a si mesmo','Lento no começo','sorcerer'),
 ('druida','Druida','natureza e suporte','magico','Cura e magia da natureza.',9,18,0.85,'{cajado,varinha}','Regeneração alta','Dano moderado','druid'),
 ('monge','Monge','corpo a corpo ágil','fisico','Golpes rápidos e esquiva.',12,10,1.0,'{punhos,bastao}','Velocidade de ataque','Sem armas pesadas','druid'),
 ('invocador','Invocador','criaturas aliadas','magico','Luta com invocações.',8,20,0.8,'{cajado,orbe}','Dano constante','Frágil sozinho','sorcerer')
on conflict (id) do update set name = excluded.name, role = excluded.role, dmg_type = excluded.dmg_type, description = excluded.description, hp_lvl = excluded.hp_lvl, mp_lvl = excluded.mp_lvl, def_mul = excluded.def_mul, weapons = excluded.weapons, pros = excluded.pros, cons = excluded.cons, sprite = excluded.sprite;

insert into class_specializations(id, class_id, name, req_level, description) values
 ('berserker','guerreiro','Berserker',30,'Troca defesa por fúria'),('cavaleiro','guerreiro','Cavaleiro',30,'Escudo e montaria'),('tita','guerreiro','Titã',30,'Vida colossal'),
 ('arquimago','mago','Arquimago',30,'Dano mágico puro'),('elementalista','mago','Elementalista',30,'Fogo, gelo e raio'),
 ('atirador','arqueiro','Atirador',30,'Críticos de longe'),('cacador_sombrio','arqueiro','Caçador Sombrio',30,'Venenos e armadilhas'),
 ('ninja','assassino','Ninja',30,'Esquiva extrema'),('ceifador','assassino','Ceifador',30,'Execução de alvos feridos'),
 ('templario','paladino','Templário',30,'Ataque sagrado'),('guardiao_divino','paladino','Guardião Divino',30,'Proteção e cura'),
 ('lich','necromante','Lich',30,'Magia de morte'),('senhor_almas','necromante','Senhor das Almas',30,'Exército de mortos'),
 ('xama','druida','Xamã',30,'Totens e raios'),('guardiao_ancestral','druida','Guardião Ancestral',30,'Forma de urso'),
 ('mestre_marcial','monge','Mestre Marcial',30,'Combos'),('iluminado','monge','Iluminado',30,'Chi e cura'),
 ('domador','invocador','Domador',30,'Feras aliadas'),('mestre_astral','invocador','Mestre Astral',30,'Entidades astrais')
on conflict (id) do update set name = excluded.name, class_id = excluded.class_id, description = excluded.description;

-- efeitos: patk_pct, matk_pct, def_pct, hp_pct, crit, dodge, aspd_pct, dps_mult (ativas: multiplicador médio de dano no combate automático), regen_pct
insert into skills(id, class_id, spec_id, name, kind, req_level, cooldown_s, effect, description) values
 ('g_golpe','guerreiro',null,'Golpe Esmagador','ativa',5,8,'{"dps_mult":0.12}','Golpe pesado a cada 8 s'),
 ('g_pele','guerreiro',null,'Pele de Ferro','passiva',10,0,'{"def_pct":12,"hp_pct":8}','Mais defesa e vida'),
 ('g_grito','guerreiro',null,'Grito de Guerra','ativa',20,20,'{"dps_mult":0.08,"def_pct":5}','Aumenta dano e defesa'),
 ('m_bola','mago',null,'Bola de Fogo','ativa',5,6,'{"dps_mult":0.18}','Explosão em área'),
 ('m_mente','mago',null,'Mente Arcana','passiva',10,0,'{"matk_pct":12}','Mais dano mágico'),
 ('m_escudo','mago',null,'Escudo de Mana','passiva',20,0,'{"def_pct":15}','Mana absorve dano'),
 ('a_tiro','arqueiro',null,'Tiro Certeiro','ativa',5,7,'{"dps_mult":0.12,"crit":4}','Disparo preciso'),
 ('a_olho','arqueiro',null,'Olho de Águia','passiva',10,0,'{"crit":6,"aspd_pct":5}','Crítico e cadência'),
 ('s_lamina','assassino',null,'Lâmina Oculta','ativa',5,6,'{"dps_mult":0.1,"crit":8}','Ataque furtivo'),
 ('s_sombra','assassino',null,'Passo das Sombras','passiva',10,0,'{"dodge":8}','Esquiva maior'),
 ('p_luz','paladino',null,'Golpe de Luz','ativa',5,8,'{"dps_mult":0.1}','Dano sagrado'),
 ('p_fe','paladino',null,'Fé Inabalável','passiva',10,0,'{"def_pct":8,"regen_pct":15}','Defesa e regeneração'),
 ('n_dreno','necromante',null,'Dreno de Vida','ativa',5,7,'{"dps_mult":0.12,"regen_pct":10}','Rouba vida'),
 ('n_ossos','necromante',null,'Armadura de Ossos','passiva',10,0,'{"def_pct":10}','Ossos protegem'),
 ('d_espinhos','druida',null,'Espinhos','ativa',5,7,'{"dps_mult":0.1}','Natureza ataca'),
 ('d_renovar','druida',null,'Renovação','passiva',10,0,'{"regen_pct":30,"hp_pct":5}','Regeneração constante'),
 ('o_rajada','monge',null,'Rajada de Punhos','ativa',5,5,'{"dps_mult":0.14}','Golpes em sequência'),
 ('o_fluxo','monge',null,'Fluxo do Chi','passiva',10,0,'{"aspd_pct":12,"dodge":4}','Rápido e esquivo'),
 ('i_familiar','invocador',null,'Familiar','ativa',5,10,'{"dps_mult":0.16}','Criatura luta junto'),
 ('i_vinculo','invocador',null,'Vínculo Astral','passiva',10,0,'{"matk_pct":8,"hp_pct":5}','Força compartilhada'),
 ('sp_furia','guerreiro','berserker','Fúria','passiva',30,0,'{"patk_pct":20,"def_pct":-10}','Mais dano, menos defesa'),
 ('sp_baluarte','guerreiro','cavaleiro','Baluarte','passiva',30,0,'{"def_pct":20}','Defesa máxima'),
 ('sp_colosso','guerreiro','tita','Colosso','passiva',30,0,'{"hp_pct":25}','Vida enorme'),
 ('sp_arcano','mago','arquimago','Poder Arcano','passiva',30,0,'{"matk_pct":22}','Dano mágico'),
 ('sp_elementos','mago','elementalista','Tríade Elemental','ativa',30,6,'{"dps_mult":0.2}','Fogo, gelo e raio'),
 ('sp_mira','arqueiro','atirador','Mira Perfeita','passiva',30,0,'{"crit":10}','Crítico alto'),
 ('sp_veneno','arqueiro','cacador_sombrio','Flecha Venenosa','ativa',30,6,'{"dps_mult":0.18}','Dano contínuo'),
 ('sp_vulto','assassino','ninja','Vulto','passiva',30,0,'{"dodge":12}','Quase intocável'),
 ('sp_execucao','assassino','ceifador','Execução','ativa',30,8,'{"dps_mult":0.22}','Finaliza feridos'),
 ('sp_sagrado','paladino','templario','Juízo Sagrado','ativa',30,7,'{"dps_mult":0.18}','Ataque sagrado'),
 ('sp_egide','paladino','guardiao_divino','Égide','passiva',30,0,'{"def_pct":18,"regen_pct":20}','Proteção divina'),
 ('sp_morte','necromante','lich','Toque da Morte','ativa',30,7,'{"dps_mult":0.2}','Magia de morte'),
 ('sp_legiao','necromante','senhor_almas','Legião','passiva',30,0,'{"matk_pct":15,"hp_pct":10}','Mortos lutam'),
 ('sp_totem','druida','xama','Totem do Trovão','ativa',30,8,'{"dps_mult":0.18}','Raios'),
 ('sp_urso','druida','guardiao_ancestral','Forma de Urso','passiva',30,0,'{"hp_pct":20,"def_pct":12}','Vira urso'),
 ('sp_combo','monge','mestre_marcial','Combo Infinito','ativa',30,6,'{"dps_mult":0.2}','Sequência longa'),
 ('sp_luz','monge','iluminado','Corpo de Luz','passiva',30,0,'{"regen_pct":30,"dodge":5}','Chi cura'),
 ('sp_fera','invocador','domador','Fera Alfa','ativa',30,8,'{"dps_mult":0.2}','Fera poderosa'),
 ('sp_astral','invocador','mestre_astral','Entidade Astral','passiva',30,0,'{"matk_pct":18}','Poder astral')
on conflict (id) do update set name = excluded.name, kind = excluded.kind, req_level = excluded.req_level, effect = excluded.effect, description = excluded.description, class_id = excluded.class_id, spec_id = excluded.spec_id;

-- ---------- personagem: atributos, classe ----------
alter table characters add column if not exists attrs jsonb not null default '{"for":5,"vit":5,"res":5,"int":5,"agi":5,"des":5,"sab":5,"sor":5}';
alter table characters add column if not exists attr_points int not null default 0;
alter table characters add column if not exists class_id text references classes(id) default 'aventureiro';
alter table characters add column if not exists spec_id text references class_specializations(id);
-- personagens que já existem: vocação vira classe; recebem os pontos dos níveis que já têm
update characters set class_id = case vocation when 'knight' then 'guerreiro' when 'paladin' then 'arqueiro' when 'sorcerer' then 'mago' when 'druid' then 'druida' else 'aventureiro' end, attr_points = greatest(0, least(level, 100) - 1) * 5 where class_id is null or class_id = 'aventureiro';

create or replace function attr(c characters, k text) returns numeric language sql immutable as $$ select coalesce((c.attrs ->> k)::numeric, 5) $$;
-- efeitos somados das habilidades liberadas (classe e especialização) e do equipamento
create or replace function skill_fx(c characters, k text) returns numeric language sql stable as $$
  select coalesce(sum((s.effect ->> k)::numeric), 0) from skills s where (s.class_id = c.class_id and s.spec_id is null and s.req_level <= c.level) or (s.spec_id is not null and s.spec_id = c.spec_id and s.req_level <= c.level) $$;
create or replace function equip_roll(cid uuid, k text) returns numeric language sql stable as $$
  select coalesce(sum(coalesce((i.roll ->> k)::numeric, 0) * case when coalesce((i.roll ->> 'dur')::numeric, 1) <= 0 then 0.5 else 1 end), 0) from inventory inv join items i on i.id = inv.item_id where inv.character_id = cid and inv.container = 'equip' and inv.slot <> 'tool' $$;
-- arma forjada: dano médio entra no ataque
create or replace function equip_sum(cid uuid, k text) returns numeric language sql stable as $$
  select coalesce(sum(((case k when 'atk' then t.atk when 'def' then t.def else 0 end) * coalesce((select (r ->> 'mult')::numeric from jsonb_array_elements(cfg('rarities')) r where (r ->> 'id')::int = i.rarity), 1)
    + coalesce((i.roll ->> k)::numeric, 0) + case when k = 'atk' then (coalesce((i.roll ->> 'dmin')::numeric, 0) + coalesce((i.roll ->> 'dmax')::numeric, 0)) / 2 else 0 end)
    * case when coalesce((i.roll ->> 'dur')::numeric, 1) <= 0 then 0.5 else 1 end), 0)
  from inventory inv join items i on i.id = inv.item_id join item_templates t on t.id = i.template_id where inv.character_id = cid and inv.container = 'equip' and inv.slot <> 'tool' $$;

-- estatísticas completas (uma fonte só pro servidor e pra tela)
create or replace function stats_of(c characters) returns jsonb language plpgsql stable as $$
declare s jsonb := cfg('stats'); cl classes; lvl int := least(c.level, cfgn('level','max')::int); f numeric; v numeric; r numeric; i numeric; a numeric; d numeric; w numeric; l numeric;
  hp numeric; mp numeric; patk numeric; matk numeric; def numeric; mdef numeric; crit numeric; dodge numeric; acc numeric; aspd numeric; regen numeric; carry numeric; luck numeric; dps numeric;
begin
  select * into cl from classes where id = coalesce(c.class_id, 'aventureiro');
  f := attr(c,'for'); v := attr(c,'vit'); r := attr(c,'res'); i := attr(c,'int'); a := attr(c,'agi'); d := attr(c,'des'); w := attr(c,'sab'); l := attr(c,'sor');
  hp := ((s->>'hp_base')::numeric + cl.hp_lvl * lvl + v * (s->>'hp_vit')::numeric + equip_roll(c.id,'hp')) * (1 + skill_fx(c,'hp_pct') / 100);
  mp := (s->>'mp_base')::numeric + cl.mp_lvl * lvl + i * (s->>'mp_int')::numeric + w * (s->>'mp_sab')::numeric;
  patk := (4 + f * (s->>'patk_for')::numeric + d * (s->>'patk_des')::numeric + lvl * (s->>'atk_lvl')::numeric + coalesce((c.skills ->> 'sword')::numeric, 10) * 0.3 + equip_sum(c.id, 'atk')) * (1 + skill_fx(c,'patk_pct') / 100);
  matk := (4 + i * (s->>'matk_int')::numeric + w * (s->>'matk_sab')::numeric + lvl * (s->>'atk_lvl')::numeric + coalesce((c.skills ->> 'magic')::numeric, 0) * 0.4 + equip_roll(c.id, 'matk') + case when cl.dmg_type = 'magico' then equip_sum(c.id, 'atk') * 0.8 else 0 end) * (1 + skill_fx(c,'matk_pct') / 100);
  def := (r * (s->>'def_res')::numeric + lvl * (s->>'def_lvl')::numeric + equip_sum(c.id, 'def') + coalesce((c.skills->>'shield')::numeric, 10) * 0.3) * cl.def_mul * (1 + skill_fx(c,'def_pct') / 100);
  mdef := w * (s->>'mdef_sab')::numeric + lvl * 0.5 + equip_roll(c.id, 'mdef');
  -- retornos decrescentes: x / (x + k) até um teto
  crit := least((s->>'crit_cap')::numeric, (s->>'crit_cap')::numeric * d / (d + (s->>'crit_k')::numeric) + skill_fx(c,'crit') + equip_roll(c.id,'crit'));
  dodge := least((s->>'dodge_cap')::numeric, (s->>'dodge_cap')::numeric * a / (a + (s->>'dodge_k')::numeric) + skill_fx(c,'dodge'));
  acc := (s->>'acc_base')::numeric + 15 * d / (d + (s->>'acc_k')::numeric);
  aspd := (1 + a / (a + (s->>'aspd_k')::numeric)) * (1 + skill_fx(c,'aspd_pct') / 100) * coalesce(nullif(equip_roll(c.id,'aspd'), 0), 1);
  regen := (v * (s->>'regen_vit')::numeric + w * (s->>'regen_sab')::numeric) * (1 + skill_fx(c,'regen_pct') / 100);
  carry := (s->>'carry_base')::numeric + f * (s->>'carry_for')::numeric;
  luck := least((s->>'luck_cap')::numeric, l * (s->>'luck_per_point')::numeric);
  dps := (case cl.dmg_type when 'magico' then matk when 'misto' then (patk + matk) * 0.6 else patk end) * aspd * (1 + crit / 100 * 0.5) * (acc / 100) * (1 + skill_fx(c,'dps_mult'));
  return jsonb_build_object('hp', round(hp), 'mp', round(mp), 'patk', round(patk, 1), 'matk', round(matk, 1), 'def', round(def, 1), 'mdef', round(mdef, 1), 'crit', round(crit, 1), 'dodge', round(dodge, 1), 'acc', round(acc, 1), 'aspd', round(aspd, 2), 'regen', round(regen, 1), 'carry', round(carry), 'luck', round(luck, 4), 'dps', round(dps, 1));
end $$;

-- funções antigas passam a ler dos atributos: simulação, desafio e masmorra continuam iguais por fora
create or replace function hp_max(c characters) returns int language sql stable as $$ select (stats_of(c) ->> 'hp')::int $$;
create or replace function mana_max(c characters) returns int language sql stable as $$ select (stats_of(c) ->> 'mp')::int $$;
create or replace function atk_of(c characters) returns numeric language sql stable as $$ select (stats_of(c) ->> 'dps')::numeric $$;
create or replace function def_of(c characters) returns numeric language sql stable as $$ select ((stats_of(c) ->> 'def')::numeric) * (1 + (stats_of(c) ->> 'dodge')::numeric / 100) $$;
create or replace function power_of(c characters) returns numeric language sql stable as $$ select atk_of(c) * 2 + def_of(c) * 2 + hp_max(c) / 10.0 + c.pots * 0.5 $$;

-- pontos ao subir de nível: diferença entre o que o nível dá e o que já foi gasto
create or replace function points_total(c characters) returns int language sql immutable as $$ select (greatest(1, least(c.level, 100)) - 1) * 5 $$;
create or replace function points_spent(c characters) returns int language sql immutable as $$ select coalesce((select sum(value::int) from jsonb_each_text(c.attrs)), 40)::int - 40 $$;

create or replace function spend_points(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; k text; v int; total int := 0; na jsonb;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  na := c.attrs;
  for k, v in select key, value::int from jsonb_each_text(p) loop
    if k not in ('for','vit','res','int','agi','des','sab','sor') then raise exception 'atributo inválido'; end if;
    if v < 0 then raise exception 'valor inválido'; end if;
    total := total + v; na := na || jsonb_build_object(k, coalesce((na ->> k)::int, 5) + v);
  end loop;
  if total = 0 then raise exception 'nada pra distribuir'; end if;
  if points_spent(c) + total > points_total(c) then raise exception 'pontos insuficientes'; end if;
  update characters set attrs = na where id = c.id;
  return get_state();
end $$;
-- redistribuir custa gold (sumidouro de dinheiro) e devolve todos os pontos
create or replace function reset_points() returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; cost bigint; g bigint;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  cost := 100 + c.level * 40; select gold into g from wallets where character_id = c.id; if g < cost then raise exception 'redistribuir custa % gold', cost; end if;
  perform add_gold(c.id, -cost, 'redistribuir_atributos');
  update characters set attrs = '{"for":5,"vit":5,"res":5,"int":5,"agi":5,"des":5,"sab":5,"sor":5}' where id = c.id;
  return get_state();
end $$;
create or replace function choose_class(p_class text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; cl classes;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into cl from classes where id = p_class; if cl.id is null or cl.id = 'aventureiro' then raise exception 'classe inválida'; end if;
  if c.class_id is not null and c.class_id <> 'aventureiro' then raise exception 'você já tem classe'; end if;
  if c.level < cfgn('level','class_level') then raise exception 'escolha de classe no nível %', cfgn('level','class_level'); end if;
  update characters set class_id = cl.id, vocation = cl.sprite where id = c.id;
  insert into account_audit_log(user_id, action, meta) values (c.user_id, 'choose_class', jsonb_build_object('class', cl.id));
  return get_state();
end $$;
create or replace function choose_spec(p_spec text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; sp class_specializations;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into sp from class_specializations where id = p_spec; if sp.id is null then raise exception 'especialização inválida'; end if;
  if sp.class_id <> c.class_id then raise exception 'especialização de outra classe'; end if;
  if c.spec_id is not null then raise exception 'você já tem especialização'; end if;
  if c.level < sp.req_level then raise exception 'especialização no nível %', sp.req_level; end if;
  update characters set spec_id = sp.id where id = c.id;
  return get_state();
end $$;
grant execute on function spend_points(jsonb), reset_points(), choose_class(text), choose_spec(text) to authenticated;
revoke all on function spend_points(jsonb), reset_points(), choose_class(text), choose_spec(text) from anon;
