-- ajuste da expansão: endereços de recebimento dos depósitos (preenchidos só pelo dono, nunca inventados) e
-- depósito bloqueado enquanto o endereço do método escolhido estiver vazio
set search_path = public;
update game_config set value = value || '{"receive":{"polygon":"","bep20":"","trc20":"","pix":""}}' where key = 'p2e' and not (value ? 'receive');
create or replace function admin_set_receive(p_receive jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if not is_admin() then raise exception 'só administrador'; end if;
  for k in select jsonb_object_keys(p_receive) loop if k not in ('polygon','bep20','trc20','pix') then raise exception 'método inválido: %', k; end if; end loop;
  if coalesce(p_receive ->> 'polygon', '') <> '' and p_receive ->> 'polygon' !~ '^0x[0-9a-fA-F]{40}$' then raise exception 'endereço Polygon inválido'; end if;
  if coalesce(p_receive ->> 'bep20', '') <> '' and p_receive ->> 'bep20' !~ '^0x[0-9a-fA-F]{40}$' then raise exception 'endereço BEP-20 inválido'; end if;
  if coalesce(p_receive ->> 'trc20', '') <> '' and p_receive ->> 'trc20' !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$' then raise exception 'endereço TRC-20 inválido'; end if;
  update game_config set value = jsonb_set(value, '{receive}', coalesce(value -> 'receive', '{}') || p_receive) where key = 'p2e';
  insert into account_audit_log(user_id, action, meta) values (auth.uid(), 'admin_receive', jsonb_build_object('keys', (select jsonb_agg(k2) from jsonb_object_keys(p_receive) k2)));
  return admin_p2e_view();
end $$;
revoke all on function admin_set_receive(jsonb) from public, anon; grant execute on function admin_set_receive(jsonb) to authenticated;
create or replace function create_deposit(p_package text, p_method text, p_reference text) returns jsonb language plpgsql security definer set search_path = public as $$
declare c characters; k jsonb := cfg('p2e'); pk jsonb; n int;
begin
  select * into c from characters where user_id = auth.uid() for update; if c.id is null then raise exception 'sem personagem'; end if;
  if not (k ->> 'enabled')::boolean then raise exception 'carteira desligada'; end if;
  select x into pk from jsonb_array_elements(k -> 'packages') x where x ->> 'id' = p_package; if pk is null then raise exception 'pacote inválido'; end if;
  if p_method not in ('polygon','bep20','trc20','pix') then raise exception 'forma de pagamento inválida'; end if;
  if coalesce(k -> 'receive' ->> p_method, '') = '' then raise exception 'esse método ainda não tem endereço de recebimento configurado'; end if;
  if length(btrim(coalesce(p_reference, ''))) < 6 then raise exception 'informe o hash da transação ou o código do PIX'; end if;
  if exists (select 1 from deposit_requests where reference = btrim(p_reference) and status <> 'rejected') then raise exception 'essa referência já foi usada'; end if;
  select count(*) into n from deposit_requests where character_id = c.id and status = 'pending'; if n >= 3 then raise exception 'você já tem 3 depósitos esperando confirmação'; end if;
  insert into deposit_requests(character_id, package_id, gems, usdt, method, reference) values (c.id, p_package, (pk ->> 'gems')::bigint, (pk ->> 'usdt')::numeric, p_method, btrim(p_reference));
  insert into account_audit_log(user_id, action, meta) values (c.user_id, 'deposito_pedido', jsonb_build_object('package', p_package, 'method', p_method));
  return wallet_view();
end $$;
