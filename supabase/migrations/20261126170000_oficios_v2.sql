-- =====================================================================================
-- OFÍCIOS V2 — parte 1: profissões novas, materiais e suas propriedades
-- Tudo aditivo: receitas e itens antigos continuam valendo.
-- =====================================================================================
set search_path = public;

-- ---------- profissões ----------
insert into professions(id, name, category, description, sort) values
 ('processamento','Processamento mineral','processo','Tritura e separa pedras brutas no Centro de Processamento.',14),
 ('lapidacao','Lapidação','processo','Identifica a qualidade e lapida gemas brutas.',15)
on conflict (id) do update set name = excluded.name, description = excluded.description;
-- quem já lapidava pela Joalheria continua no mesmo nível na Lapidação
insert into character_professions(character_id, profession_id, level, exp)
  select character_id, 'lapidacao', level, 0 from character_professions where profession_id = 'joalheria' and level > 1 on conflict do nothing;
update recipes set profession_id = 'lapidacao' where id like 'lapidar_%';

-- ---------- materiais novos ----------
-- categorias: barra (metais), madeira, organico (ossos/chifres tratados), couro, fio, nucleo (núcleos mágicos), gema (lapidada), pedra (bruta, pra processar), bruto (matéria-prima)
insert into item_templates(id,name,slot,atk,def,sell,price,mat,voc,icon,extra,category,stackable,tier,base_rarity,weight,props,req_level) values
 ('minerio_estanho','Minério de estanho',null,0,0,10,null,true,null,'moss_rock','{}','bruto',true,1,0,1.0,'{}',1),
 ('barra_estanho','Barra de estanho',null,0,0,28,null,true,null,'bar','{}','barra',true,1,0,1.2,'{"power":5,"weight":1.1,"tough":25,"magic":0}',1),
 ('barra_bronze','Barra de bronze',null,0,0,60,null,true,null,'bar','{}','barra',true,1,0,1.3,'{"power":8,"weight":1.3,"tough":40,"magic":0}',1),
 ('barra_aco','Barra de aço',null,0,0,140,null,true,null,'bar2','{}','barra',true,2,1,1.4,'{"power":13,"weight":1.4,"tough":70,"magic":0}',1),
 ('barra_aco_negro','Barra de aço negro',null,0,0,420,null,true,null,'bar2','{}','barra',true,3,2,1.5,'{"power":17,"weight":1.5,"tough":95,"magic":2}',1),
 ('barra_oricalco','Barra de oricalco',null,0,0,3200,null,true,null,'bar2','{}','barra',true,5,4,1.0,'{"power":28,"weight":1.0,"tough":120,"magic":10}',1),
 ('barra_celestial','Barra de metal celestial',null,0,0,9000,null,true,null,'bar2','{}','barra',true,6,5,0.9,'{"power":34,"weight":0.9,"tough":150,"magic":14}',1),
 ('barra_primordial','Barra de metal primordial',null,0,0,30000,null,true,null,'bar2','{}','barra',true,7,6,1.1,'{"power":42,"weight":1.1,"tough":200,"magic":18}',1),
 ('obsidiana','Obsidiana',null,0,0,220,null,true,null,'gem','{}','barra',true,3,2,1.2,'{"power":14,"weight":1.2,"tough":40,"magic":3}',1),
 ('cristal_sombrio','Cristal sombrio',null,0,0,380,null,true,null,'gem','{}','nucleo',true,3,3,0.1,'{}',1),
 ('fragmento_dimensional','Fragmento dimensional',null,0,0,2500,null,true,null,'gem','{}','nucleo',true,5,5,0.1,'{}',1),
 ('tora_espiritual','Tora espiritual',null,0,0,900,null,true,null,'log','{}','bruto',true,5,5,1.2,'{}',1),
 ('tabua_espiritual','Tábua espiritual',null,0,0,2600,null,true,null,'log','{}','madeira',true,5,5,0.5,'{"power":10,"weight":0.4,"tough":80,"magic":8}',1),
 -- orgânicos: o bruto cai das criaturas; tratado no Curtume vira componente
 ('chifre_javali','Chifre de javali',null,0,0,40,null,true,null,'tusk','{}','bruto',true,1,1,0.4,'{"treat_to":"chifre_javali_t"}',1),
 ('chifre_javali_t','Chifre de javali tratado',null,0,0,110,null,true,null,'tusk','{}','organico',true,1,1,0.3,'{}',1),
 ('osso_lobo','Osso de lobo',null,0,0,30,null,true,null,'bone','{}','bruto',true,1,1,0.3,'{"treat_to":"osso_lobo_t"}',1),
 ('osso_lobo_t','Osso de lobo tratado',null,0,0,85,null,true,null,'bone','{}','organico',true,1,1,0.25,'{}',1),
 ('chifre_minotauro','Chifre de minotauro',null,0,0,260,null,true,null,'tusk','{}','bruto',true,3,2,0.6,'{"treat_to":"chifre_minotauro_t"}',1),
 ('chifre_minotauro_t','Chifre de minotauro tratado',null,0,0,620,null,true,null,'tusk','{}','organico',true,3,2,0.5,'{}',1),
 ('osso_dragao','Osso de dragão',null,0,0,2200,null,true,null,'bone','{}','bruto',true,5,4,0.8,'{"treat_to":"osso_dragao_t"}',1),
 ('osso_dragao_t','Osso de dragão tratado',null,0,0,5200,null,true,null,'bone','{}','organico',true,5,4,0.7,'{}',1),
 ('chifre_demoniaco','Chifre demoníaco',null,0,0,3400,null,true,null,'tusk','{}','bruto',true,6,5,0.6,'{"treat_to":"chifre_demoniaco_t"}',1),
 ('chifre_demoniaco_t','Chifre demoníaco tratado',null,0,0,7800,null,true,null,'tusk','{}','organico',true,6,5,0.5,'{}',1),
 ('osso_primordial','Osso primordial',null,0,0,12000,null,true,null,'bone','{}','bruto',true,7,7,0.8,'{"treat_to":"osso_primordial_t"}',1),
 ('osso_primordial_t','Osso primordial tratado',null,0,0,26000,null,true,null,'bone','{}','organico',true,7,7,0.7,'{}',1),
 -- gemas brutas novas (a Lapidaria lapida) e lapidadas
 ('ametista_bruta','Ametista bruta',null,0,0,90,null,true,null,'gem','{}','bruto',true,2,2,0.2,'{"gem":"ametista","cut_to":"ametista"}',1),
 ('topazio_bruto','Topázio bruto',null,0,0,90,null,true,null,'gem','{}','bruto',true,2,2,0.2,'{"gem":"topazio","cut_to":"topazio"}',1),
 ('onix_bruto','Ônix bruto',null,0,0,110,null,true,null,'gem','{}','bruto',true,2,2,0.2,'{"gem":"onix","cut_to":"onix"}',1),
 ('opala_bruta','Opala bruta',null,0,0,140,null,true,null,'gem','{}','bruto',true,3,3,0.2,'{"gem":"opala","cut_to":"opala"}',1),
 ('pedra_lunar_bruta','Pedra lunar bruta',null,0,0,260,null,true,null,'gem','{}','bruto',true,3,3,0.2,'{"gem":"pedra_lunar","cut_to":"pedra_lunar"}',1),
 ('pedra_solar_bruta','Pedra solar bruta',null,0,0,260,null,true,null,'gem','{}','bruto',true,3,3,0.2,'{"gem":"pedra_solar","cut_to":"pedra_solar"}',1),
 ('cristal_vazio_bruto','Cristal do vazio bruto',null,0,0,1800,null,true,null,'gem','{}','bruto',true,5,5,0.2,'{"gem":"cristal_vazio","cut_to":"cristal_vazio"}',1),
 ('cristal_primordial_bruto','Cristal primordial bruto',null,0,0,15000,null,true,null,'gem','{}','bruto',true,7,7,0.2,'{"gem":"cristal_primordial","cut_to":"cristal_primordial"}',1),
 ('ametista','Ametista',null,0,0,260,null,true,null,'gem','{}','gema',true,2,2,0.1,'{}',1),
 ('topazio','Topázio',null,0,0,260,null,true,null,'gem','{}','gema',true,2,2,0.1,'{}',1),
 ('onix','Ônix',null,0,0,300,null,true,null,'gem','{}','gema',true,2,2,0.1,'{}',1),
 ('opala','Opala',null,0,0,420,null,true,null,'gem','{}','gema',true,3,3,0.1,'{}',1),
 ('pedra_lunar','Pedra lunar',null,0,0,700,null,true,null,'gem','{}','gema',true,3,3,0.1,'{}',1),
 ('pedra_solar','Pedra solar',null,0,0,700,null,true,null,'gem','{}','gema',true,3,3,0.1,'{}',1),
 ('cristal_vazio','Cristal do vazio',null,0,0,5200,null,true,null,'gem','{}','gema',true,5,5,0.1,'{}',1),
 ('cristal_celestial_lap','Cristal celestial lapidado',null,0,0,48000,null,true,null,'diamond','{}','gema',true,6,6,0.1,'{}',1),
 ('cristal_primordial','Cristal primordial',null,0,0,42000,null,true,null,'relic','{}','gema',true,7,7,0.1,'{}',1),
 -- pedras brutas: o conteúdo só aparece no Centro de Processamento
 ('pedra_comum','Pedra bruta comum',null,0,0,2,null,true,null,'moss_rock','{}','pedra',true,1,0,1.0,'{"origem":"Planícies"}',1),
 ('pedra_sedimentar','Pedra bruta sedimentar',null,0,0,3,null,true,null,'moss_rock','{}','pedra',true,1,0,1.0,'{"origem":"Rios e cavernas"}',1),
 ('pedra_montanhosa','Pedra bruta montanhosa',null,0,0,5,null,true,null,'moss_rock2','{}','pedra',true,2,1,1.1,'{"origem":"Montanhas"}',1),
 ('pedra_glacial','Pedra bruta glacial',null,0,0,8,null,true,null,'moss_rock2','{}','pedra',true,3,1,1.0,'{"origem":"Frostheim"}',1),
 ('pedra_arenosa','Pedra bruta arenosa',null,0,0,8,null,true,null,'moss_rock','{}','pedra',true,3,1,0.9,'{"origem":"Solkar"}',1),
 ('pedra_ancestral','Pedra bruta ancestral',null,0,0,10,null,true,null,'moss_rock','{}','pedra',true,3,2,1.0,'{"origem":"Viridion"}',1),
 ('pedra_vulcanica','Pedra bruta vulcânica',null,0,0,12,null,true,null,'moss_rock2','{}','pedra',true,4,2,1.2,'{"origem":"Ignareth"}',1),
 ('pedra_corrompida','Pedra bruta corrompida',null,0,0,16,null,true,null,'moss_rock2','{}','pedra',true,5,3,1.1,'{"origem":"Nocthar"}',1),
 ('pedra_dimensional','Pedra bruta dimensional',null,0,0,40,null,true,null,'moss_rock2','{}','pedra',true,6,4,1.0,'{"origem":"Dimensões"}',1),
 ('pedra_primordial','Pedra bruta primordial',null,0,0,120,null,true,null,'moss_rock2','{}','pedra',true,7,5,1.3,'{"origem":"Áreas secretas"}',1)
on conflict (id) do update set name = excluded.name, sell = excluded.sell, icon = excluded.icon, category = excluded.category, stackable = excluded.stackable, tier = excluded.tier, base_rarity = excluded.base_rarity, weight = excluded.weight, props = excluded.props;
update item_templates set name = 'Fragmento de pedra' where id = 'pedra';
update item_templates set category = 'nucleo' where id in ('essencia_sombria','cristal_gelo','po_arcano');
update item_templates set category = 'fio' where id = 'fio_seda';
update item_templates set props = props || '{"gem":"cristal_celestial","cut_to":"cristal_celestial_lap"}' where id = 'cristal_celestial';
update item_templates set props = props || jsonb_build_object('cut_to', props ->> 'gem') where id in ('gema_bruta','rubi_bruto','safira_bruta','esmeralda_bruta','diamante_bruto') and props ? 'gem';
update item_templates set props = props || '{"cut_to":"quartzo"}' where id = 'gema_bruta';

-- ---------- propriedades de cada material (percentuais e pontos), independentes da raridade ----------
-- dmg/dur/aspd/magic/acc em % ; crit em pontos percentuais. Propriedades físicas (0-100): dureza, flex, peso, aderencia, corte, impacto, termica, corrosao.
-- O componente decide quanto de cada propriedade entra (pesos em equipment_slots).
create table if not exists material_props (template_id text primary key references item_templates(id) on delete cascade, mods jsonb not null default '{}', phys jsonb not null default '{}', req_level int not null default 1, elem text, note text);
alter table material_props enable row level security; drop policy if exists read_mp on material_props; create policy read_mp on material_props for select to authenticated using (true);
insert into material_props(template_id, mods, phys, req_level, elem, note) values
 -- metais (tabela de referência do balanceamento)
 ('barra_cobre','{"dmg":5,"dur":5,"aspd":3,"magic":0}','{"dureza":30,"flex":60,"peso":45,"corrosao":30,"termica":40,"corte":35}',1,null,'leve e maleável'),
 ('barra_estanho','{"dmg":2,"dur":0,"aspd":4,"magic":0}','{"dureza":15,"flex":70,"peso":40,"corrosao":60,"termica":20,"corte":20}',1,null,'macio; ótimo em ligas'),
 ('barra_bronze','{"dmg":10,"dur":10,"aspd":0,"magic":0}','{"dureza":45,"flex":45,"peso":55,"corrosao":65,"termica":45,"corte":45}',5,null,'resiste à corrosão'),
 ('barra_ferro','{"dmg":20,"dur":20,"aspd":-3,"magic":0}','{"dureza":60,"flex":35,"peso":65,"corrosao":25,"termica":50,"corte":55}',10,null,'pesado e confiável'),
 ('barra_aco','{"dmg":35,"dur":40,"aspd":-2,"magic":0}','{"dureza":75,"flex":45,"peso":65,"corrosao":45,"termica":60,"corte":70}',15,null,'equilíbrio de dano e resistência'),
 ('barra_prata','{"dmg":15,"dur":10,"aspd":5,"magic":15}','{"dureza":40,"flex":55,"peso":50,"corrosao":55,"termica":35,"corte":45}',20,'sagrado','leve, conduz magia'),
 ('barra_ouro','{"dmg":5,"dur":-10,"aspd":-8,"magic":30}','{"dureza":20,"flex":75,"peso":85,"corrosao":95,"termica":30,"corte":20}',20,null,'pesado e mole, ótimo condutor mágico'),
 ('barra_aco_negro','{"dmg":50,"dur":60,"aspd":-5,"magic":5}','{"dureza":85,"flex":40,"peso":75,"corrosao":60,"termica":70,"corte":80}',30,'sombrio','brutal e pesado'),
 ('barra_mitril','{"dmg":65,"dur":70,"aspd":15,"magic":25}','{"dureza":85,"flex":70,"peso":25,"corrosao":90,"termica":70,"corte":85}',40,null,'leve e resistente'),
 ('barra_adamantita','{"dmg":90,"dur":120,"aspd":-10,"magic":10}','{"dureza":98,"flex":25,"peso":90,"corrosao":85,"termica":90,"corte":90}',55,null,'quase indestrutível, lento'),
 ('barra_oricalco','{"dmg":100,"dur":100,"aspd":10,"magic":50}','{"dureza":90,"flex":60,"peso":45,"corrosao":95,"termica":85,"corte":92}',65,'fogo','liga lendária'),
 ('barra_celestial','{"dmg":130,"dur":150,"aspd":20,"magic":80}','{"dureza":95,"flex":70,"peso":30,"corrosao":100,"termica":95,"corte":96}',75,'sagrado','metal das estrelas'),
 ('barra_primordial','{"dmg":180,"dur":200,"aspd":25,"magic":100}','{"dureza":100,"flex":75,"peso":40,"corrosao":100,"termica":100,"corte":100}',90,null,'o primeiro metal'),
 ('liga_ancestral','{"dmg":110,"dur":130,"aspd":5,"magic":60}','{"dureza":92,"flex":55,"peso":55,"corrosao":95,"termica":88,"corte":93}',60,null,'mitril, adamantita e cristal celestial'),
 ('obsidiana','{"dmg":40,"dur":-15,"aspd":2,"magic":10,"crit":3}','{"dureza":80,"flex":5,"peso":55,"corrosao":100,"termica":95,"corte":98}',25,'fogo','corta como vidro, mas quebra'),
 -- madeiras e orgânicos (tabela de referência das empunhaduras)
 ('tabua_comum','{"aspd":0,"acc":0,"dur":0,"crit":0}','{"dureza":20,"flex":60,"peso":30,"aderencia":50,"impacto":40}',1,null,'padrão'),
 ('tabua_carvalho','{"aspd":2,"acc":3,"dur":10,"crit":0}','{"dureza":35,"flex":55,"peso":35,"aderencia":60,"impacto":55}',8,null,'firme'),
 ('tabua_ancestral','{"aspd":15,"acc":15,"dur":25,"crit":3,"magic":15}','{"dureza":55,"flex":70,"peso":25,"aderencia":80,"impacto":70}',40,null,'viva e leve'),
 ('tabua_espiritual','{"aspd":20,"acc":20,"dur":30,"crit":5,"magic":30}','{"dureza":60,"flex":80,"peso":20,"aderencia":85,"impacto":75}',70,'espiritual','madeira do Plano Eterno'),
 ('casca_ent','{"aspd":6,"acc":6,"dur":20,"crit":1,"magic":5}','{"dureza":45,"flex":60,"peso":30,"aderencia":70,"impacto":60}',18,null,'casca de Ent'),
 ('osso_lobo_t','{"aspd":4,"acc":5,"dur":5,"crit":1}','{"dureza":45,"flex":35,"peso":30,"aderencia":65,"impacto":45}',5,null,'leve e áspero'),
 ('chifre_javali_t','{"aspd":8,"acc":5,"dur":15,"crit":1}','{"dureza":55,"flex":40,"peso":35,"aderencia":70,"impacto":55}',8,null,'curvo, encaixa bem na mão'),
 ('chifre_minotauro_t','{"aspd":5,"acc":8,"dur":30,"crit":2}','{"dureza":70,"flex":35,"peso":45,"aderencia":70,"impacto":75}',30,null,'maciço'),
 ('osso_dragao_t','{"aspd":10,"acc":10,"dur":50,"crit":5,"magic":10}','{"dureza":85,"flex":45,"peso":40,"aderencia":75,"impacto":85,"termica":90}',60,'fogo','quente ao toque'),
 ('chifre_demoniaco_t','{"aspd":12,"acc":10,"dur":40,"crit":7,"magic":15}','{"dureza":80,"flex":50,"peso":35,"aderencia":80,"impacto":80}',75,'sombrio','pulsa sozinho'),
 ('osso_primordial_t','{"aspd":25,"acc":25,"dur":100,"crit":10,"magic":30}','{"dureza":100,"flex":60,"peso":30,"aderencia":90,"impacto":100}',90,null,'mais antigo que o mundo'),
 -- couro, fios e núcleos
 ('couro','{"aspd":2,"acc":4,"dur":8,"crit":0,"def":8,"hp":6}','{"flex":80,"peso":20,"aderencia":85,"impacto":50,"termica":30}',1,null,'aderência e conforto'),
 ('fio_seda','{"aspd":6,"acc":6,"dur":4,"crit":1,"magic":5}','{"flex":95,"peso":5,"aderencia":40}',1,null,'corda de arco, forro leve'),
 ('essencia_sombria','{"magic":30,"dur":0}','{}',10,'sombrio','núcleo sombrio'),
 ('cristal_gelo','{"magic":25,"dur":5}','{"termica":-50}',15,'gelo','núcleo gelado'),
 ('po_arcano','{"magic":15}','{}',1,null,'núcleo simples'),
 ('cristal_sombrio','{"magic":45,"crit":2}','{}',30,'sombrio','núcleo corrompido'),
 ('fragmento_dimensional','{"magic":70,"aspd":10}','{}',60,null,'núcleo dimensional'),
 ('cristal_celestial','{"magic":90,"dur":20}','{}',70,'sagrado','núcleo celestial')
on conflict (template_id) do update set mods = excluded.mods, phys = excluded.phys, req_level = excluded.req_level, elem = excluded.elem, note = excluded.note;

-- ---------- gemas: efeito por tipo de equipamento e qualidade pela pureza ----------
insert into game_config(key, value, note) values
 ('gem_quality', '[{"min":0,"name":"Fragmentada","mult":0.35},{"min":13,"name":"Bruta","mult":0.5},{"min":26,"name":"Imperfeita","mult":0.65},{"min":40,"name":"Comum","mult":0.8},{"min":55,"name":"Lapidada","mult":1.0},{"min":70,"name":"Superior","mult":1.25},{"min":85,"name":"Excepcional","mult":1.6},{"min":97,"name":"Perfeita","mult":2.0}]', 'qualidade da gema pela pureza'),
 ('elements', '["fogo","gelo","sagrado","veneno","raio","sombrio","agua","fisico","magico","espiritual","divino"]', 'elementos de dano e resistência')
on conflict (key) do update set value = excluded.value, note = excluded.note;
create or replace function gem_quality(pur int) returns jsonb language sql stable as $$
  select x from jsonb_array_elements(cfg('gem_quality')) x where (x ->> 'min')::int <= pur order by (x ->> 'min')::int desc limit 1 $$;
create table if not exists gem_effects (gem text not null references item_templates(id) on delete cascade, target text not null check (target in ('weapon','armor','tool','jewel')), effect jsonb not null, primary key (gem, target));
alter table gem_effects enable row level security; drop policy if exists read_ge on gem_effects; create policy read_ge on gem_effects for select to authenticated using (true);
insert into gem_effects(gem, target, effect) values
 ('quartzo','weapon','{"acc":4}'),('quartzo','armor','{"def":3}'),('quartzo','tool','{"eff":0.05}'),('quartzo','jewel','{"crit":1.5}'),
 ('rubi','weapon','{"elem_fogo":8}'),('rubi','armor','{"hp":40}'),('rubi','tool','{"speed":0.05}'),('rubi','jewel','{"elem_fogo":5,"atk":3}'),
 ('safira','weapon','{"elem_gelo":6,"matk":4}'),('safira','armor','{"mdef":6}'),('safira','tool','{"dur_pct":15}'),('safira','jewel','{"matk":6,"mdef":4}'),
 ('esmeralda','weapon','{"regen":0.6}'),('esmeralda','armor','{"regen":1,"hp":40}'),('esmeralda','tool','{"eff":0.08}'),('esmeralda','jewel','{"hp":60,"regen":0.5}'),
 ('ametista','weapon','{"matk":9}'),('ametista','armor','{"mdef":5}'),('ametista','tool','{"eff":0.04}'),('ametista','jewel','{"matk":10}'),
 ('topazio','weapon','{"aspd_pct":5}'),('topazio','armor','{"dodge":1.5}'),('topazio','tool','{"speed":0.15}'),('topazio','jewel','{"aspd_pct":3}'),
 ('onix','weapon','{"elem_sombrio":8}'),('onix','armor','{"mdef":4,"def":2}'),('onix','tool','{"dur_pct":10}'),('onix','jewel','{"elem_sombrio":5}'),
 ('diamante','weapon','{"dur_pct":30,"crit":2}'),('diamante','armor','{"def":8,"dur_pct":30}'),('diamante','tool','{"dur_pct":40,"eff":0.1}'),('diamante','jewel','{"all_stats":2}'),
 ('opala','weapon','{"matk":5,"regen":0.4}'),('opala','armor','{"mdef":6,"regen":0.5}'),('opala','tool','{"eff":0.06,"speed":0.06}'),('opala','jewel','{"matk":6,"regen":0.6}'),
 ('pedra_lunar','weapon','{"elem_espiritual":10}'),('pedra_lunar','armor','{"mdef":8}'),('pedra_lunar','tool','{"speed":0.08}'),('pedra_lunar','jewel','{"elem_espiritual":6,"luck":0.01}'),
 ('pedra_solar','weapon','{"elem_sagrado":10}'),('pedra_solar','armor','{"hp":50,"regen":0.5}'),('pedra_solar','tool','{"eff":0.08}'),('pedra_solar','jewel','{"elem_sagrado":6,"hp":40}'),
 ('cristal_vazio','weapon','{"matk_pct":8}'),('cristal_vazio','armor','{"mdef":10}'),('cristal_vazio','tool','{"speed":0.1,"eff":0.1}'),('cristal_vazio','jewel','{"matk_pct":6}'),
 ('cristal_celestial_lap','weapon','{"elem_divino":14,"matk":8}'),('cristal_celestial_lap','armor','{"def":10,"mdef":10}'),('cristal_celestial_lap','tool','{"eff":0.2}'),('cristal_celestial_lap','jewel','{"elem_divino":8,"all_stats":2}'),
 ('cristal_primordial','weapon','{"all_stats":3,"crit":3,"aspd_pct":5}'),('cristal_primordial','armor','{"all_stats":3,"def":8,"hp":80}'),('cristal_primordial','tool','{"eff":0.25,"speed":0.25}'),('cristal_primordial','jewel','{"all_stats":5,"luck":0.02}')
on conflict (gem, target) do update set effect = excluded.effect;

-- ---------- cadeia de ligas e tratamento ----------
insert into recipes(id, name, profession_id, kind, req_level, tool, inputs, output, seconds, gold_cost, exp, techniques, description) values
 ('fundir_estanho','Fundir barra de estanho','metalurgia','refino',1,null,'[{"t":"minerio_estanho","q":2},{"t":"carvao","q":1}]','{"t":"barra_estanho","q":1}',8,6,7,true,'Estanho pra ligas'),
 ('liga_bronze','Liga de bronze','metalurgia','refino',5,null,'[{"t":"barra_cobre","q":3},{"t":"barra_estanho","q":1}]','{"t":"barra_bronze","q":3}',12,20,14,true,'Cobre + estanho'),
 ('liga_aco','Produzir aço','metalurgia','refino',15,null,'[{"t":"barra_ferro","q":2},{"t":"carvao","q":3}]','{"t":"barra_aco","q":1}',16,40,22,true,'Ferro + carbono'),
 ('liga_aco_negro','Produzir aço negro','metalurgia','refino',30,null,'[{"t":"barra_aco","q":2},{"t":"essencia_sombria","q":1},{"t":"carvao","q":2}]','{"t":"barra_aco_negro","q":1}',22,150,40,true,'Aço temperado em sombra'),
 ('liga_oricalco','Liga de oricalco','metalurgia','refino',65,null,'[{"t":"barra_mitril","q":2},{"t":"barra_ouro","q":1},{"t":"po_arcano","q":3}]','{"t":"barra_oricalco","q":1}',40,4000,90,true,'Mitril + ouro + pó arcano'),
 ('liga_celestial','Forjar metal celestial','metalurgia','refino',75,null,'[{"t":"barra_adamantita","q":1},{"t":"cristal_celestial","q":1},{"t":"barra_prata","q":2}]','{"t":"barra_celestial","q":1}',60,12000,140,true,'Adamantita + cristal celestial'),
 ('liga_primordial','Forjar metal primordial','metalurgia','refino',90,null,'[{"t":"liga_ancestral","q":1},{"t":"fragmento_primordial","q":1}]','{"t":"barra_primordial","q":1}',90,40000,260,true,'Liga ancestral + fragmento primordial'),
 ('serrar_espiritual','Serrar tábua espiritual','carpintaria','refino',70,null,'[{"t":"tora_espiritual","q":1}]','{"t":"tabua_espiritual","q":1}',20,600,80,true,'Madeira do Plano Eterno')
on conflict (id) do update set name = excluded.name, profession_id = excluded.profession_id, req_level = excluded.req_level, inputs = excluded.inputs, output = excluded.output, seconds = excluded.seconds, gold_cost = excluded.gold_cost, exp = excluded.exp, description = excluded.description;
-- tratamento de chifres e ossos no Curtume (dados: props.treat_to)
insert into recipes(id, name, profession_id, kind, req_level, tool, inputs, output, seconds, gold_cost, exp, techniques, description)
  select 'tratar_' || t.id, 'Tratar ' || lower(t.name), 'caca', 'refino', coalesce((select req_level from material_props where template_id = t.props ->> 'treat_to'), 1), null,
    jsonb_build_array(jsonb_build_object('t', t.id, 'q', 1)), jsonb_build_object('t', t.props ->> 'treat_to', 'q', 1), 8 + t.tier * 4, 5 * t.tier * t.tier, 6 + t.tier * 6, true, 'Limpeza e tratamento pra virar componente'
  from item_templates t where t.props ? 'treat_to'
on conflict (id) do update set inputs = excluded.inputs, output = excluded.output, req_level = excluded.req_level;
-- lapidação gerada pelos dados: toda gema bruta com props.cut_to tem receita na Lapidaria
insert into recipes(id, name, profession_id, kind, req_level, tool, inputs, output, seconds, gold_cost, exp, techniques, description)
  select 'lapidar_' || (t.props ->> 'cut_to'), 'Lapidar ' || lower((select name from item_templates where id = t.props ->> 'cut_to')), 'lapidacao', 'refino', greatest(1, (t.tier - 1) * 15), null,
    jsonb_build_array(jsonb_build_object('t', t.id, 'q', 1)), jsonb_build_object('t', t.props ->> 'cut_to', 'q', 1), 8 + t.tier * 4, 10 * t.tier * t.tier, 8 + t.tier * 8, true, 'A técnica muda a pureza: pureza decide a qualidade da gema'
  from item_templates t where t.props ? 'cut_to' and exists (select 1 from item_templates c where c.id = t.props ->> 'cut_to')
on conflict (id) do update set profession_id = 'lapidacao', inputs = excluded.inputs, output = excluded.output;

-- drops novos de criatura (alguns só em mundos mais altos)
alter table drop_entries add column if not exists min_world int not null default 1;
delete from drop_entries where table_id like 'cr_%' and template_id in ('chifre_javali','osso_lobo','chifre_minotauro','osso_dragao','chifre_demoniaco','osso_primordial');
insert into drop_entries(table_id, template_id, kind, chance, qty_min, qty_max, purity_min, purity_max, min_world) values
 ('cr_javali','chifre_javali','bonus',0.10,1,1,30,70,1),
 ('cr_lobo','osso_lobo','bonus',0.12,1,1,30,70,1),('cr_lobo_neve','osso_lobo','bonus',0.12,1,1,35,75,1),
 ('cr_troll_gelo','chifre_minotauro','bonus',0.04,1,1,40,80,1),('cr_golem','chifre_minotauro','bonus',0.02,1,1,40,80,1),
 ('cr_vespa','osso_dragao','bonus',0.003,1,1,50,90,3),('cr_golem','osso_dragao','bonus',0.002,1,1,50,90,3),('cr_mae_vespas','osso_dragao','bonus',0.15,1,1,60,95,3),('cr_capataz','osso_dragao','bonus',0.1,1,1,60,95,3),
 ('cr_cavaleiro','chifre_demoniaco','bonus',0.003,1,1,50,90,4),('cr_sentinela','chifre_demoniaco','bonus',0.003,1,1,50,90,4),
 ('cr_rei','osso_primordial','bonus',0.02,1,1,70,98,5),('cr_guardiao','osso_primordial','bonus',0.0005,1,1,70,98,5);
update game_config set value = jsonb_set(value, '{5}', coalesce(value -> '5', '[]') || '[{"prof":"lenharia","t":"tora_espiritual","chance":0.02}]') where key = 'world_drops' and not (value -> '5' @> '[{"t":"tora_espiritual"}]');
-- =====================================================================================
-- OFÍCIOS V2 — parte 2: fabricação modular orientada a dados
-- equipment_types (o que dá pra fabricar) + equipment_slots (componentes, materiais aceitos e quanto cada atributo pesa)
-- Atributo final = base × (1 + Σ peso × modificador do material) × qualidade + bônus fixos (crítico, precisão, gema)
-- =====================================================================================
create table if not exists equipment_types (id text primary key, name text not null, label text not null, output_tpl text not null references item_templates(id), kind text not null check (kind in ('weapon','armor','tool','jewel')),
  profession_id text not null references professions(id), req_level int not null default 1, seconds int not null default 20, gold_cost int not null default 20, base jsonb not null, wtype text, sort int default 0, description text);
create table if not exists equipment_slots (type_id text not null references equipment_types(id) on delete cascade, slot text not null, name text not null, required boolean not null default true, accepts text[] not null, only_ids text[], qty int not null default 1,
  weights jsonb not null default '{}', name_role text, sort int default 0, primary key (type_id, slot));
alter table equipment_types enable row level security; alter table equipment_slots enable row level security;
drop policy if exists read_et on equipment_types; create policy read_et on equipment_types for select to authenticated using (true);
drop policy if exists read_es on equipment_slots; create policy read_es on equipment_slots for select to authenticated using (true);
insert into game_config(key, value, note) values
 ('craft_v2', '{"qmod_base":0.85,"qmod_span":0.30,"factor_min":0.2,"factor_max":6,"magic_to_matk":0.4,"elem_from_main":0.12,"noise":5,"sockets":[[85,2],[60,1]],"rename_min_quality":80,"rename_min_rarity":4}', 'fórmulas da fabricação modular')
on conflict (key) do update set value = excluded.value;

insert into equipment_types(id, name, label, output_tpl, kind, profession_id, req_level, seconds, gold_cost, base, wtype, sort, description) values
 ('espada','Espada','Espada','espada_forjada','weapon','ferraria',1,24,30,'{"dmg":15,"aspd":1.0,"dur":100,"crit":5,"acc":0}','espada',1,'Equilibrada. A lâmina decide o dano; a empunhadura, velocidade e precisão.'),
 ('adaga','Adaga','Adaga','adaga_forjada','weapon','ferraria',5,16,20,'{"dmg":10,"aspd":1.3,"dur":80,"crit":8,"acc":2}','adaga',2,'Rápida e crítica.'),
 ('machado','Machado de guerra','Machado','machado_forjado','weapon','ferraria',8,26,40,'{"dmg":17,"aspd":0.92,"dur":110,"crit":3,"acc":0}','machado',3,'Cabeça pesada, cabo longo.'),
 ('martelo','Martelo de guerra','Martelo','martelo_forjado','weapon','ferraria',12,28,50,'{"dmg":19,"aspd":0.85,"dur":130,"crit":2,"acc":0}','martelo',4,'O mais pesado.'),
 ('arco','Arco','Arco','arco_forjado','weapon','carpintaria',8,22,35,'{"dmg":14,"aspd":1.05,"dur":90,"crit":6,"acc":4}','arco',5,'Estrutura flexível, corda tensa.'),
 ('cajado','Cajado','Cajado','cajado_forjado','weapon','carpintaria',10,26,60,'{"dmg":7,"matk":14,"aspd":1.0,"dur":90,"crit":3,"acc":0}','cajado',6,'O núcleo decide o poder mágico.'),
 ('bastao','Bastão','Bastão','bastao_forjado','weapon','carpintaria',6,20,25,'{"dmg":14,"aspd":1.2,"dur":100,"crit":4,"acc":2}','bastao',7,'Arma do monge.'),
 ('armadura','Armadura','Armadura','armadura_forjada','armor','ferraria',5,30,45,'{"def":12,"hp":30,"dur":140,"mdef":0}',null,10,'Estrutura, forro, reforços e fixações.'),
 ('escudo','Escudo','Escudo','escudo_forjado','armor','ferraria',3,24,35,'{"def":9,"hp":0,"dur":150,"mdef":2}',null,11,'Estrutura e reforço central.'),
 ('elmo','Elmo','Elmo','elmo_forjado','armor','ferraria',6,20,30,'{"def":6,"hp":12,"dur":110,"mdef":0}',null,12,'Protege a cabeça.'),
 ('picareta','Picareta','Picareta','picareta_forjada','tool','ferraria',1,16,20,'{"eff":1.0,"speed":1.0,"dur":150}',null,20,'A cabeça decide o nível da ferramenta.'),
 ('machado_lenhador','Machado de lenhador','Machado de lenhador','machado_lenhador_forjado','tool','ferraria',1,16,20,'{"eff":1.0,"speed":1.0,"dur":150}',null,21,'Pra lenharia.'),
 ('foice','Foice','Foice','foice_forjada','tool','ferraria',1,14,15,'{"eff":1.0,"speed":1.0,"dur":130}',null,22,'Pra colher ervas.'),
 ('anel','Anel','Anel','anel_forjado','jewel','joalheria',10,20,80,'{"mdef":2,"dur":200}',null,30,'Aro de metal nobre e uma gema.'),
 ('amuleto','Amuleto','Amuleto','amuleto_forjado','jewel','joalheria',15,26,120,'{"mdef":4,"hp":15,"dur":200}',null,31,'Corrente, pingente e cordão.')
on conflict (id) do update set name = excluded.name, label = excluded.label, output_tpl = excluded.output_tpl, kind = excluded.kind, profession_id = excluded.profession_id, req_level = excluded.req_level, seconds = excluded.seconds, gold_cost = excluded.gold_cost, base = excluded.base, wtype = excluded.wtype, sort = excluded.sort, description = excluded.description;

delete from equipment_slots;
insert into equipment_slots(type_id, slot, name, required, accepts, only_ids, qty, weights, name_role, sort) values
 -- espada e adaga
 ('espada','lamina','Lâmina',true,'{barra}',null,3,'{"dmg":1,"dur":1,"aspd":1,"magic":1}','main',1),
 ('espada','guarda','Guarda',true,'{barra,organico}',null,1,'{"dur":0.3,"dmg":0.1}',null,2),
 ('espada','empunhadura','Empunhadura',true,'{madeira,organico}',null,1,'{"aspd":1,"acc":1,"dur":1,"crit":1}','with',3),
 ('espada','pomo','Pomo',true,'{barra,organico}',null,1,'{"crit":0.5,"magic":0.3,"aspd":0.2,"dur":0.2}',null,4),
 ('espada','revestimento','Revestimento do cabo',false,'{couro,fio}',null,1,'{"acc":0.5,"aspd":0.3,"crit":0.3}',null,5),
 ('espada','gema','Gema',false,'{gema}',null,1,'{}',null,9),
 ('adaga','lamina','Lâmina',true,'{barra}',null,2,'{"dmg":1,"dur":1,"aspd":1,"magic":1}','main',1),
 ('adaga','guarda','Guarda',true,'{barra,organico}',null,1,'{"dur":0.3,"dmg":0.1}',null,2),
 ('adaga','empunhadura','Empunhadura',true,'{madeira,organico}',null,1,'{"aspd":1,"acc":1,"dur":1,"crit":1.2}','with',3),
 ('adaga','pomo','Pomo',false,'{barra,organico}',null,1,'{"crit":0.5,"magic":0.3,"aspd":0.2}',null,4),
 ('adaga','gema','Gema',false,'{gema}',null,1,'{}',null,9),
 -- machado e martelo
 ('machado','cabeca','Cabeça',true,'{barra}',null,3,'{"dmg":1,"dur":1,"aspd":1,"magic":0.5}','main',1),
 ('machado','cabo','Cabo',true,'{madeira,organico}',null,1,'{"aspd":1,"acc":1,"dur":1,"crit":1}','with',2),
 ('machado','reforco','Reforço',false,'{barra,organico,couro}',null,1,'{"dur":0.5,"dmg":0.2}',null,3),
 ('machado','gema','Gema',false,'{gema}',null,1,'{}',null,9),
 ('martelo','cabeca','Cabeça',true,'{barra}',null,4,'{"dmg":1,"dur":1,"aspd":1,"magic":0.5}','main',1),
 ('martelo','cabo','Cabo',true,'{madeira,organico}',null,1,'{"aspd":1,"acc":1,"dur":1,"crit":1}','with',2),
 ('martelo','reforco','Reforço',false,'{barra,organico,couro}',null,1,'{"dur":0.5,"dmg":0.2}',null,3),
 ('martelo','gema','Gema',false,'{gema}',null,1,'{}',null,9),
 -- arco
 ('arco','estrutura','Estrutura',true,'{madeira,organico}',null,2,'{"dmg":1,"aspd":0.6,"dur":1,"acc":0.5,"magic":0.5}','main',1),
 ('arco','corda','Corda',true,'{fio,couro}',null,2,'{"aspd":1,"acc":1,"crit":0.5}','with',2),
 ('arco','empunhadura','Empunhadura',true,'{couro,madeira,organico}',null,1,'{"acc":0.5,"crit":0.5}',null,3),
 ('arco','reforco','Reforço',false,'{barra,organico}',null,1,'{"dur":0.5,"dmg":0.2}',null,4),
 ('arco','gema','Gema',false,'{gema}',null,1,'{}',null,9),
 -- cajado
 ('cajado','corpo','Corpo',true,'{madeira,organico}',null,2,'{"dur":1,"aspd":0.5,"magic":0.5,"dmg":0.5}','main',1),
 ('cajado','nucleo','Núcleo mágico',true,'{nucleo}',null,2,'{"magic":1.2,"crit":0.5}','with',2),
 ('cajado','revestimento','Revestimento',false,'{barra,couro}',null,1,'{"dur":0.5,"magic":0.3}',null,3),
 ('cajado','cristal','Cristal',false,'{nucleo,gema}',null,1,'{"magic":0.6}',null,4),
 ('cajado','gema','Gema',false,'{gema}',null,1,'{}',null,9),
 -- bastão
 ('bastao','corpo','Corpo',true,'{madeira,organico}',null,3,'{"dmg":1,"aspd":1,"dur":1,"crit":0.5}','main',1),
 ('bastao','empunhadura','Empunhadura',true,'{couro,fio,organico}',null,1,'{"acc":1,"aspd":0.5,"crit":0.5}','with',2),
 ('bastao','reforco','Ponteiras',false,'{barra}',null,1,'{"dmg":0.3,"dur":0.5}',null,3),
 ('bastao','gema','Gema',false,'{gema}',null,1,'{}',null,9),
 -- armaduras
 ('armadura','estrutura','Material estrutural',true,'{barra,couro,organico}',null,4,'{"def":1,"hp":1,"dur":1,"mdef":0.5,"dodge":0.5}','main',1),
 ('armadura','forro','Revestimento interno',true,'{couro,fio}',null,2,'{"hp":0.5,"def":0.3,"dodge":0.5}','with',2),
 ('armadura','reforcos','Reforços',false,'{barra,organico}',null,2,'{"def":0.5,"dur":0.5}',null,3),
 ('armadura','fixacoes','Fixações',true,'{couro,fio,barra}',null,1,'{"dur":0.3,"dodge":0.2}',null,4),
 ('armadura','gema','Gema',false,'{gema}',null,1,'{}',null,9),
 ('escudo','estrutura','Estrutura',true,'{barra,madeira,organico}',null,3,'{"def":1,"dur":1,"mdef":0.5}','main',1),
 ('escudo','revestimento','Revestimento',true,'{couro,madeira,barra}',null,1,'{"mdef":0.5,"hp":0.5,"def":0.3}',null,2),
 ('escudo','centro','Reforço central',false,'{barra,organico}',null,1,'{"def":0.5,"dur":0.3}','with',3),
 ('escudo','empunhadura','Empunhadura',true,'{couro,madeira}',null,1,'{"dodge":0.5}',null,4),
 ('escudo','gema','Gema',false,'{gema}',null,1,'{}',null,9),
 ('elmo','estrutura','Estrutura',true,'{barra,couro,organico}',null,2,'{"def":1,"hp":1,"dur":1,"mdef":0.3}','main',1),
 ('elmo','forro','Forro',true,'{couro,fio}',null,1,'{"hp":0.5,"dodge":0.3}',null,2),
 ('elmo','gema','Gema',false,'{gema}',null,1,'{}',null,9),
 -- ferramentas
 ('picareta','cabeca','Cabeça',true,'{barra}',null,2,'{"eff":1,"speed":1,"dur":1}','main',1),
 ('picareta','cabo','Cabo',true,'{madeira,organico}',null,1,'{"speed":1,"dur":0.5,"eff":0.3}','with',2),
 ('picareta','reforco','Reforço',false,'{barra,couro}',null,1,'{"dur":0.5}',null,3),
 ('picareta','gema','Gema',false,'{gema}',null,1,'{}',null,9),
 ('machado_lenhador','cabeca','Cabeça',true,'{barra}',null,2,'{"eff":1,"speed":1,"dur":1}','main',1),
 ('machado_lenhador','cabo','Cabo',true,'{madeira,organico}',null,1,'{"speed":1,"dur":0.5,"eff":0.3}','with',2),
 ('machado_lenhador','reforco','Reforço',false,'{barra,couro}',null,1,'{"dur":0.5}',null,3),
 ('machado_lenhador','gema','Gema',false,'{gema}',null,1,'{}',null,9),
 ('foice','cabeca','Lâmina',true,'{barra}',null,1,'{"eff":1,"speed":1,"dur":1}','main',1),
 ('foice','cabo','Cabo',true,'{madeira,organico}',null,1,'{"speed":1,"dur":0.5,"eff":0.3}','with',2),
 ('foice','gema','Gema',false,'{gema}',null,1,'{}',null,9),
 -- joias (gema obrigatória)
 ('anel','aro','Aro',true,'{barra}','{barra_prata,barra_ouro,barra_mitril,barra_adamantita,liga_ancestral,barra_oricalco,barra_celestial,barra_primordial}',1,'{"mdef":1,"dur":1}','main',1),
 ('anel','gema','Gema',true,'{gema}',null,1,'{}','with',2),
 ('amuleto','corrente','Corrente',true,'{barra}','{barra_prata,barra_ouro,barra_mitril,barra_adamantita,liga_ancestral,barra_oricalco,barra_celestial,barra_primordial}',1,'{"mdef":1,"dur":1,"hp":0.5}','main',1),
 ('amuleto','gema','Pingente',true,'{gema}',null,1,'{}','with',2),
 ('amuleto','cordao','Cordão',true,'{fio,couro}',null,1,'{"dodge":0.5,"mdef":0.3}',null,3);
alter table recipes drop constraint if exists recipes_kind_check;
alter table recipes add constraint recipes_kind_check check (kind in ('refino','componente','montagem','consumivel','equipamento','modular'));
insert into recipes(id, name, profession_id, kind, req_level, tool, inputs, output, seconds, gold_cost, exp, techniques, description)
  select 'modular_' || id, 'Fabricar ' || lower(name), profession_id, 'modular', req_level, case when profession_id = 'ferraria' then 'martelo' end, '[]', jsonb_build_object('t', output_tpl), seconds, gold_cost, 20 + req_level * 2, false, description from equipment_types
on conflict (id) do update set name = excluded.name, profession_id = excluded.profession_id, kind = 'modular', req_level = excluded.req_level, tool = excluded.tool, output = excluded.output, seconds = excluded.seconds, gold_cost = excluded.gold_cost, exp = excluded.exp;

-- nome curto do material pro nome do equipamento ("Barra de aço" → "aço", "Tábua de carvalho" → "madeira de carvalho")
create or replace function mat_short(t text) returns text language sql stable as $$
  select lower(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce((select name from item_templates where id = t), t), '^Barra de ', ''), '^Tábua de ', 'madeira de '), '^Tábua ', 'madeira '), ' tratad[oa]$', '')) $$;
-- modificador de um material já traduzido pro atributo final (arma, armadura, ferramenta ou joia)
create or replace function mat_mod(mods jsonb, stat text, kind text) returns numeric language sql immutable as $$
  select coalesce(case
    when kind = 'armor' and stat = 'def' then coalesce((mods ->> 'def')::numeric, (mods ->> 'dmg')::numeric)
    when kind = 'armor' and stat = 'hp' then coalesce((mods ->> 'hp')::numeric, (mods ->> 'dur')::numeric * 0.5)
    when kind in ('armor','jewel') and stat = 'mdef' then coalesce((mods ->> 'mdef')::numeric, (mods ->> 'magic')::numeric)
    when kind in ('armor','jewel') and stat = 'dodge' then coalesce((mods ->> 'dodge')::numeric, (mods ->> 'aspd')::numeric * 0.1)
    when kind = 'jewel' and stat = 'hp' then coalesce((mods ->> 'hp')::numeric, (mods ->> 'dur')::numeric * 0.5)
    when kind = 'tool' and stat = 'eff' then (mods ->> 'dmg')::numeric
    when kind = 'tool' and stat = 'speed' then (mods ->> 'aspd')::numeric
    else (mods ->> stat)::numeric end, 0) $$;

-- avalia o equipamento: mats = {slot: {t, purity}}; q = qualidade 0-100. Usado na prévia e na fabricação (mesma conta).
create or replace function modular_eval(p_type text, mats jsonb, q numeric) returns jsonb language plpgsql stable as $$
declare et equipment_types := (select x from equipment_types x where x.id = p_type); k jsonb := cfg('craft_v2'); s equipment_slots; m jsonb; mp material_props; sum jsonb := '{}'; stat text; w numeric;
  qm numeric; res jsonb := '{}'; b jsonb; fac numeric; main_t text; main_mp material_props; gem_t text; gem_pur int; gq jsonb; ge jsonb; gkey text; val numeric; nm text; with_txt text := ''; cname text; dmg numeric; v_tier int;
begin
  if et.id is null then raise exception 'equipamento inválido'; end if;
  b := et.base; qm := (k ->> 'qmod_base')::numeric + (k ->> 'qmod_span')::numeric * greatest(0, least(100, q)) / 100;
  for s in select * from equipment_slots where type_id = p_type order by sort loop
    m := mats -> s.slot; if m is null or m ->> 't' is null then continue; end if;
    if s.slot = 'gema' or (s.accepts = '{gema}') then gem_t := m ->> 't'; gem_pur := coalesce((m ->> 'purity')::int, 50); continue; end if;
    select * into mp from material_props where template_id = m ->> 't';
    if s.name_role = 'main' then main_t := m ->> 't'; main_mp := mp; end if;
    if s.name_role = 'with' and m ->> 't' not in ('tabua_comum','couro','fio_seda') then
      cname := mat_short(m ->> 't');
      with_txt := ' com ' || lower(s.name) || ' de ' || cname; end if;
    -- soma ponderada dos modificadores (cada componente pesa diferente em cada atributo)
    for stat, w in select x.key, x.value::numeric from jsonb_each_text(s.weights) x loop
      sum := sum || jsonb_build_object(stat, coalesce((sum ->> stat)::numeric, 0) + w * mat_mod(coalesce(mp.mods, '{}'), stat, et.kind));
    end loop;
  end loop;
  v_tier := coalesce((select t2.tier from item_templates t2 where t2.id = main_t), 1);
  -- atributos percentuais: base × (1 + soma/100) × qualidade (velocidade não escala com qualidade)
  for stat in select jsonb_object_keys(b) loop
    if stat in ('crit','acc') then continue; end if;
    fac := greatest((k ->> 'factor_min')::numeric, least((k ->> 'factor_max')::numeric, 1 + coalesce((sum ->> stat)::numeric, 0) / 100));
    res := res || jsonb_build_object(stat, round((b ->> stat)::numeric * fac * case when stat in ('aspd','speed') then 1 else qm end, 2));
  end loop;
  if et.kind = 'weapon' then
    dmg := (res ->> 'dmg')::numeric;
    res := res || jsonb_build_object('crit', round(coalesce((b ->> 'crit')::numeric, 0) + coalesce((sum ->> 'crit')::numeric, 0), 1), 'acc', round(coalesce((b ->> 'acc')::numeric, 0) + coalesce((sum ->> 'acc')::numeric, 0), 1),
      'magic_aff', round(coalesce((sum ->> 'magic')::numeric, 0)), 'dmin', round(dmg * 0.8, 1), 'dmax', round(dmg * 1.2, 1), 'wtype', et.wtype);
    if b ? 'matk' then res := res || jsonb_build_object('matk', round((b ->> 'matk')::numeric * greatest(0.2, 1 + coalesce((sum ->> 'magic')::numeric, 0) / 100) * qm, 1));
    elsif coalesce((sum ->> 'magic')::numeric, 0) > 0 then res := res || jsonb_build_object('matk', round(dmg * (sum ->> 'magic')::numeric / 100 * (k ->> 'magic_to_matk')::numeric, 1)); end if;
    if main_mp.elem is not null then res := res || jsonb_build_object('elem_' || main_mp.elem, round(dmg * (k ->> 'elem_from_main')::numeric, 1)); end if;
  elsif et.kind = 'armor' then
    res := res || jsonb_build_object('dodge', round(coalesce((sum ->> 'dodge')::numeric, 0), 1));
  elsif et.kind = 'tool' then
    res := res || jsonb_build_object('tool', (select props ->> 'tool' from item_templates where id = et.output_tpl), 'tier', v_tier);
  end if;
  -- gema: efeito pelo tipo de equipamento × qualidade da gema (joias amplificam pela magia do metal)
  if gem_t is not null then
    gq := gem_quality(gem_pur); ge := (select effect from gem_effects where gem = gem_t and target = et.kind);
    for gkey, val in select x.key, x.value::numeric from jsonb_each_text(coalesce(ge, '{}')) x loop
      val := val * (gq ->> 'mult')::numeric * case when et.kind = 'jewel' then 1 + greatest(0, coalesce((main_mp.mods ->> 'magic')::numeric, 0)) / 100 else 1 end;
      if gkey = 'dur_pct' then res := jsonb_set(res, '{dur}', to_jsonb(round((res ->> 'dur')::numeric * (1 + val / 100))));
      else res := res || jsonb_build_object(gkey, round(coalesce((res ->> gkey)::numeric, 0) + val, case when gkey in ('luck','eff','speed') then 3 else 1 end)); end if;
    end loop;
    res := res || jsonb_build_object('gem', jsonb_build_object('t', gem_t, 'name', (select name from item_templates where id = gem_t), 'quality', gq ->> 'name', 'purity', gem_pur));
  end if;
  nm := et.label || ' de ' || coalesce(mat_short(main_t), 'material') || with_txt
    || coalesce(' e ' || lower((select name from item_templates where id = gem_t)), '');
  res := res || jsonb_build_object('name', upper(left(nm, 1)) || substr(nm, 2), 'maxdur', res -> 'dur', 'kind', et.kind, 'equip_type', p_type, 'mods', sum);
  return res;
end $$;

-- lê os componentes escolhidos: {slot: {t, purity} | {item}} → materiais com pureza; valida compatibilidade e requisito
create or replace function modular_resolve(cid uuid, p_type text, p_slots jsonb, strict boolean) returns jsonb language plpgsql as $$
declare et equipment_types := (select x from equipment_types x where x.id = p_type); s equipment_slots; v jsonb; t item_templates; it items; out jsonb := '{}'; miss jsonb := '[]'; mpr int; pl int; have int;
begin
  pl := prof_level(cid, et.profession_id);
  for s in select * from equipment_slots where type_id = p_type order by sort loop
    v := p_slots -> s.slot;
    if v is null or (v ->> 't' is null and v ->> 'item' is null) then if s.required then miss := miss || jsonb_build_object('slot', s.slot, 'why', 'escolha o material de ' || lower(s.name)); end if; continue; end if;
    if v ? 'item' then
      -- peça já fabricada (lâmina, guarda, cabo...) entra no lugar do material
      select i.* into it from items i join inventory inv on inv.item_id = i.id where i.id = (v ->> 'item')::uuid and inv.character_id = cid and inv.container = 'bag';
      if it.id is null then raise exception 'peça não está na mochila'; end if;
      out := out || jsonb_build_object(s.slot, jsonb_build_object('t', it.roll ->> 'mat', 'purity', coalesce((it.roll ->> 'purity')::int, 50), 'item', it.id, 'part_q', it.roll ->> 'quality'));
      continue;
    end if;
    select * into t from item_templates where id = v ->> 't';
    if t.id is null or not (t.category = any(s.accepts)) or (s.only_ids is not null and not (t.id = any(s.only_ids))) then raise exception '% não serve em % (aceita: %)', coalesce(t.name, v ->> 't'), lower(s.name), array_to_string(s.accepts, ', '); end if;
    if t.category <> 'gema' and not exists (select 1 from material_props where template_id = t.id) then raise exception '% ainda não tem propriedades de fabricação', t.name; end if;
    mpr := coalesce((select req_level from material_props where template_id = t.id), 1);
    if pl < mpr then miss := miss || jsonb_build_object('slot', s.slot, 'why', format('%s pede %s nível %s', t.name, (select name from professions where id = et.profession_id), mpr)); end if;
    select coalesce(sum(qty), 0) into have from inventory_stacks where character_id = cid and template_id = t.id and (v ->> 'purity' is null or purity = (v ->> 'purity')::int);
    if have < s.qty then miss := miss || jsonb_build_object('slot', s.slot, 'why', format('faltam %s × %s', s.qty - have, t.name)); end if;
    out := out || jsonb_build_object(s.slot, jsonb_build_object('t', t.id, 'purity', coalesce((v ->> 'purity')::int, (select max(purity) from inventory_stacks where character_id = cid and template_id = t.id), 50), 'qty', s.qty));
  end loop;
  if strict and jsonb_array_length(miss) > 0 then raise exception '%', miss -> 0 ->> 'why'; end if;
  return jsonb_build_object('mats', out, 'missing', miss);
end $$;
create or replace function modular_quality(cid uuid, p_type text, mats jsonb) returns numeric language plpgsql stable as $$
declare et equipment_types := (select x from equipment_types x where x.id = p_type); pl int := prof_level(cid, et.profession_id); avg_p numeric; tl jsonb := tool_of(cid, 'martelo');
begin
  select avg((x.value ->> 'purity')::numeric) into avg_p from jsonb_each(mats) x where x.key <> 'gema';
  return greatest(0, least(100, coalesce(avg_p, 50) * 0.55 + least(cfgn('craft','quality_skill_cap'), pl * 0.5) * 0.6 + case when et.profession_id = 'ferraria' then coalesce((tl ->> 'tier')::numeric, 1) * 2 else 2 end + 10));
end $$;

-- prévia: atributos na qualidade esperada e o intervalo possível (±ruído), sem consumir nada
create or replace function modular_preview(p_type text, p_slots jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; et equipment_types; r jsonb; q numeric; n numeric := cfgn('craft_v2','noise') * 2; pl int; main_tier int;
begin
  select * into c from characters where user_id = auth.uid(); if c.id is null then raise exception 'sem personagem'; end if;
  select * into et from equipment_types where id = p_type; if et.id is null then raise exception 'equipamento inválido'; end if;
  r := modular_resolve(c.id, p_type, p_slots, false); q := modular_quality(c.id, p_type, r -> 'mats'); pl := prof_level(c.id, et.profession_id);
  main_tier := coalesce((select t.tier from equipment_slots s join item_templates t on t.id = r -> 'mats' -> s.slot ->> 't' where s.type_id = p_type and s.name_role = 'main'), 1);
  return jsonb_build_object('expected', modular_eval(p_type, r -> 'mats', q), 'low', modular_eval(p_type, r -> 'mats', q - n), 'high', modular_eval(p_type, r -> 'mats', q + n),
    'quality', round(q), 'quality_low', round(greatest(0, q - n)), 'quality_high', round(least(100, q + n)), 'missing', r -> 'missing',
    'req_level', et.req_level, 'prof_level', pl, 'prof', et.profession_id, 'gold', et.gold_cost * main_tier, 'seconds', round(et.seconds / (1 + pl * 0.006), 1),
    'ok', jsonb_array_length(r -> 'missing') = 0 and pl >= et.req_level);
end $$;

-- fabricar: valida tudo, consome materiais e gold na hora (trava as linhas) e cria o trabalho; o resultado sai no craft_finish
create or replace function forge_modular_start(p_type text, p_slots jsonb, p_enchant text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; et equipment_types; r jsonb; s equipment_slots; m jsonb; consumed jsonb := '[]'; n int; last timestamptz; pl int; tl jsonb; cost bigint; g bigint; secs numeric; jid uuid; en enchantments; main_tier int; need int; st record; take int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into et from equipment_types where id = p_type; if et.id is null then raise exception 'equipamento inválido'; end if;
  pl := prof_level(c.id, et.profession_id); if pl < et.req_level then raise exception 'precisa de % nível %', (select name from professions where id = et.profession_id), et.req_level; end if;
  if et.profession_id = 'ferraria' then tl := tool_of(c.id, 'martelo'); if tl is null then raise exception 'precisa de um martelo de ferreiro'; end if; end if;
  select count(*) into n from craft_jobs where character_id = c.id and status = 'ativo'; if n >= 3 then raise exception 'oficina cheia: no máximo 3 trabalhos ao mesmo tempo'; end if;
  select max(started_at) into last from craft_jobs where character_id = c.id; if last > now() - make_interval(secs => cfgn('craft','job_min_gap_s')) then raise exception 'devagar'; end if;
  select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n >= 20 then raise exception 'mochila cheia'; end if;
  r := modular_resolve(c.id, p_type, p_slots, true);
  for s in select * from equipment_slots where type_id = p_type order by sort loop
    m := r -> 'mats' -> s.slot; if m is null then continue; end if;
    if m ? 'item' then delete from inventory where item_id = (m ->> 'item')::uuid and character_id = c.id; consumed := consumed || (m || jsonb_build_object('slot', s.slot, 'part_item', true));
    else
      need := s.qty;
      for st in select * from inventory_stacks where character_id = c.id and template_id = m ->> 't' and (p_slots -> s.slot ->> 'purity' is null or purity = (p_slots -> s.slot ->> 'purity')::int) order by purity desc for update loop
        exit when need <= 0; take := least(need, st.qty); perform stack_take(c.id, st.template_id, st.purity, take); consumed := consumed || jsonb_build_object('slot', s.slot, 't', st.template_id, 'purity', st.purity, 'q', take); need := need - take;
      end loop;
      if need > 0 then raise exception 'faltam % × %', need, (select name from item_templates where id = m ->> 't'); end if;
    end if;
  end loop;
  if p_enchant is not null and p_enchant <> '' then
    select * into en from enchantments where id = p_enchant and slot is not null; if en.id is null then raise exception 'encantamento inválido'; end if;
    if prof_level(c.id, 'encantamento') < en.req_level then raise exception 'precisa de Encantamento nível %', en.req_level; end if;
    perform stack_take(c.id, en.cost ->> 't', (select purity from inventory_stacks where character_id = c.id and template_id = en.cost ->> 't' and qty >= (en.cost ->> 'q')::int order by purity desc limit 1), (en.cost ->> 'q')::int);
    consumed := consumed || jsonb_build_object('enchant', en.id, 'gold', (en.cost ->> 'gold')::bigint);
  end if;
  main_tier := coalesce((select t.tier from equipment_slots s2 join item_templates t on t.id = r -> 'mats' -> s2.slot ->> 't' where s2.type_id = p_type and s2.name_role = 'main'), 1);
  cost := et.gold_cost * main_tier + coalesce((select (x ->> 'gold')::bigint from jsonb_array_elements(consumed) x where x ? 'enchant'), 0);
  select gold into g from wallets where character_id = c.id for update; if g < cost then raise exception 'custa % gold', cost; end if;
  if cost > 0 then perform add_gold(c.id, -cost, 'oficina', 'modular_' || p_type); end if;
  secs := et.seconds / (1 + pl * 0.006);
  insert into craft_jobs(character_id, recipe_id, technique, qty, consumed, ready_at) values (c.id, 'modular_' || p_type, 'modular', 1, consumed, now() + make_interval(secs => secs)) returning id into jid;
  return jsonb_build_object('job', jid, 'seconds', round(secs, 1), 'state', get_state());
end $$;

-- monta o resultado (chamado pelo craft_finish): qualidade com um pouco de sorte, raridade, nome, procedência, encanto
create or replace function modular_finish(c characters, j craft_jobs, rc recipes) returns jsonb language plpgsql as $$
declare p_type text := substr(rc.id, 9); et equipment_types := (select x from equipment_types x where x.id = substr(rc.id, 9)); mats jsonb := '{}'; e jsonb; q numeric; res jsonb; rar int; n int; nid uuid; en enchantments; fx jsonb := '{}'; sk jsonb := cfg('craft_v2') -> 'sockets'; x jsonb; partq numeric := 0; pn int := 0;
begin
  for e in select * from jsonb_array_elements(j.consumed) loop
    if e ? 'slot' and not mats ? (e ->> 'slot') then mats := mats || jsonb_build_object(e ->> 'slot', jsonb_build_object('t', e ->> 't', 'purity', (e ->> 'purity')::int)); end if;
    if e ? 'part_q' then partq := partq + (e ->> 'part_q')::numeric; pn := pn + 1; end if;
  end loop;
  q := modular_quality(c.id, p_type, mats) + rand_normal() * cfgn('craft_v2','noise') + case when pn > 0 then (partq / pn - 50) * 0.1 else 0 end;
  q := greatest(0, least(100, q));
  res := modular_eval(p_type, mats, q);
  rar := rarity_from_quality(q); if random() < clan_level(c.id, 'forja') * (cfg('clan_buildings') -> 'forja' ->> 'per_level')::numeric / 100 then rar := least(7, rar + 1); end if;
  res := res || jsonb_build_object('quality', round(q), 'purity', round((select avg((value ->> 'purity')::numeric) from jsonb_each(mats) where key <> 'gema')), 'maker', c.name, 'made_at', now(),
    'origin', 'Oficina de ' || c.name, 'realm', (select name from worlds where id = c.world_id), 'gems', '[]'::jsonb, 'ench', '[]'::jsonb, 'upgrade', 0,
    'components', (select jsonb_object_agg(key, value || jsonb_build_object('mat_name', (select name from item_templates where id = value ->> 't'))) from jsonb_each(mats)));
  for x in select * from jsonb_array_elements(sk) loop if q >= (x ->> 0)::numeric then res := res || jsonb_build_object('sockets', (x ->> 1)::int); exit; end if; end loop;
  -- encanto escolhido na fabricação entra no nível I
  select ee.* into en from jsonb_array_elements(j.consumed) z join enchantments ee on ee.id = z ->> 'enchant' limit 1;
  if en.id is not null then res := res || jsonb_build_object('enchants', jsonb_build_object(en.slot, jsonb_build_object('id', en.id, 'tier', 1, 'name', en.name)), 'ench_fx', en.effect); end if;
  select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n >= 20 then raise exception 'mochila cheia'; end if;
  insert into items(template_id, rarity, roll, origin, crafted_by, crafted_at) values (et.output_tpl, rar, res - 'mods', 'oficina', c.name, now()) returning id into nid;
  insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', n);
  insert into account_audit_log(user_id, action, meta) values (c.user_id, 'fabricou', jsonb_build_object('item', nid, 'tipo', p_type, 'rarity', rar, 'quality', round(q)));
  return res || jsonb_build_object('id', nid, 'rarity', rar);
end $$;

-- nome personalizado pra equipamento excepcional
create or replace function rename_item(p_item uuid, p_name text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; it items; nm text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')); k jsonb := cfg('craft_v2');
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select i.* into it from items i join inventory v on v.item_id = i.id where i.id = p_item and v.character_id = c.id and v.container in ('bag','equip','protected') for update of i;
  if it.id is null then raise exception 'item não é seu'; end if;
  if it.roll ->> 'maker' is null then raise exception 'só equipamento fabricado recebe nome'; end if;
  if coalesce((it.roll ->> 'quality')::numeric, 0) < (k ->> 'rename_min_quality')::numeric and it.rarity < (k ->> 'rename_min_rarity')::int then raise exception 'só equipamento excepcional (qualidade % ou raridade Lendária+) recebe nome', k ->> 'rename_min_quality'; end if;
  if it.roll ? 'custom_name' then raise exception 'esse equipamento já tem nome'; end if;
  if length(nm) < 3 or length(nm) > 28 or nm !~ '^[[:alnum:] ''çÇáéíóúâêôãõÁÉÍÓÚÂÊÔÃÕàÀ-]+$' then raise exception 'nome: 3 a 28 letras, números e espaços'; end if;
  if lower(nm) ~ '(admin|moderador|anthropic|claude|staff)' then raise exception 'nome não permitido'; end if;
  update items set roll = roll || jsonb_build_object('custom_name', nm) where id = it.id;
  return get_state();
end $$;
-- oficina: trabalho modular termina pelo craft_finish de sempre (trava, idempotência e experiência iguais)
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
    pur := greatest(0, least(100, round(avg_p + (tech ->> 'purity_gain')::numeric * (0.6 + pl / 250.0) + rand_normal() * (tech ->> 'spread')::numeric)));
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
end $$;
-- =====================================================================================
-- OFÍCIOS V2 — parte 3: pedras brutas e Centro de Processamento
-- =====================================================================================
create table if not exists stone_types (id text primary key references item_templates(id), origin text not null, regions text[] not null default '{}', worlds int[] not null default '{1}', sort int default 0);
create table if not exists stone_methods (id text primary key, name text not null, description text, cost int not null, secs numeric not null, req_level int not null default 1, mults jsonb not null, gem_purity int not null default 0, only_stones text[], sort int default 0);
create table if not exists stone_loot (stone_id text not null references stone_types(id) on delete cascade, template_id text not null references item_templates(id), category text not null check (category in ('residue','ore','gem','crystal','special')),
  p numeric not null check (p > 0 and p < 1), min_prof int not null default 1, only_method text, pur_min int not null default 20, pur_max int not null default 70, primary key (stone_id, template_id));
create table if not exists stone_jobs (id uuid primary key default gen_random_uuid(), character_id uuid not null references characters(id) on delete cascade, stone_id text not null, method_id text not null, qty int not null, cost bigint not null,
  started_at timestamptz default now(), ready_at timestamptz not null, status text not null default 'ativo' check (status in ('ativo','pronto')), result jsonb not null, report jsonb);
alter table stone_types enable row level security; alter table stone_methods enable row level security; alter table stone_loot enable row level security; alter table stone_jobs enable row level security;
drop policy if exists read_st on stone_types; create policy read_st on stone_types for select to authenticated using (true);
drop policy if exists read_sm on stone_methods; create policy read_sm on stone_methods for select to authenticated using (true);
drop policy if exists read_sl on stone_loot; create policy read_sl on stone_loot for select to authenticated using (true);

insert into stone_types(id, origin, regions, worlds, sort) values
 ('pedra_comum','Planícies','{campos}','{1}',1),('pedra_sedimentar','Rios e cavernas','{floresta,pantano}','{1}',2),('pedra_montanhosa','Montanhas','{montanhas}','{1}',3),
 ('pedra_glacial','Frostheim','{montanhas,floresta,ruinas}','{2}',4),('pedra_arenosa','Solkar','{campos,pantano,minas}','{2}',5),('pedra_ancestral','Viridion','{floresta,pantano,campos}','{3}',6),
 ('pedra_vulcanica','Ignareth','{minas,montanhas,ruinas}','{1,3}',7),('pedra_corrompida','Nocthar','{ruinas}','{1,4}',8),('pedra_dimensional','Dimensões','{}','{5}',9),('pedra_primordial','Áreas secretas','{}','{4,5}',10)
on conflict (id) do update set origin = excluded.origin, regions = excluded.regions, worlds = excluded.worlds, sort = excluded.sort;
-- que pedra sai de uma rocha: região + mundo (mundos 4 e 5 têm pedra própria em todo lugar)
create or replace function stone_for(p_region text, p_world int) returns text language sql stable as $$
  select coalesce(
    (select case when p_world = 4 then 'pedra_corrompida' when p_world >= 5 then 'pedra_dimensional' end),
    (select id from stone_types where p_world = any(worlds) and p_region = any(regions) order by sort limit 1),
    (select id from stone_types where p_world = any(worlds) order by sort limit 1), 'pedra_comum') $$;

insert into stone_methods(id, name, description, cost, secs, req_level, mults, gem_purity, only_stones, sort) values
 ('comum','Trituração comum','Barato e rápido. Recupera o básico, mas quebra materiais delicados.',2,0.05,1,'{"residue":1.1,"ore":1.0,"gem":0.6,"crystal":0.4,"special":0.5}',-10,null,1),
 ('separacao','Separação mineral','Custo médio. Recupera mais minério e menos gema.',5,0.08,10,'{"residue":0.8,"ore":1.4,"gem":0.7,"crystal":0.8,"special":0.8}',0,null,2),
 ('delicada','Extração delicada','Caro e demorado. Preserva gemas e materiais frágeis.',12,0.2,20,'{"residue":0.7,"ore":0.9,"gem":1.7,"crystal":1.2,"special":1.0}',15,null,3),
 ('arcano','Processamento arcano','Pede profissional avançado. Recupera cristais e propriedades mágicas.',40,0.3,40,'{"residue":0.5,"ore":0.9,"gem":1.2,"crystal":2.5,"special":1.5}',10,null,4),
 ('dimensional','Processamento dimensional','Só pra pedras dimensionais e primordiais. Necessário pra materiais dimensionais.',150,0.5,60,'{"residue":0.5,"ore":1.0,"gem":1.0,"crystal":2.0,"special":3.0}',10,'{pedra_dimensional,pedra_primordial}',5)
on conflict (id) do update set name = excluded.name, description = excluded.description, cost = excluded.cost, secs = excluded.secs, req_level = excluded.req_level, mults = excluded.mults, gem_purity = excluded.gem_purity, only_stones = excluded.only_stones;

delete from stone_loot;
insert into stone_loot(stone_id, template_id, category, p, min_prof, only_method, pur_min, pur_max) values
 -- comum (planícies): cobre, estanho, ferro e quartzo; o resto é raríssimo
 ('pedra_comum','pedra','residue',0.20,1,null,20,60),('pedra_comum','minerio_cobre','ore',0.10,1,null,25,70),('pedra_comum','minerio_estanho','ore',0.04,1,null,25,70),('pedra_comum','minerio_ferro','ore',0.05,1,null,25,65),
 ('pedra_comum','minerio_prata','ore',0.005,5,null,25,65),('pedra_comum','pepita_ouro','ore',0.002,5,null,25,65),('pedra_comum','gema_bruta','gem',0.01,1,null,10,60),('pedra_comum','rubi_bruto','gem',0.0006,5,null,10,60),('pedra_comum','safira_bruta','gem',0.0004,5,null,10,60),
 ('pedra_comum','minerio_mitril','ore',0.0005,25,null,30,70),('pedra_comum','minerio_adamantita','ore',0.00002,45,null,30,70),('pedra_comum','cristal_celestial','crystal',0.000002,60,null,40,80),('pedra_comum','fragmento_primordial','special',0.0000005,80,null,50,90),
 -- sedimentar (rios e cavernas): ferro, prata e gemas
 ('pedra_sedimentar','pedra','residue',0.22,1,null,20,60),('pedra_sedimentar','minerio_ferro','ore',0.08,1,null,25,70),('pedra_sedimentar','minerio_cobre','ore',0.04,1,null,25,70),('pedra_sedimentar','minerio_prata','ore',0.02,5,null,25,70),
 ('pedra_sedimentar','gema_bruta','gem',0.02,1,null,10,60),('pedra_sedimentar','safira_bruta','gem',0.003,5,null,10,65),('pedra_sedimentar','esmeralda_bruta','gem',0.003,5,null,10,65),('pedra_sedimentar','ametista_bruta','gem',0.002,10,null,10,65),('pedra_sedimentar','opala_bruta','gem',0.0005,20,null,10,65),
 -- montanhosa: a tabela de referência do pedido (ferro, ouro e mitril)
 ('pedra_montanhosa','pedra','residue',0.20,1,null,20,60),('pedra_montanhosa','minerio_cobre','ore',0.10,1,null,25,70),('pedra_montanhosa','minerio_ferro','ore',0.07,1,null,25,70),('pedra_montanhosa','minerio_prata','ore',0.02,5,null,25,70),
 ('pedra_montanhosa','pepita_ouro','ore',0.005,5,null,25,70),('pedra_montanhosa','gema_bruta','gem',0.003,1,null,10,60),('pedra_montanhosa','rubi_bruto','gem',0.0003,5,null,10,65),('pedra_montanhosa','safira_bruta','gem',0.0003,5,null,10,65),('pedra_montanhosa','esmeralda_bruta','gem',0.0003,5,null,10,65),
 ('pedra_montanhosa','minerio_mitril','ore',0.001,20,null,30,75),('pedra_montanhosa','minerio_adamantita','ore',0.00009,40,null,30,75),('pedra_montanhosa','cristal_celestial','crystal',0.000009,55,null,40,85),('pedra_montanhosa','fragmento_primordial','special',0.000001,75,null,50,90),
 -- glacial (Frostheim): cristais de gelo e metais
 ('pedra_glacial','pedra','residue',0.20,1,null,20,60),('pedra_glacial','cristal_gelo','crystal',0.03,1,null,30,75),('pedra_glacial','minerio_prata','ore',0.03,1,null,30,70),('pedra_glacial','minerio_ferro','ore',0.06,1,null,30,70),
 ('pedra_glacial','minerio_mitril','ore',0.004,20,null,30,75),('pedra_glacial','safira_bruta','gem',0.004,5,null,15,70),('pedra_glacial','pedra_lunar_bruta','gem',0.0015,20,null,15,70),('pedra_glacial','diamante_bruto','gem',0.0008,40,null,20,75),
 -- arenosa (Solkar): ouro, rubis e topázios
 ('pedra_arenosa','pedra','residue',0.20,1,null,20,60),('pedra_arenosa','pepita_ouro','ore',0.04,1,null,30,70),('pedra_arenosa','minerio_cobre','ore',0.06,1,null,25,70),('pedra_arenosa','rubi_bruto','gem',0.006,5,null,15,70),
 ('pedra_arenosa','topazio_bruto','gem',0.008,5,null,15,70),('pedra_arenosa','pedra_solar_bruta','gem',0.0015,20,null,15,70),('pedra_arenosa','diamante_bruto','gem',0.0005,40,null,20,75),
 -- ancestral (Viridion): gemas naturais e materiais mágicos
 ('pedra_ancestral','pedra','residue',0.18,1,null,20,60),('pedra_ancestral','raiz_antiga','residue',0.01,1,null,30,70),('pedra_ancestral','po_arcano','crystal',0.03,1,null,30,70),('pedra_ancestral','esmeralda_bruta','gem',0.008,5,null,15,75),
 ('pedra_ancestral','ametista_bruta','gem',0.006,5,null,15,75),('pedra_ancestral','opala_bruta','gem',0.004,15,null,15,75),('pedra_ancestral','pedra_lunar_bruta','gem',0.002,20,null,15,75),('pedra_ancestral','cristal_celestial','crystal',0.00005,55,null,40,85),
 -- vulcânica (Ignareth): obsidiana e metais resistentes
 ('pedra_vulcanica','pedra','residue',0.20,1,null,20,60),('pedra_vulcanica','carvao','residue',0.08,1,null,30,70),('pedra_vulcanica','obsidiana','ore',0.04,10,null,30,75),('pedra_vulcanica','minerio_ferro','ore',0.08,1,null,30,70),
 ('pedra_vulcanica','minerio_adamantita','ore',0.002,40,null,30,75),('pedra_vulcanica','rubi_bruto','gem',0.005,5,null,15,70),('pedra_vulcanica','pedra_solar_bruta','gem',0.001,20,null,15,70),('pedra_vulcanica','diamante_bruto','gem',0.001,40,null,20,75),
 -- corrompida (Nocthar): ônix e cristais sombrios
 ('pedra_corrompida','pedra','residue',0.18,1,null,20,60),('pedra_corrompida','onix_bruto','gem',0.02,5,null,15,70),('pedra_corrompida','cristal_sombrio','crystal',0.02,20,null,30,75),('pedra_corrompida','essencia_sombria','crystal',0.02,10,null,30,75),
 ('pedra_corrompida','minerio_adamantita','ore',0.003,40,null,30,75),('pedra_corrompida','cristal_vazio_bruto','gem',0.0006,50,null,20,75),('pedra_corrompida','fragmento_primordial','special',0.00002,75,null,50,90),
 -- dimensional (mundo 5): materiais dimensionais exigem o método dimensional
 ('pedra_dimensional','pedra','residue',0.15,1,null,20,60),('pedra_dimensional','fragmento_dimensional','special',0.03,60,'dimensional',40,85),('pedra_dimensional','cristal_vazio_bruto','gem',0.004,50,null,20,80),
 ('pedra_dimensional','cristal_celestial','crystal',0.0008,55,null,40,85),('pedra_dimensional','cristal_primordial_bruto','gem',0.00005,80,'dimensional',30,85),('pedra_dimensional','fragmento_primordial','special',0.00005,75,null,50,90),
 -- primordial (áreas secretas)
 ('pedra_primordial','pedra','residue',0.10,1,null,30,70),('pedra_primordial','fragmento_dimensional','special',0.01,60,'dimensional',40,90),('pedra_primordial','cristal_celestial','crystal',0.005,55,null,50,90),
 ('pedra_primordial','fragmento_primordial','special',0.002,75,null,50,95),('pedra_primordial','cristal_primordial_bruto','gem',0.001,80,'dimensional',30,90);

-- probabilidades finais pra uma pedra, um método e um nível: o método multiplica por categoria; se passar de 100%, tudo encolhe junto; "nada" é o resto
create or replace function stone_probs(p_stone text, p_method text, p_level int) returns jsonb language plpgsql stable as $$
declare mt stone_methods := (select x from stone_methods x where x.id = p_method); rows jsonb := '[]'; s numeric := 0; k numeric := 1; r record;
begin
  for r in select l.*, t.name, t.base_rarity from stone_loot l join item_templates t on t.id = l.template_id where l.stone_id = p_stone order by l.p desc loop
    if r.min_prof > p_level or (r.only_method is not null and r.only_method <> p_method) then continue; end if;
    rows := rows || jsonb_build_object('t', r.template_id, 'name', r.name, 'cat', r.category, 'rarity', r.base_rarity, 'p', r.p * coalesce((mt.mults ->> r.category)::numeric, 1), 'pur_min', r.pur_min, 'pur_max', r.pur_max);
    s := s + r.p * coalesce((mt.mults ->> r.category)::numeric, 1);
  end loop;
  if s > 1 then k := 1 / s; end if;
  return jsonb_build_object('entries', (select coalesce(jsonb_agg(x || jsonb_build_object('p', round((x ->> 'p')::numeric * k, 10))), '[]') from jsonb_array_elements(rows) x), 'none', round(greatest(0, 1 - s * k), 10), 'sum', round(s * k + greatest(0, 1 - s * k), 10));
end $$;

-- processar em lote: consome as pedras e o gold na hora, sorteia TUDO no servidor e guarda; o jogador só vê quando terminar (não dá pra cancelar e tentar de novo)
create or replace function process_stones_start(p_stone text, p_method text, p_qty int, p_purity int default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; mt stone_methods; lvl int; pr jsonb; e jsonb; r double precision; acc numeric; got jsonb := '{}'; lost int := 0; i int; need int; st record; take int; cost bigint; g bigint; secs numeric; jid uuid; pur int; key text; n int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if not exists (select 1 from stone_types where id = p_stone) then raise exception 'isso não é pedra bruta'; end if;
  select * into mt from stone_methods where id = p_method; if mt.id is null then raise exception 'método inválido'; end if;
  lvl := prof_level(c.id, 'processamento'); if lvl < mt.req_level then raise exception '% pede Processamento mineral nível %', mt.name, mt.req_level; end if;
  if mt.only_stones is not null and not (p_stone = any(mt.only_stones)) then raise exception '% só serve pra pedras dimensionais e primordiais', mt.name; end if;
  if p_qty < 1 or p_qty > 10000 then raise exception 'quantidade de 1 a 10.000'; end if;
  select count(*) into n from stone_jobs where character_id = c.id and status = 'ativo'; if n >= 2 then raise exception 'o Centro processa no máximo 2 lotes seus por vez'; end if;
  cost := mt.cost::bigint * p_qty; select gold into g from wallets where character_id = c.id for update; if g < cost then raise exception 'o serviço custa % gold', cost; end if;
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
end $$;
create or replace function process_stones_finish(p_job uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; j stone_jobs; k text; v int; t text; pur int; mats jsonb := '{}'; value bigint := 0; exp bigint; lvl int; tm item_templates;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into j from stone_jobs where id = p_job and character_id = c.id for update; if j.id is null or j.status <> 'ativo' then raise exception 'lote já entregue'; end if;
  if j.ready_at > now() then raise exception 'ainda processando: falta % s', ceil(extract(epoch from (j.ready_at - now()))); end if;
  for k, v in select x.key, x.value::int from jsonb_each_text(j.result -> 'got') x loop
    t := split_part(k, '|', 1); pur := split_part(k, '|', 2)::int; perform stack_add(c.id, t, pur, v);
    select * into tm from item_templates where id = t;
    mats := mats || jsonb_build_object(t, jsonb_build_object('name', tm.name, 'qty', coalesce((mats -> t ->> 'qty')::int, 0) + v, 'rarity', tm.base_rarity, 'value', coalesce((mats -> t ->> 'value')::bigint, 0) + floor(tm.sell * v * (0.6 + pur / 100.0 * 0.6))));
    value := value + floor(tm.sell * v * (0.6 + pur / 100.0 * 0.6));
  end loop;
  exp := ceil(j.qty * (1 + coalesce((select tier from item_templates where id = j.stone_id), 1)) * 0.6); lvl := prof_gain(c.id, 'processamento', exp);
  update stone_jobs set status = 'pronto', report = jsonb_build_object('qty', j.qty, 'lost', (j.result ->> 'lost')::int, 'found', j.qty - (j.result ->> 'lost')::int, 'materials', mats, 'exp', exp, 'level', lvl, 'cost', j.cost, 'value', value,
    'stone', (select name from item_templates where id = j.stone_id), 'method', (select name from stone_methods where id = j.method_id)) where id = j.id;
  if exists (select 1 from jsonb_each(mats) x where (x.value ->> 'rarity')::int >= 4) then insert into account_audit_log(user_id, action, meta) values (c.user_id, 'processamento_raro', jsonb_build_object('job', j.id, 'mats', mats)); end if;
  return jsonb_build_object('report', (select report from stone_jobs where id = j.id), 'state', get_state());
end $$;
create or replace function processing_view() returns jsonb language plpgsql security definer set search_path = public stable as $$
declare c characters; lvl int;
begin
  select * into c from characters where user_id = auth.uid(); if c.id is null then raise exception 'sem personagem'; end if;
  lvl := prof_level(c.id, 'processamento');
  return jsonb_build_object('level', lvl,
    'methods', (select coalesce(jsonb_agg(to_jsonb(m) order by m.sort), '[]') from stone_methods m),
    'stones', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', t.name, 'origin', st.origin, 'have', coalesce((select sum(qty) from inventory_stacks s where s.character_id = c.id and s.template_id = st.id), 0),
       'probs', (select jsonb_object_agg(m.id, stone_probs(st.id, m.id, lvl)) from stone_methods m)) order by st.sort), '[]') from stone_types st join item_templates t on t.id = st.id),
    'jobs', (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'stone', (select name from item_templates where id = j.stone_id), 'method', (select name from stone_methods where id = j.method_id), 'qty', j.qty, 'cost', j.cost, 'ready_at', j.ready_at, 'status', j.status, 'report', j.report) order by j.started_at desc), '[]')
       from (select * from stone_jobs where character_id = c.id order by started_at desc limit 8) j));
end $$;
-- =====================================================================================
-- OFÍCIOS V2 — parte 4: lojas da cidade e armazém
-- =====================================================================================
create table if not exists npc_shops (id text primary key, name text not null, npc_title text not null, look text not null default 'mercador', services text[] not null default '{}', professions text[] not null default '{}', equip_types text[] not null default '{}',
  description text, sell_mult numeric not null default 1, sort int default 0);
create table if not exists npc_shop_items (shop_id text not null references npc_shops(id) on delete cascade, template_id text not null references item_templates(id), price int not null, stock_max int, restock_h int not null default 6, primary key (shop_id, template_id));
create table if not exists npc_shop_buys (shop_id text not null references npc_shops(id) on delete cascade, rule text not null, primary key (shop_id, rule));   -- "cat:barra", "tag:gem", "tpl:couro_cru", "any"
create table if not exists npc_shop_stock (shop_id text not null, template_id text not null, stock int not null, refreshed_at timestamptz not null default now(), primary key (shop_id, template_id));
alter table npc_shops enable row level security; alter table npc_shop_items enable row level security; alter table npc_shop_buys enable row level security; alter table npc_shop_stock enable row level security;
drop policy if exists read_ns on npc_shops; create policy read_ns on npc_shops for select to authenticated using (true);
drop policy if exists read_nsi on npc_shop_items; create policy read_nsi on npc_shop_items for select to authenticated using (true);
drop policy if exists read_nsb on npc_shop_buys; create policy read_nsb on npc_shop_buys for select to authenticated using (true);

insert into npc_shops(id, name, npc_title, look, services, professions, equip_types, description, sell_mult, sort) values
 ('ferreiro','Ferreiro','Ferreiro','ferreiro','{buy,sell,modular,craft,repair}','{ferraria}','{espada,adaga,machado,martelo,armadura,escudo,elmo}','Fabrica, compra, vende e conserta armas e armaduras.',1.0,1),
 ('metalurgica','Metalúrgica','Metalurgista','ferreiro','{buy,sell,craft}','{metalurgia}','{}','Fundição, purificação e ligas metálicas.',1.0,2),
 ('lapidaria','Lapidaria','Lapidário','banqueiro','{buy,sell,craft}','{lapidacao}','{}','Identifica a qualidade, trata e lapida gemas.',1.0,3),
 ('processamento','Centro de Processamento','Processador','guarda','{buy,sell,process}','{processamento}','{}','Tritura e separa pedras brutas: o que tem dentro só aparece aqui.',1.0,4),
 ('carpintaria','Carpintaria','Carpinteiro','ferreiro','{buy,sell,modular,craft}','{carpintaria}','{arco,cajado,bastao}','Componentes de madeira, arcos, cajados e cabos.',1.0,5),
 ('alquimista','Alquimista','Alquimista','sacerdote','{buy,sell,craft}','{alquimia}','{}','Poções e reagentes.',1.0,6),
 ('curtume','Curtume','Curtidor','druid','{buy,sell,craft}','{caca}','{}','Trata peles, couros, chifres e ossos de criaturas.',1.0,7),
 ('joalheria','Joalheria','Joalheiro','banqueiro','{buy,sell,modular,craft}','{joalheria}','{anel,amuleto}','Anéis, amuletos e acessórios.',1.0,8),
 ('encantador','Encantador','Encantador','sacerdote','{buy,sell,enchant}','{encantamento}','{}','Aplica propriedades mágicas aos equipamentos.',1.0,9),
 ('ferramentas','Loja de Ferramentas','Ferramenteiro','mercador','{buy,sell,modular,repair}','{ferraria}','{picareta,machado_lenhador,foice}','Compra, venda, fabricação e conserto de ferramentas.',1.0,10),
 ('armazem','Armazém','Banqueiro','banqueiro','{storage}','{}','{}','Guarda recursos e equipamentos fora da mochila.',1.0,11),
 ('mercador','Mercador Geral','Mercador','mercador','{buy,sell}','{comercio}','{}','Produtos básicos. Compra de tudo, mas paga menos que os especialistas.',0.6,12),
 ('market','Market','Leiloeiro','mercador','{market}','{comercio}','{}','Negociação entre jogadores.',1.0,13)
on conflict (id) do update set name = excluded.name, npc_title = excluded.npc_title, look = excluded.look, services = excluded.services, professions = excluded.professions, equip_types = excluded.equip_types, description = excluded.description, sell_mult = excluded.sell_mult, sort = excluded.sort;
delete from npc_shop_items; delete from npc_shop_buys;
insert into npc_shop_items(shop_id, template_id, price, stock_max, restock_h) values
 ('ferreiro','espada_aco',1500,null,6),('ferreiro','escudo_madeira',600,null,6),('ferreiro','escudo_aco',2400,null,6),('ferreiro','armadura_couro',900,null,6),('ferreiro','armadura_aco',4000,null,6),('ferreiro','capacete_aco',2200,null,6),('ferreiro','barra_ferro',120,40,6),('ferreiro','barra_aco',320,15,6),
 ('metalurgica','carvao',12,null,6),('metalurgica','barra_cobre',60,60,6),('metalurgica','barra_estanho',70,40,6),('metalurgica','minerio_estanho',25,100,6),('metalurgica','minerio_cobre',22,200,6),
 ('lapidaria','gema_bruta',120,10,6),('lapidaria','quartzo',300,5,6),
 ('processamento','pedra_comum',6,1000,6),('processamento','pedra_sedimentar',8,500,6),
 ('carpintaria','tabua_comum',20,null,6),('carpintaria','tora_comum',8,null,6),('carpintaria','tabua_carvalho',45,40,6),('carpintaria','arco',1800,null,6),
 ('alquimista','potion',20,null,6),('alquimista','erva_curativa',12,100,6),('alquimista','po_arcano',90,30,6),
 ('curtume','couro',60,40,6),('curtume','couro_cru',20,80,6),('curtume','fio_seda',45,40,6),
 ('joalheria','barra_prata',260,10,6),('joalheria','fio_seda',50,20,6),
 ('encantador','po_arcano',95,40,6),('encantador','essencia_sombria',220,10,6),
 ('ferramentas','picareta_cobre',150,null,6),('ferramentas','picareta_ferro',1200,null,6),('ferramentas','machado_ferro',400,null,6),('ferramentas','foice',200,null,6),('ferramentas','vara_pesca',250,null,6),('ferramentas','martelo_ferreiro',500,null,6),
 ('mercador','potion',22,null,6),('mercador','carvao',14,null,6),('mercador','tora_comum',10,null,6),('mercador','erva_curativa',14,null,6),('mercador','couro_cru',24,50,6);
insert into npc_shop_buys(shop_id, rule) values
 ('ferreiro','cat:arma'),('ferreiro','cat:armadura'),('ferreiro','cat:escudo'),('ferreiro','cat:equipamento'),('ferreiro','cat:componente'),('ferreiro','cat:barra'),
 ('metalurgica','cat:barra'),('metalurgica','cat:refinado'),('metalurgica','tpl:minerio_cobre'),('metalurgica','tpl:minerio_ferro'),('metalurgica','tpl:minerio_prata'),('metalurgica','tpl:minerio_estanho'),('metalurgica','tpl:pepita_ouro'),('metalurgica','tpl:minerio_mitril'),('metalurgica','tpl:minerio_adamantita'),('metalurgica','tpl:carvao'),('metalurgica','tpl:sucata'),
 ('lapidaria','cat:gema'),('lapidaria','tag:gem'),
 ('processamento','cat:pedra'),('processamento','tpl:pedra'),
 ('carpintaria','cat:madeira'),('carpintaria','tpl:tora_comum'),('carpintaria','tpl:tora_carvalho'),('carpintaria','tpl:tora_ancestral'),('carpintaria','tpl:tora_espiritual'),
 ('alquimista','cat:nucleo'),('alquimista','cat:reagente'),('alquimista','tpl:erva_curativa'),('alquimista','tpl:flor_lunar'),('alquimista','tpl:raiz_antiga'),('alquimista','tpl:peixe_comum'),('alquimista','tpl:peixe_prateado'),('alquimista','tpl:peixe_dourado'),
 ('curtume','cat:couro'),('curtume','cat:organico'),('curtume','cat:fio'),('curtume','tag:treat'),('curtume','tpl:couro_cru'),('curtume','tpl:osso'),('curtume','tpl:presa_javali'),
 ('joalheria','cat:acessorio'),('joalheria','cat:gema'),
 ('encantador','cat:nucleo'),('encantador','cat:reagente'),
 ('ferramentas','cat:ferramenta'),
 ('mercador','any');

create or replace function shop_accepts(p_shop text, t item_templates) returns boolean language sql stable as $$
  select exists (select 1 from npc_shop_buys b where b.shop_id = p_shop and (b.rule = 'any' or b.rule = 'cat:' || t.category or b.rule = 'tpl:' || t.id
    or (b.rule = 'tag:gem' and t.props ? 'gem') or (b.rule = 'tag:treat' and t.props ? 'treat_to'))) and t.category <> 'artefato' $$;
-- estoque: renova a cada restock_h
create or replace function shop_stock(p_shop text, p_tpl text) returns int language plpgsql as $$
declare it npc_shop_items; s npc_shop_stock;
begin
  select * into it from npc_shop_items where shop_id = p_shop and template_id = p_tpl; if it.stock_max is null then return null; end if;
  insert into npc_shop_stock(shop_id, template_id, stock) values (p_shop, p_tpl, it.stock_max) on conflict do nothing;
  select * into s from npc_shop_stock where shop_id = p_shop and template_id = p_tpl for update;
  if s.refreshed_at < now() - make_interval(hours => it.restock_h) then update npc_shop_stock set stock = it.stock_max, refreshed_at = now() where shop_id = p_shop and template_id = p_tpl; return it.stock_max; end if;
  return s.stock;
end $$;
create or replace function shop_view(p_shop text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; sh npc_shops;
begin
  select * into c from characters where user_id = auth.uid(); if c.id is null then raise exception 'sem personagem'; end if;
  select * into sh from npc_shops where id = p_shop; if sh.id is null then raise exception 'loja inválida'; end if;
  return jsonb_build_object('shop', to_jsonb(sh), 'world', (select name from worlds where id = c.world_id), 'budget', npc_budget_left(c.id),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('t', i.template_id, 'name', t.name, 'icon', t.icon, 'category', t.category, 'rarity', t.base_rarity, 'tier', t.tier, 'stackable', t.stackable,
        'price', ceil(i.price * price_mult(c.world_id, t)), 'stock', shop_stock(p_shop, i.template_id), 'atk', t.atk, 'def', t.def, 'slot', t.slot) order by t.category, i.price), '[]')
      from npc_shop_items i join item_templates t on t.id = i.template_id where i.shop_id = p_shop),
    'buys', (select coalesce(jsonb_agg(rule), '[]') from npc_shop_buys where shop_id = p_shop));
end $$;
create or replace function shop_buy(p_shop text, p_tpl text, p_qty int default 1) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; it npc_shop_items; t item_templates; price bigint; st int; g bigint; n int; i int; nid uuid;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into it from npc_shop_items where shop_id = p_shop and template_id = p_tpl; if it.shop_id is null then raise exception 'essa loja não vende isso'; end if;
  select * into t from item_templates where id = p_tpl;
  if p_qty < 1 or p_qty > 1000 then raise exception 'quantidade inválida'; end if;
  st := shop_stock(p_shop, p_tpl); if st is not null and st < p_qty then raise exception 'estoque: % (renova em até % h)', st, it.restock_h; end if;
  price := ceil(it.price * price_mult(c.world_id, t)) * p_qty;
  select gold into g from wallets where character_id = c.id for update; if g < price then raise exception 'custa % gold', price; end if;
  if p_tpl = 'potion' then update characters set pots = pots + p_qty where id = c.id;
  elsif t.stackable then perform stack_add(c.id, p_tpl, 50, p_qty);
  else
    select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n + p_qty > 20 then raise exception 'mochila sem espaço'; end if;
    for i in 1..p_qty loop insert into items(template_id, rarity, roll, origin) values (p_tpl, 0, '{}', 'loja:' || p_shop) returning id into nid; insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', n + i - 1); end loop;
  end if;
  if st is not null then update npc_shop_stock set stock = stock - p_qty where shop_id = p_shop and template_id = p_tpl; end if;
  perform add_gold(c.id, -price, 'loja_' || p_shop, p_tpl);
  return get_state();
end $$;
create or replace function shop_sell(p_shop text, p_args jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; sh npc_shops; t item_templates; it items; v bigint; left_ bigint; q int; pur int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into sh from npc_shops where id = p_shop; if sh.id is null or not ('sell' = any(sh.services)) then raise exception 'essa loja não compra'; end if;
  if p_args ? 'item' then
    select i.* into it from items i join inventory v2 on v2.item_id = i.id where i.id = (p_args ->> 'item')::uuid and v2.character_id = c.id and v2.container in ('bag','protected');
    if it.id is null then raise exception 'item não está na mochila'; end if;
    select * into t from item_templates where id = it.template_id;
    if not shop_accepts(p_shop, t) then raise exception '% não compra %', sh.name, t.name; end if;
    v := floor(item_value(it) * price_mult(c.world_id, t) * sh.sell_mult);
  else
    select * into t from item_templates where id = p_args ->> 't'; q := (p_args ->> 'qty')::int; pur := (p_args ->> 'purity')::int;
    if t.id is null or not t.stackable or q is null or q < 1 then raise exception 'material inválido'; end if;
    if not shop_accepts(p_shop, t) then raise exception '% não compra %', sh.name, t.name; end if;
    v := floor(t.sell * q * (0.6 + pur / 100.0 * 0.6) * price_mult(c.world_id, t) * sh.sell_mult * (1 + least(0.15, prof_level(c.id, 'comercio') * 0.0015)));
  end if;
  left_ := npc_budget_left(c.id); if v > left_ then raise exception 'o caixa da loja só tem % gold agora (renova a cada % h)', left_, cfg('npc_budget') ->> 'regen_h'; end if;
  if it.id is not null then delete from inventory where item_id = it.id; delete from items where id = it.id; else perform stack_take(c.id, t.id, pur, q); end if;
  perform add_gold(c.id, v, 'venda_loja_' || p_shop, t.id); perform npc_budget_use(c.id, v); perform prof_gain(c.id, 'comercio', greatest(1, v / 50));
  return jsonb_build_object('gold', v, 'state', get_state());
end $$;

-- armazém: itens e pilhas fora da mochila (não pesam na carga)
alter table inventory drop constraint if exists inventory_container_check;
alter table inventory add constraint inventory_container_check check (container in ('bag','protected','equip','market','trade','warehouse'));
create table if not exists warehouse_stacks (character_id uuid not null references characters(id) on delete cascade, template_id text not null references item_templates(id), purity int not null, qty int not null check (qty > 0), primary key (character_id, template_id, purity));
alter table warehouse_stacks enable row level security;
insert into game_config(key, value, note) values ('warehouse', '{"items":60}', 'capacidade do armazém') on conflict (key) do nothing;
create or replace function warehouse_action(p_action text, p_args jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; n int; q int; pur int; t text;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if p_action = 'guardar_item' then
    select count(*) into n from inventory where character_id = c.id and container = 'warehouse'; if n >= cfgn('warehouse','items') then raise exception 'armazém cheio (% itens)', cfgn('warehouse','items'); end if;
    update inventory set container = 'warehouse', slot = null, updated_at = now() where item_id = (p_args ->> 'item')::uuid and character_id = c.id and container in ('bag','protected'); if not found then raise exception 'item não está na mochila'; end if;
  elsif p_action = 'retirar_item' then
    select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n >= 20 then raise exception 'mochila cheia'; end if;
    update inventory set container = 'bag', idx = n, updated_at = now() where item_id = (p_args ->> 'item')::uuid and character_id = c.id and container = 'warehouse'; if not found then raise exception 'item não está no armazém'; end if;
  elsif p_action in ('guardar_pilha','retirar_pilha') then
    t := p_args ->> 't'; pur := (p_args ->> 'purity')::int; q := (p_args ->> 'qty')::int; if q is null or q < 1 then raise exception 'quantidade inválida'; end if;
    if p_action = 'guardar_pilha' then perform stack_take(c.id, t, pur, q); insert into warehouse_stacks values (c.id, t, pur, q) on conflict (character_id, template_id, purity) do update set qty = warehouse_stacks.qty + excluded.qty;
    else update warehouse_stacks set qty = qty - q where character_id = c.id and template_id = t and purity = pur and qty >= q; if not found then raise exception 'não tem isso no armazém'; end if; delete from warehouse_stacks where character_id = c.id and qty <= 0; perform stack_add(c.id, t, pur, q); end if;
  elsif p_action <> 'ver' then raise exception 'ação inválida'; end if;
  return jsonb_build_object('items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'template', i.template_id, 'rarity', i.rarity, 'roll', i.roll)), '[]') from inventory v join items i on i.id = v.item_id where v.character_id = c.id and v.container = 'warehouse'),
    'stacks', (select coalesce(jsonb_agg(jsonb_build_object('t', s.template_id, 'purity', s.purity, 'qty', s.qty, 'name', t2.name, 'cat', t2.category) order by t2.category, t2.name), '[]') from warehouse_stacks s join item_templates t2 on t2.id = s.template_id where s.character_id = c.id),
    'cap', cfgn('warehouse','items'), 'state', get_state());
end $$;

-- rochas em outras regiões (pedras de origens diferentes)
insert into resource_nodes(id, name, kind, profession_id, tool, tool_tier, req_level, hardness, extract_s, capacity, respawn_s, drop_table, exp, x, y, region)
  select 'rocha_' || r.reg || '_' || r.k, 'Rocha', 'rocha', 'mineracao', 'picareta', 1, r.req, r.hard, 6, 6, 240, 'rocha', 12 + r.req, r.x, r.y, r.reg from (values
   ('montanhas',1,151,32,10,2),('montanhas',2,131,36,10,2),('montanhas',3,136,17,10,2),('montanhas',4,205,31,10,2),
   ('minas',1,246,163,20,3),('minas',2,227,167,20,3),('minas',3,232,150,20,3),('minas',4,276,178,20,3),
   ('pantano',1,211,104,5,1),('pantano',2,191,108,5,1),('pantano',3,196,89,5,1),('pantano',4,261,103,5,1),
   ('ruinas',1,263,62,30,3),('ruinas',2,245,67,30,3),('ruinas',3,250,50,30,3),('ruinas',4,288,33,30,3)) r(reg, k, x, y, req, hard)
on conflict (id) do nothing;
-- pedra primordial: achado raro de mineração nos mundos 4 e 5
update game_config set value = jsonb_set(jsonb_set(value, '{4}', coalesce(value -> '4', '[]') || '[{"prof":"mineracao","t":"pedra_primordial","chance":0.002}]'), '{5}', coalesce(value -> '5', '[]') || '[{"prof":"mineracao","t":"pedra_primordial","chance":0.004}]')
  where key = 'world_drops' and not (value -> '4' @> '[{"t":"pedra_primordial"}]');
-- coleta (pedra tipada), caça (drops por mundo), status (precisão e penetração do equipamento), estado (lotes e armazém)
create or replace function gather_finish(p_job uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare mb numeric; wx jsonb; c characters; j gather_jobs; n resource_nodes; tool jsonb; pl int; e drop_entries; r double precision; acc numeric := 0; luck numeric; got jsonb := '[]'; q int; pur int; lvl int; tid uuid; bonus_hit boolean := false; tt numeric;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into j from gather_jobs where id = p_job and character_id = c.id for update; if j.id is null or j.status <> 'ativo' then raise exception 'coleta já finalizada'; end if;
  if j.ready_at > now() then raise exception 'ainda não terminou'; end if;
  select * into n from resource_nodes where id = j.node_id;
  update resource_node_state set remaining = remaining - 1, refill_at = case when remaining - 1 <= 0 then now() + make_interval(secs => n.respawn_s) else refill_at end where node_id = n.id;
  pl := prof_level(c.id, n.profession_id); tool := tool_of(c.id, n.tool); tt := coalesce((tool ->> 'tier')::numeric, 1);
  luck := (stats_of(c) ->> 'luck')::numeric;
  mb := clan_level(c.id, 'mina') * (cfg('clan_buildings') -> 'mina' ->> 'per_level')::numeric / 100;   -- mina e serraria do clã
  -- base: sai sempre
  for e in select * from drop_entries where table_id = n.drop_table and kind = 'base' loop
    q := e.qty_min + floor(random() * (e.qty_max - e.qty_min + 1))::int; q := q + case when random() < ((tool ->> 'eff')::numeric - 1) then 1 else 0 end + case when random() < mb then 1 else 0 end;
    pur := greatest(0, least(100, round(e.purity_min + random() * (e.purity_max - e.purity_min) + pl * 0.15)));
    -- rocha dá pedra bruta da região/mundo (o conteúdo só aparece no Centro de Processamento)
    if n.kind = 'rocha' and e.template_id = 'pedra' then e.template_id := stone_for(n.region, c.world_id); end if;
    perform stack_add(c.id, e.template_id, pur, q); got := got || jsonb_build_object('t', e.template_id, 'q', q, 'purity', pur, 'rarity', (select base_rarity from item_templates where id = e.template_id));
  end loop;
  -- bônus: um sorteio só, do mais raro pro mais comum; sorte e ferramenta ajudam de leve (teto configurado)
  r := random();
  for e in select d.* from drop_entries d join item_templates t on t.id = d.template_id where d.table_id = n.drop_table and d.kind = 'bonus' order by t.base_rarity desc, d.chance asc loop
    if pl < e.min_prof or tt < e.min_tool_tier then continue; end if;
    acc := acc + e.chance * (1 + luck) * (1 + mb) * (1 + least(0.1, (tt - n.tool_tier) * 0.03));
    if r < acc then
      pur := greatest(0, least(100, round(e.purity_min + random() * (e.purity_max - e.purity_min) + pl * 0.1)));
      perform stack_add(c.id, e.template_id, pur, 1); got := got || jsonb_build_object('t', e.template_id, 'q', 1, 'purity', pur, 'rarity', (select base_rarity from item_templates where id = e.template_id), 'bonus', true);
      if (select base_rarity from item_templates where id = e.template_id) >= 4 then insert into account_audit_log(user_id, action, meta) values (c.user_id, 'achado_raro', jsonb_build_object('item', e.template_id, 'node', n.id)); end if;
      exit;
    end if;
  end loop;
  -- achados extras do mundo (sorteio independente, só da profissão do depósito)
  for wx in select * from jsonb_array_elements(coalesce(cfg('world_drops') -> c.world_id::text, '[]')) loop
    if wx ->> 'prof' = n.profession_id and random() < (wx ->> 'chance')::numeric * (1 + luck) * (1 + mb) then
      pur := greatest(0, least(100, round(40 + random() * 50 + pl * 0.1))); perform stack_add(c.id, wx ->> 't', pur, 1);
      got := got || jsonb_build_object('t', wx ->> 't', 'q', 1, 'purity', pur, 'rarity', (select base_rarity from item_templates where id = wx ->> 't'), 'bonus', true, 'world', true);
    end if;
  end loop;
  -- desgaste da ferramenta e experiência
  if tool is not null then update items set roll = jsonb_set(coalesce(roll, '{}'), '{dur}', to_jsonb(greatest(0, (tool ->> 'dur')::numeric - 1))) where id = (tool ->> 'id')::uuid; end if;
  lvl := prof_gain(c.id, n.profession_id, n.exp);
  perform prof_gain(c.id, 'exploracao', 1);
  update gather_jobs set status = 'pronto', result = got where id = j.id;
  return jsonb_build_object('got', got, 'prof', n.profession_id, 'level', lvl, 'exp', n.exp, 'state', get_state());
end $$;

create or replace function simulate() returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e2 drop_entries; wd worlds; st0 jsonb; el jsonb; aspd0 numeric; qb numeric; diff int; tax bigint := 0; rep_tax bigint := 0; my_clan uuid; tax_pct int := 0; fk numeric := 0; fl jsonb;
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
end $$;

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
  matk := matk * (1 + equip_roll(c.id, 'matk_pct') / 100);
  mdef := w * (s->>'mdef_sab')::numeric + lvl * 0.5 + equip_roll(c.id, 'mdef');
  crit := least((s->>'crit_cap')::numeric, (s->>'crit_cap')::numeric * d / (d + (s->>'crit_k')::numeric) + skill_fx(c,'crit') + equip_roll(c.id,'crit'));
  dodge := least((s->>'dodge_cap')::numeric, (s->>'dodge_cap')::numeric * a / (a + (s->>'dodge_k')::numeric) + skill_fx(c,'dodge') + equip_roll(c.id,'dodge'));
  acc := (s->>'acc_base')::numeric + 15 * d / (d + (s->>'acc_k')::numeric) + equip_roll(c.id, 'acc');
  aspd := (1 + a / (a + (s->>'aspd_k')::numeric)) * (1 + (skill_fx(c,'aspd_pct') + equip_roll(c.id,'aspd_pct')) / 100) * coalesce(nullif(equip_roll(c.id,'aspd'), 0), 1);
  regen := (v * (s->>'regen_vit')::numeric + w * (s->>'regen_sab')::numeric) * (1 + skill_fx(c,'regen_pct') / 100) + equip_roll(c.id, 'regen');
  carry := (s->>'carry_base')::numeric + f * (s->>'carry_for')::numeric;
  luck := least((s->>'luck_cap')::numeric, l * (s->>'luck_per_point')::numeric + equip_roll(c.id, 'luck'));
  el := equip_elem(c.id);
  dps := (case cl.dmg_type when 'magico' then matk when 'misto' then (patk + matk) * 0.6 else patk end) * aspd * (1 + crit / 100 * 0.5) * (acc / 100) * (1 + skill_fx(c,'dps_mult'))
         + coalesce((select sum(value::numeric) from jsonb_each_text(el)), 0) * aspd;
  return jsonb_build_object('hp', round(hp), 'mp', round(mp), 'patk', round(patk, 1), 'matk', round(matk, 1), 'def', round(def, 1), 'mdef', round(mdef, 1), 'crit', round(crit, 1), 'dodge', round(dodge, 1), 'acc', round(acc, 1), 'aspd', round(aspd, 2), 'regen', round(regen, 1), 'carry', round(carry), 'luck', round(luck, 4), 'dps', round(dps, 1), 'elem', el, 'all_stats', al);
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
    'trades', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'from', f.name, 'to', tt.name, 'mine', t.from_char = c.id, 'mode', t.mode, 'version', t.version, 'accepted_a', t.accepted_a, 'accepted_b', t.accepted_b, 'updated_at', t.updated_at,
      'offer_gold', t.offer_gold, 'offer_gems', t.offer_gems, 'want_gold', t.want_gold, 'want_gems', t.want_gems, 'from_stacks', t.from_stacks, 'to_stacks', t.to_stacks, 'to_gold', t.to_gold, 'to_gems', t.to_gems,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'template', i.template_id, 'rarity', i.rarity, 'roll', i.roll)), '[]') from items i where i.id = any(t.offer_items)),
      'to_items_list', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'template', i.template_id, 'rarity', i.rarity, 'roll', i.roll)), '[]') from items i where i.id = any(t.to_items)), 'created_at', t.created_at) order by t.created_at desc), '[]') from trades t join characters f on f.id = t.from_char join characters tt on tt.id = t.to_char where t.status = 'aberta' and (t.from_char = c.id or t.to_char = c.id)),
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
    'world', (select to_jsonb(w) from worlds w where w.id = c.world_id),
    'usdt_equiv', round((select gems from wallets where character_id = c.id)::numeric / cfgn('p2e','gems_per_usdt'), 2),
    'clan_extra', (select jsonb_build_object('tax_pct', cl.tax_pct, 'buildings', (select coalesce(jsonb_object_agg(building, level), '{}') from clan_buildings b where b.clan_id = cl.id)) from clan_members m join clans cl on cl.id = m.clan_id where m.character_id = c.id),
    'fort_owner', (select jsonb_build_object('name', name, 'tag', tag) from clans where id = fort_owner()),
    'market_news', (select count(*) from market_transactions where (seller_id = c.id or buyer_id = c.id) and created_at > c.market_seen_at and kind in ('listing','buy_order') and not (buyer_id = c.id and kind = 'listing')),
    'admin', is_admin(),
    'stone_jobs', (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'stone', j.stone_id, 'qty', j.qty, 'ready_at', j.ready_at) order by j.started_at), '[]') from stone_jobs j where j.character_id = c.id and j.status = 'ativo'),
    'warehouse_n', (select count(*) from inventory where character_id = c.id and container = 'warehouse'),
    'server_time', now()
  ) into out;
  return out;
end $$;

do $$ declare f text; begin
  foreach f in array array['modular_preview(text,jsonb)','forge_modular_start(text,jsonb,text)','rename_item(uuid,text)','process_stones_start(text,text,int,int)','process_stones_finish(uuid)','processing_view()','shop_view(text)','shop_buy(text,text,int)','shop_sell(text,jsonb)','warehouse_action(text,jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f); execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['modular_eval(text,jsonb,numeric)','modular_resolve(uuid,text,jsonb,boolean)','modular_quality(uuid,text,jsonb)','modular_finish(characters,craft_jobs,recipes)','shop_stock(text,text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;
