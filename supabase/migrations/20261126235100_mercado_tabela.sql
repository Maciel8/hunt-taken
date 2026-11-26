-- Tabela de preços do mercado: inclui o item de cada venda (pra filtrar e exportar).
create or replace function market_history(p_tpl text) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('at', t.created_at, 'template', t.template_id, 'unit', round(t.price::numeric / greatest(t.qty, 1), 1), 'qty', t.qty, 'currency', t.currency, 'purity', t.purity, 'rarity', t.rarity) order by t.created_at desc), '[]')
  from market_transactions t where t.created_at > now() - interval '30 days' and (p_tpl is null or t.template_id = p_tpl) $$;
