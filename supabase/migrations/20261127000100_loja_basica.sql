-- Loja do NPC mais completa: materiais básicos (em quantidade, pureza 50%) e equipamentos de entrada.
-- Preço sempre acima de 2,5× o valor que o NPC paga (sem lucro comprando e revendendo).
update item_templates t set price = greatest(v.p, ceil(coalesce(t.sell, 0) * 2.5))::int from (values
  ('carvao', 15), ('tora_comum', 8), ('tabua_comum', 22), ('tabua_carvalho', 60), ('couro_cru', 22), ('couro', 65), ('fio_seda', 50), ('erva_curativa', 12), ('flor_lunar', 240),
  ('minerio_cobre', 16), ('minerio_estanho', 26), ('minerio_ferro', 32), ('pedra_comum', 6), ('osso', 12), ('gema_bruta', 110),
  ('barra_cobre', 95), ('barra_estanho', 75), ('barra_ferro', 190),
  ('capa', 1100), ('capacete_ferro', 8000), ('cajado', 6500)
) v(id, p) where t.id = v.id;
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
  p_qty := least(case when p_tpl = 'potion' then 9999 when t.stackable then 999 else 20 end, greatest(1, p_qty));   -- poção em quantidade, como consumível de loja
  select gold into g from wallets where character_id = c.id; if g < t.price * p_qty then raise exception 'gold insuficiente'; end if;
  if p_tpl = 'potion' then update characters set pots = pots + p_qty where id = c.id;
  elsif t.stackable then perform stack_add(c.id, p_tpl, 50, p_qty);   -- material da loja: pureza 50%
  else
    select count(*) into n from inventory where character_id = c.id and container = 'bag'; if n + p_qty > 20 then raise exception 'mochila cheia'; end if;
    for i in 1..p_qty loop nid := roll_item(p_tpl, 'loja', c.id::text || clock_timestamp()::text || i); insert into inventory(item_id, character_id, container, idx) values (nid, c.id, 'bag', n + i); end loop;
  end if;
  perform add_gold(c.id, -t.price * p_qty, 'loja', p_tpl);
  return get_state();
end $function$;
