set search_path = public;
drop function if exists quest_kills(uuid,text,int);
create or replace function quest_kills(cid uuid, p_target text, n int) returns void language plpgsql as $$
begin
  if n <= 0 then return; end if;
  update quest_progress qp set progress = least(d.goal, qp.progress + n), status = case when qp.progress + n >= d.goal then 'pronta' else 'ativa' end, updated_at = now()
    from quest_defs d where d.id = qp.quest_id and qp.character_id = cid and qp.status = 'ativa' and d.target = p_target and d.kind in ('kill','drop','dungeon');
end $$;
revoke all on function quest_kills(uuid,text,int) from public, anon, authenticated;
