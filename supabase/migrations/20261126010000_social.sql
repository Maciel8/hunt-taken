-- Sistemas sociais e de progresso (26/11/2026): gemas, mercado em gold ou gemas, trocas, chat, clãs, missões, Caverna do Dragão.
set search_path = public;

-- ---------- gemas (moeda paga) ----------
alter table wallets add column if not exists gems bigint not null default 0 check (gems >= 0);
alter table ledger add column if not exists currency text not null default 'gold';
create or replace function add_gems(cid uuid, amt bigint, why text, ref text default null) returns void language plpgsql as $$
begin
  update wallets set gems = gems + amt where character_id = cid;
  insert into ledger(character_id, amount, reason, ref, currency) values (cid, amt, why, ref, 'gems');
end $$;
revoke all on function add_gems(uuid,bigint,text,text) from public, anon, authenticated;

-- itens do dragão
insert into item_templates(id,name,slot,atk,def,sell,price,mat,voc,icon,extra) values
 ('escama_dragao','Escama de dragão',null,0,0,5000,null,true,null,'gem','{}'),
 ('espada_dragao','Lâmina do Dragão','weapon',60,0,80000,null,false,null,'sword','{}'),
 ('armadura_dragao','Armadura de escamas','armor',0,30,90000,null,false,null,'armor','{}'),
 ('chave_dragao','Chave de obsidiana',null,0,0,0,null,true,null,'gem','{}')
on conflict (id) do update set name = excluded.name, slot = excluded.slot, atk = excluded.atk, def = excluded.def, sell = excluded.sell;

-- ---------- mercado em gold ou gemas ----------
alter table market_listings add column if not exists currency text not null default 'gold' check (currency in ('gold','gems'));
alter table market_transactions add column if not exists currency text not null default 'gold';
alter table inventory drop constraint if exists inventory_container_check;
alter table inventory add constraint inventory_container_check check (container in ('bag','protected','equip','market','trade'));
drop function if exists list_item(uuid,bigint);
create or replace function list_item(p_item uuid, p_price bigint, p_currency text default 'gold') returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; n int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if p_currency not in ('gold','gems') then raise exception 'moeda inválida'; end if;
  if p_price < 1 or p_price > 100000000 then raise exception 'preço inválido'; end if;
  select count(*) into n from market_listings where seller_character_id = c.id and status = 'aberto'; if n >= 10 then raise exception 'máximo de 10 anúncios'; end if;
  update inventory set container = 'market', slot = null, updated_at = now() where item_id = p_item and character_id = c.id and container in ('bag','protected');
  if not found then raise exception 'item não está na sua mochila'; end if;
  insert into market_listings(seller_character_id, item_id, price, currency) values (c.id, p_item, p_price, p_currency);
  return get_state();
end $$;
create or replace function buy_listing(p_listing uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; l market_listings; bal bigint; fee bigint; n int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into l from market_listings where id = p_listing and status = 'aberto' for update; if l.id is null then raise exception 'anúncio já vendido ou cancelado'; end if;
  if l.seller_character_id = c.id then raise exception 'é o seu próprio anúncio'; end if;
  select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n >= 20 then raise exception 'mochila cheia'; end if;
  select case when l.currency = 'gems' then gems else gold end into bal from wallets where character_id = c.id for update;
  if bal < l.price then raise exception '% insuficiente', case when l.currency = 'gems' then 'gemas' else 'gold' end; end if;
  fee := floor(l.price * 0.05);
  if l.currency = 'gems' then perform add_gems(c.id, -l.price, 'compra_market', l.id::text); perform add_gems(l.seller_character_id, l.price - fee, 'venda_market', l.id::text);
  else perform add_gold(c.id, -l.price, 'compra_market', l.id::text); perform add_gold(l.seller_character_id, l.price - fee, 'venda_market', l.id::text); end if;
  update market_listings set status = 'vendido' where id = l.id;
  update inventory set character_id = c.id, container = 'bag', idx = n, updated_at = now() where item_id = l.item_id;
  insert into market_transactions(listing_id, buyer_id, seller_id, price, fee, currency) values (l.id, c.id, l.seller_character_id, l.price, fee, l.currency);
  return get_state();
end $$;
create or replace function market_view() returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'price', l.price, 'currency', l.currency, 'item', jsonb_build_object('id', i.id, 'template', i.template_id, 'rarity', i.rarity, 'roll', i.roll, 'value', item_value(i)),
    'seller', pc.name, 'seller_kingdom', pc.kingdom, 'mine', (pc.id = (select id from characters where user_id = auth.uid())), 'created_at', l.created_at) order by l.created_at desc), '[]')
  from market_listings l join items i on i.id = l.item_id join public_characters pc on pc.id = l.seller_character_id where l.status = 'aberto' and l.expires_at > now() $$;

-- ---------- trocas entre jogadores (itens + gold + gemas por gold + gemas), com custódia ----------
create table if not exists trades (
  id uuid primary key default gen_random_uuid(), from_char uuid not null references characters(id) on delete cascade, to_char uuid not null references characters(id) on delete cascade,
  offer_items uuid[] not null default '{}', offer_gold bigint not null default 0 check (offer_gold >= 0), offer_gems bigint not null default 0 check (offer_gems >= 0),
  want_gold bigint not null default 0 check (want_gold >= 0), want_gems bigint not null default 0 check (want_gems >= 0),
  status text not null default 'aberta' check (status in ('aberta','aceita','recusada','cancelada')), created_at timestamptz default now(), closed_at timestamptz);
alter table trades enable row level security;
drop policy if exists trades_own on trades; create policy trades_own on trades for select to authenticated using (from_char in (select id from characters where user_id = auth.uid()) or to_char in (select id from characters where user_id = auth.uid()));
create or replace function create_trade(p_to text, p_items uuid[], p_gold bigint, p_gems bigint, p_want_gold bigint, p_want_gems bigint) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; t characters; w wallets; n int; tid uuid;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into t from characters where name = p_to; if t.id is null then raise exception 'jogador não encontrado'; end if;
  if t.id = c.id then raise exception 'não dá pra trocar com você mesmo'; end if;
  if coalesce(array_length(p_items, 1), 0) > 8 then raise exception 'máximo de 8 itens por troca'; end if;
  if least(p_gold, p_gems, p_want_gold, p_want_gems) < 0 then raise exception 'valor inválido'; end if;
  if coalesce(array_length(p_items, 1), 0) = 0 and p_gold = 0 and p_gems = 0 then raise exception 'ofereça algo'; end if;
  select count(*) into n from trades where from_char = c.id and status = 'aberta'; if n >= 5 then raise exception 'máximo de 5 trocas abertas'; end if;
  select * into w from wallets where character_id = c.id for update;
  if w.gold < p_gold or w.gems < p_gems then raise exception 'saldo insuficiente pra oferta'; end if;
  select count(*) into n from inventory where character_id = c.id and container in ('bag','protected') and item_id = any(coalesce(p_items, '{}'));
  if n <> coalesce(array_length(p_items, 1), 0) then raise exception 'algum item não está na sua mochila'; end if;
  update inventory set container = 'trade', updated_at = now() where item_id = any(coalesce(p_items, '{}'));
  if p_gold > 0 then perform add_gold(c.id, -p_gold, 'troca_custodia'); end if;
  if p_gems > 0 then perform add_gems(c.id, -p_gems, 'troca_custodia'); end if;
  insert into trades(from_char, to_char, offer_items, offer_gold, offer_gems, want_gold, want_gems) values (c.id, t.id, coalesce(p_items, '{}'), p_gold, p_gems, p_want_gold, p_want_gems) returning id into tid;
  insert into account_audit_log(user_id, action, meta) values (c.user_id, 'trade_create', jsonb_build_object('trade', tid, 'to', t.name));
  return get_state();
end $$;
create or replace function close_trade(p_trade uuid, p_action text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; tr trades; w wallets; n int; k int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into tr from trades where id = p_trade and status = 'aberta' for update; if tr.id is null then raise exception 'troca não está aberta'; end if;
  if p_action = 'aceitar' then
    if tr.to_char <> c.id then raise exception 'só quem recebe pode aceitar'; end if;
    select * into w from wallets where character_id = c.id for update;
    if w.gold < tr.want_gold or w.gems < tr.want_gems then raise exception 'saldo insuficiente pra pagar a troca'; end if;
    select count(*) into n from inventory where character_id = c.id and container = 'bag'; k := coalesce(array_length(tr.offer_items, 1), 0);
    if n + k > 20 then raise exception 'mochila sem espaço pra receber os itens'; end if;
    update inventory set character_id = c.id, container = 'bag', updated_at = now() where item_id = any(tr.offer_items);
    if tr.offer_gold > 0 then perform add_gold(c.id, tr.offer_gold, 'troca_recebida', tr.id::text); end if;
    if tr.offer_gems > 0 then perform add_gems(c.id, tr.offer_gems, 'troca_recebida', tr.id::text); end if;
    if tr.want_gold > 0 then perform add_gold(c.id, -tr.want_gold, 'troca_paga', tr.id::text); perform add_gold(tr.from_char, tr.want_gold, 'troca_recebida', tr.id::text); end if;
    if tr.want_gems > 0 then perform add_gems(c.id, -tr.want_gems, 'troca_paga', tr.id::text); perform add_gems(tr.from_char, tr.want_gems, 'troca_recebida', tr.id::text); end if;
    update trades set status = 'aceita', closed_at = now() where id = tr.id;
  elsif p_action in ('recusar','cancelar') then
    if (p_action = 'recusar' and tr.to_char <> c.id) or (p_action = 'cancelar' and tr.from_char <> c.id) then raise exception 'ação não permitida'; end if;
    update inventory set container = 'bag', updated_at = now() where item_id = any(tr.offer_items);
    if tr.offer_gold > 0 then perform add_gold(tr.from_char, tr.offer_gold, 'troca_devolvida', tr.id::text); end if;
    if tr.offer_gems > 0 then perform add_gems(tr.from_char, tr.offer_gems, 'troca_devolvida', tr.id::text); end if;
    update trades set status = case when p_action = 'recusar' then 'recusada' else 'cancelada' end, closed_at = now() where id = tr.id;
  else raise exception 'ação inválida'; end if;
  return get_state();
end $$;

-- ---------- clãs ----------
create table if not exists clans (id uuid primary key default gen_random_uuid(), name citext unique not null, tag text unique not null check (tag ~ '^[A-Z0-9]{2,4}$'), description text default '', leader uuid references characters(id), created_at timestamptz default now());
create table if not exists clan_members (clan_id uuid not null references clans(id) on delete cascade, character_id uuid primary key references characters(id) on delete cascade, role text not null default 'membro' check (role in ('lider','oficial','membro')), joined_at timestamptz default now());
create table if not exists clan_requests (clan_id uuid not null references clans(id) on delete cascade, character_id uuid not null references characters(id) on delete cascade, created_at timestamptz default now(), primary key (clan_id, character_id));
alter table clans enable row level security; alter table clan_members enable row level security; alter table clan_requests enable row level security;
drop policy if exists clans_read on clans; create policy clans_read on clans for select to authenticated using (true);
drop policy if exists clan_members_read on clan_members; create policy clan_members_read on clan_members for select to authenticated using (true);
create or replace function my_clan_role(cid uuid) returns text language sql stable as $$ select role from clan_members where character_id = cid $$;
create or replace function create_clan(p_name text, p_tag text, p_desc text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; g bigint; cl uuid;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if exists (select 1 from clan_members where character_id = c.id) then raise exception 'você já está num clã'; end if;
  if c.level < 10 then raise exception 'precisa de level 10 pra fundar um clã'; end if;
  if length(btrim(p_name)) < 3 or length(btrim(p_name)) > 24 then raise exception 'nome do clã: 3 a 24 caracteres'; end if;
  select gold into g from wallets where character_id = c.id; if g < 1000 then raise exception 'fundar um clã custa 1.000 gold'; end if;
  perform add_gold(c.id, -1000, 'fundar_cla');
  insert into clans(name, tag, description, leader) values (btrim(p_name), upper(p_tag), left(coalesce(p_desc, ''), 200), c.id) returning id into cl;
  insert into clan_members(clan_id, character_id, role) values (cl, c.id, 'lider');
  delete from clan_requests where character_id = c.id;
  return get_state();
exception when unique_violation then raise exception 'nome ou sigla já em uso';
end $$;
create or replace function clans_view() returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', cl.id, 'name', cl.name, 'tag', cl.tag, 'description', cl.description, 'members', (select count(*) from clan_members m where m.clan_id = cl.id), 'power', (select coalesce(sum(ch.level), 0) from clan_members m join characters ch on ch.id = m.character_id where m.clan_id = cl.id), 'leader', (select name from characters where id = cl.leader)) order by cl.created_at), '[]') from clans cl $$;
create or replace function clan_action(p_action text, p_target text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; role text; t characters; myclan uuid; trole text; n int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select clan_id, clan_members.role into myclan, role from clan_members where character_id = c.id;
  if p_action = 'pedir' then
    if myclan is not null then raise exception 'você já está num clã'; end if;
    insert into clan_requests(clan_id, character_id) values (p_target::uuid, c.id) on conflict do nothing;
  elsif p_action = 'sair' then
    if myclan is null then raise exception 'você não está num clã'; end if;
    if role = 'lider' then select count(*) into n from clan_members where clan_id = myclan; if n > 1 then raise exception 'passe a liderança antes de sair'; end if; delete from clans where id = myclan;
    else delete from clan_members where character_id = c.id; end if;
  else
    if myclan is null or role = 'membro' then raise exception 'só líder ou oficial'; end if;
    select * into t from characters where name = p_target; if t.id is null then raise exception 'jogador não encontrado'; end if;
    select clan_members.role into trole from clan_members where character_id = t.id and clan_id = myclan;
    if p_action = 'aceitar' then
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

-- ---------- chat (global, comércio, clã) ----------
create table if not exists chat_messages (id bigserial primary key, channel text not null, character_id uuid references characters(id) on delete set null, name text not null, kingdom text, clan_tag text, body text not null, created_at timestamptz default now());
create index if not exists chat_channel_idx on chat_messages(channel, id desc);
alter table chat_messages enable row level security;
create or replace function send_chat(p_channel text, p_body text) returns void language plpgsql security definer set search_path = public as $$
declare c characters; last timestamptz; tag text; cl uuid; b text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
begin
  select * into c from characters where user_id = auth.uid(); if c.id is null then raise exception 'sem personagem'; end if;
  if length(b) < 1 or length(b) > 240 then raise exception 'mensagem de 1 a 240 caracteres'; end if;
  select max(created_at) into last from chat_messages where character_id = c.id; if last > now() - interval '1.5 seconds' then raise exception 'devagar: uma mensagem a cada 1,5 s'; end if;
  select m.clan_id, cl2.tag into cl, tag from clan_members m join clans cl2 on cl2.id = m.clan_id where m.character_id = c.id;
  if p_channel = 'cla' then if cl is null then raise exception 'você não está num clã'; end if; p_channel := 'cla:' || cl::text;
  elsif p_channel not in ('global','comercio') then raise exception 'canal inválido'; end if;
  insert into chat_messages(channel, character_id, name, kingdom, clan_tag, body) values (p_channel, c.id, c.name, c.kingdom, tag, b);
end $$;
create or replace function get_chat(p_channel text, p_after bigint default 0) returns jsonb language plpgsql security definer set search_path = public stable as $$
declare c characters; ch text := p_channel; cl uuid;
begin
  select * into c from characters where user_id = auth.uid(); if c.id is null then return '[]'; end if;
  if p_channel = 'cla' then select clan_id into cl from clan_members where character_id = c.id; if cl is null then return '[]'; end if; ch := 'cla:' || cl::text; end if;
  return (select coalesce(jsonb_agg(to_jsonb(x) - 'character_id' order by x.id), '[]') from (select * from chat_messages where channel = ch and id > p_after order by id desc limit 60) x);
end $$;

-- ---------- missões (modo história) ----------
create table if not exists quest_defs (id text primary key, chapter int not null, title text not null, giver text not null, kind text not null check (kind in ('kill','drop','dungeon','visit')), target text, goal int not null default 1, min_level int not null default 1, requires text, reward_gold bigint default 0, reward_exp bigint default 0, reward_gems bigint default 0, reward_item text);
create table if not exists quest_progress (character_id uuid not null references characters(id) on delete cascade, quest_id text not null references quest_defs(id), status text not null default 'ativa' check (status in ('ativa','pronta','entregue')), progress int not null default 0, updated_at timestamptz default now(), primary key (character_id, quest_id));
alter table quest_defs enable row level security; alter table quest_progress enable row level security;
drop policy if exists quest_defs_read on quest_defs; create policy quest_defs_read on quest_defs for select to authenticated using (true);
insert into quest_defs(id, chapter, title, giver, kind, target, goal, min_level, requires, reward_gold, reward_exp, reward_gems, reward_item) values
 ('q1_ratos', 1, 'Praga nos celeiros', 'Guarda', 'kill', 'ratos', 30, 1, null, 150, 400, 0, null),
 ('q2_javalis', 1, 'Presas pro ferreiro', 'Ferreiro', 'kill', 'javalis', 40, 5, 'q1_ratos', 400, 2500, 0, 'escudo_madeira'),
 ('q3_bandidos', 1, 'A torre na estrada', 'Guarda', 'kill', 'bandidos', 50, 10, 'q2_javalis', 1200, 9000, 2, null),
 ('q4_teias', 2, 'Seda pra Vila', 'Mercador', 'kill', 'aranhas', 60, 20, 'q3_bandidos', 2500, 30000, 0, null),
 ('q5_uivos', 2, 'Uivos na clareira', 'Sacerdote', 'kill', 'lobos', 60, 26, 'q4_teias', 4000, 60000, 3, null),
 ('q6_bruxa', 3, 'A Bruxa do Pântano', 'Sacerdote', 'kill', 'bruxas', 50, 45, 'q5_uivos', 9000, 180000, 5, null),
 ('q7_minas', 3, 'O que dorme nas minas', 'Ferreiro', 'kill', 'mina1', 60, 55, 'q6_bruxa', 12000, 300000, 5, null),
 ('q8_dragao', 4, 'A fera da montanha', 'Sacerdote', 'dungeon', 'dragao', 1, 60, 'q7_minas', 30000, 900000, 20, 'espada_dragao')
on conflict (id) do update set title = excluded.title, giver = excluded.giver, kind = excluded.kind, target = excluded.target, goal = excluded.goal, min_level = excluded.min_level, requires = excluded.requires, reward_gold = excluded.reward_gold, reward_exp = excluded.reward_exp, reward_gems = excluded.reward_gems, reward_item = excluded.reward_item;
create or replace function quest_kills(cid uuid, target text, n int) returns void language plpgsql as $$
begin
  if n <= 0 then return; end if;
  update quest_progress qp set progress = least(d.goal, qp.progress + n), status = case when qp.progress + n >= d.goal then 'pronta' else 'ativa' end, updated_at = now()
    from quest_defs d where d.id = qp.quest_id and qp.character_id = cid and qp.status = 'ativa' and d.target = target and d.kind in ('kill','drop','dungeon');
end $$;
revoke all on function quest_kills(uuid,text,int) from public, anon, authenticated;
create or replace function quests_view() returns jsonb language sql security definer set search_path = public stable as $$ select coalesce(jsonb_agg(to_jsonb(d) order by d.chapter, d.min_level), '[]') from quest_defs d $$;
create or replace function quest_action(p_quest text, p_action text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; d quest_defs; q quest_progress; n int; nid uuid;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into d from quest_defs where id = p_quest; if d.id is null then raise exception 'missão inválida'; end if;
  select * into q from quest_progress where character_id = c.id and quest_id = d.id;
  if p_action = 'aceitar' then
    if q.quest_id is not null then raise exception 'missão já aceita'; end if;
    if c.level < d.min_level then raise exception 'precisa de level %', d.min_level; end if;
    if d.requires is not null and not exists (select 1 from quest_progress where character_id = c.id and quest_id = d.requires and status = 'entregue') then raise exception 'termine a missão anterior primeiro'; end if;
    insert into quest_progress(character_id, quest_id) values (c.id, d.id);
  elsif p_action = 'entregar' then
    if q.status is distinct from 'pronta' then raise exception 'missão ainda não está pronta'; end if;
    if d.reward_item is not null then select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n >= 20 then raise exception 'libere um espaço na mochila'; end if; nid := roll_item(d.reward_item, 'missao:' || d.id, c.id::text || d.id); insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', n); end if;
    if d.reward_gold > 0 then perform add_gold(c.id, d.reward_gold, 'missao', d.id); end if;
    if d.reward_gems > 0 then perform add_gems(c.id, d.reward_gems, 'missao', d.id); end if;
    update characters set exp = exp + d.reward_exp where id = c.id;
    update characters set level = level + 1 where id = c.id and exp >= exp_for(level + 1);
    while exists (select 1 from characters where id = c.id and exp >= exp_for(level + 1)) loop update characters set level = level + 1 where id = c.id; end loop;
    update quest_progress set status = 'entregue', updated_at = now() where character_id = c.id and quest_id = d.id;
  elsif p_action = 'desistir' then delete from quest_progress where character_id = c.id and quest_id = d.id and status <> 'entregue';
  else raise exception 'ação inválida'; end if;
  return get_state();
end $$;

-- ---------- Caverna do Dragão (masmorra em etapas, decidida no servidor) ----------
create table if not exists dungeon_runs (id uuid primary key default gen_random_uuid(), character_id uuid not null references characters(id) on delete cascade, dungeon text not null, stage int not null default 1, status text not null default 'ativa' check (status in ('ativa','vencida','derrota','abandonada')), started_at timestamptz default now(), stage_at timestamptz default now(), result jsonb default '{}');
create index if not exists dungeon_runs_char on dungeon_runs(character_id, started_at desc);
alter table dungeon_runs enable row level security;
-- etapas: 1 túnel (filhotes), 2 ponte de lava (chave do guardião), 3 ninho (elite), 4 o dragão
create or replace function dungeon_power(stage int) returns numeric language sql immutable as $$ select (array[260, 330, 420, 560])[stage]::numeric $$;
create or replace function dungeon_action(p_action text, p_dungeon text default 'dragao') returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; r dungeon_runs; pw numeric; need numeric; win boolean; minsec int; last timestamptz; nid uuid; n int; res jsonb := '{}';
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if p_dungeon <> 'dragao' then raise exception 'masmorra inválida'; end if;
  select * into r from dungeon_runs where character_id = c.id and status = 'ativa' order by started_at desc limit 1 for update;
  if p_action = 'entrar' then
    if r.id is not null then return jsonb_build_object('run', to_jsonb(r), 'state', get_state()); end if;
    if c.level < 60 then raise exception 'a Caverna do Dragão pede level 60'; end if;
    select max(started_at) into last from dungeon_runs where character_id = c.id and status = 'vencida'; if last > now() - interval '20 hours' then raise exception 'o dragão ainda se recupera. Volte em % h', ceil(extract(epoch from (last + interval '20 hours' - now())) / 3600); end if;
    insert into dungeon_runs(character_id, dungeon) values (c.id, 'dragao') returning * into r;
    return jsonb_build_object('run', to_jsonb(r), 'state', get_state());
  end if;
  if r.id is null then raise exception 'você não está na masmorra'; end if;
  if p_action = 'sair' then update dungeon_runs set status = 'abandonada' where id = r.id; return jsonb_build_object('state', get_state()); end if;
  if p_action <> 'avancar' then raise exception 'ação inválida'; end if;
  -- cada etapa leva um tempo mínimo de luta; o resultado sai do poder do personagem contra a etapa
  minsec := (array[20, 25, 30, 40])[r.stage];
  if r.stage_at > now() - make_interval(secs => minsec) then raise exception 'a luta ainda não acabou'; end if;
  pw := power_of(c) * (0.85 + ht_rand(r.id::text || r.stage || 'p') * 0.3); need := dungeon_power(r.stage); win := pw >= need;
  if not win then
    update dungeon_runs set status = 'derrota', result = jsonb_build_object('stage', r.stage, 'power', round(pw), 'need', need) where id = r.id;
    update characters set exp = exp - floor((exp - exp_for(level)) * 0.1) where id = c.id;
    return jsonb_build_object('win', false, 'stage', r.stage, 'power', round(pw), 'need', need, 'state', get_state());
  end if;
  if r.stage < 4 then
    if r.stage = 2 then select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n < 20 then nid := roll_item('chave_dragao', 'dragao', r.id::text); insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', n); end if; end if;
    perform add_gold(c.id, 400 * r.stage, 'masmorra', r.id::text);
    update dungeon_runs set stage = stage + 1, stage_at = now() where id = r.id;
    return jsonb_build_object('win', true, 'stage', r.stage, 'next', r.stage + 1, 'gold', 400 * r.stage, 'state', get_state());
  end if;
  -- dragão vencido
  select count(*) into n from inventory where character_id = c.id and container = 'bag';
  delete from inventory where character_id = c.id and item_id in (select i.id from items i where i.template_id = 'chave_dragao') ;
  select count(*) into n from inventory where character_id = c.id and container = 'bag';
  res := jsonb_build_array();
  for k in 1..2 loop exit when n >= 20; nid := roll_item(case when ht_rand(r.id::text || k) < .5 then 'escama_dragao' when ht_rand(r.id::text || k || 'b') < .7 then 'armadura_dragao' else 'espada_dragao' end, 'dragao', r.id::text || k); insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', n); n := n + 1; res := res || jsonb_build_object('id', nid); end loop;
  perform add_gold(c.id, 8000, 'dragao', r.id::text); perform add_gems(c.id, 10, 'dragao', r.id::text);
  update characters set exp = exp + 250000 where id = c.id;
  while exists (select 1 from characters where id = c.id and exp >= exp_for(level + 1)) loop update characters set level = level + 1 where id = c.id; end loop;
  perform quest_kills(c.id, 'dragao', 1);
  update dungeon_runs set status = 'vencida', result = jsonb_build_object('drops', res) where id = r.id;
  return jsonb_build_object('win', true, 'stage', 4, 'boss', true, 'gold', 8000, 'gems', 10, 'exp', 250000, 'drops', res, 'state', get_state());
end $$;

create or replace function simulate() returns jsonb language plpgsql security definer set search_path = public as $$
declare
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
  if jsonb_array_length(rep_drops) > 0 then perform quest_kills(c.id, 'drop:' || h.id, jsonb_array_length(rep_drops)); end if;
  insert into session_reports(session_id, character_id, from_at, to_at, exp, gold_in, gold_out, kills, deaths, pots, drops, events, seen)
    values (s.id, c.id, from_at, t1, rep_exp, rep_gold, rep_gold_out, rep_kills, rep_deaths, rep_pots, rep_drops, rep_events, (t1 - from_at) < interval '2 minutes');
  if ended then perform end_session(c.id, 'auto'); end if;
  return jsonb_build_object('exp', rep_exp, 'gold', rep_gold, 'gold_out', rep_gold_out, 'kills', rep_kills, 'deaths', rep_deaths, 'pots', rep_pots, 'drops', rep_drops, 'events', rep_events, 'ended', ended, 'offline', eff < 1, 'hours', round(extract(epoch from (t1 - from_at)) / 3600.0, 2));
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
    'clan', (select jsonb_build_object('id', cl.id, 'name', cl.name, 'tag', cl.tag, 'role', m.role, 'description', cl.description, 'members', (select jsonb_agg(jsonb_build_object('name', ch.name, 'level', ch.level, 'vocation', ch.vocation, 'role', mm.role, 'online', ch.last_seen_at > now() - interval '60 seconds') order by mm.role, ch.level desc) from clan_members mm join characters ch on ch.id = mm.character_id where mm.clan_id = cl.id), 'requests', (select coalesce(jsonb_agg(jsonb_build_object('name', ch.name, 'level', ch.level)), '[]') from clan_requests rq join characters ch on ch.id = rq.character_id where rq.clan_id = cl.id)) from clan_members m join clans cl on cl.id = m.clan_id where m.character_id = c.id),
    'quests', (select coalesce(jsonb_agg(jsonb_build_object('id', q.quest_id, 'status', q.status, 'progress', q.progress)), '[]') from quest_progress q where q.character_id = c.id),
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

revoke all on function create_trade(text,uuid[],bigint,bigint,bigint,bigint), close_trade(uuid,text), create_clan(text,text,text), clans_view(), clan_action(text,text), send_chat(text,text), get_chat(text,bigint), quests_view(), quest_action(text,text), dungeon_action(text,text), list_item(uuid,bigint,text) from public, anon;
grant execute on function create_trade(text,uuid[],bigint,bigint,bigint,bigint), close_trade(uuid,text), create_clan(text,text,text), clans_view(), clan_action(text,text), send_chat(text,text), get_chat(text,bigint), quests_view(), quest_action(text,text), dungeon_action(text,text), list_item(uuid,bigint,text) to authenticated;
