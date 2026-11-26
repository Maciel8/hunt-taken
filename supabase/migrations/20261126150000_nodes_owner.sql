-- a lista de depósitos informa quais são exclusivos do Forte Cinzento (o cliente pinta o marcador de amarelo pra quem não domina)
set search_path = public;
create or replace function nodes_view() returns jsonb language sql security definer set search_path = public stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'kind', n.kind, 'prof', n.profession_id, 'tool', n.tool, 'tool_tier', n.tool_tier, 'req', n.req_level, 'x', n.x, 'y', n.y, 'owner', n.owner,
    'remaining', coalesce(s.remaining, n.capacity), 'capacity', n.capacity, 'refill_at', s.refill_at)), '[]') from resource_nodes n left join resource_node_state s on s.node_id = n.id $$;
