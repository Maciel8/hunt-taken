-- Mercado simples: a cotação de venda pro NPC usa a MESMA conta que a venda (npc_stack_value / item_value).
-- Nada muda no valor pago; só deixa a tela mostrar "você recebe X" antes de confirmar.
create or replace function npc_stack_value(c characters, t item_templates, p_qty int, p_purity int) returns bigint language sql stable security definer set search_path = public as $$
  select floor(t.sell * p_qty * (0.6 + p_purity / 100.0 * 0.6) * price_mult(c.world_id, t) * (1 + least(0.15, prof_level(c.id, 'comercio') * 0.0015)))::bigint $$;
CREATE OR REPLACE FUNCTION public.sell_stack(p_tpl text, p_purity integer, p_qty integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c characters; t item_templates; v bigint; left_ bigint;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  select * into t from item_templates where id = p_tpl; if t.id is null or not t.stackable then raise exception 'item inválido'; end if;
  if t.category = 'artefato' then raise exception 'artefatos não se vendem pro NPC'; end if;
  if p_qty < 1 then raise exception 'quantidade inválida'; end if;
  v := npc_stack_value(c, t, p_qty, p_purity);
  left_ := npc_budget_left(c.id);
  if v > left_ then raise exception 'o NPC só tem % gold em caixa agora (renova a cada % h). Venda menos ou use o Market.', left_, cfg('npc_budget') ->> 'regen_h'; end if;
  perform stack_take(c.id, p_tpl, p_purity, p_qty);
  perform add_gold(c.id, v, 'venda_npc_material', p_tpl); perform npc_budget_use(c.id, v);
  perform prof_gain(c.id, 'comercio', greatest(1, v / 50));
  return jsonb_build_object('gold', v, 'budget_left', left_ - v, 'state', get_state());
end $function$;
create or replace function market_sell_quote(p_tpl text, p_purity int, p_qty int) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c characters; t item_templates; have int;
begin
  select * into c from characters where user_id = auth.uid(); if c.id is null then raise exception 'sem personagem'; end if;
  select * into t from item_templates where id = p_tpl; if t.id is null or not t.stackable then raise exception 'item inválido'; end if;
  if t.category = 'artefato' then raise exception 'artefatos não se vendem pro NPC'; end if;
  select coalesce(sum(qty), 0) into have from inventory_stacks where character_id = c.id and template_id = p_tpl and purity = p_purity;
  return jsonb_build_object('gold', npc_stack_value(c, t, least(greatest(p_qty, 0), have), p_purity), 'have', have, 'budget', npc_budget_left(c.id));
end $$;
grant execute on function market_sell_quote(text, int, int) to authenticated;
