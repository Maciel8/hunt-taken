-- make_part: parâmetros com prefixo (mat também é nome de coluna em item_templates)
set search_path = public;
drop function if exists make_part(text,text,numeric,int);
create or replace function make_part(p_part text, p_mat text, p_pur numeric, p_skill int) returns jsonb language plpgsql volatile as $$
declare p jsonb := (select props from item_templates where id = p_mat); q numeric := greatest(0, least(100, p_pur * 0.7 + least(30, p_skill * 0.6) + rand_normal() * 4));
begin
  return jsonb_build_object('part', p_part, 'mat', p_mat, 'mat_name', (select name from item_templates where id = p_mat), 'purity', round(p_pur), 'quality', round(q), 'tier', (select tier from item_templates where id = p_mat),
    'power', round((p ->> 'power')::numeric * (0.7 + q / 100 * 0.6), 2), 'weight', (p ->> 'weight')::numeric, 'tough', round((p ->> 'tough')::numeric * (0.7 + q / 100 * 0.5)), 'magic', coalesce((p ->> 'magic')::numeric, 0));
end $$;
revoke all on function make_part(text,text,numeric,int) from public, anon, authenticated;
