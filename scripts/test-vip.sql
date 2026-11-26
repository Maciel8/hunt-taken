-- Teste do VIP e do Passe de Batalha (transação desfeita no fim: nada fica gravado).
\set ON_ERROR_STOP 1
begin;
create temp table r(k text, v text) on commit drop; grant all on r to authenticated;
select id as tid, user_id as tuid from characters where name = 'Testador' \gset
create or replace function pg_temp.as_(u uuid) returns void language sql as $$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
update characters set vip_until = null, pass_premium_until = null, premium = false, level = greatest(level, 10) where id = :'tid';
delete from character_boosts where character_id = :'tid'; delete from battle_pass where character_id = :'tid';
update wallets set gems = 200 where character_id = :'tid';
-- VIP: 30 dias = 10 💎; renovar soma
set local role authenticated; select pg_temp.as_(:'tuid');
select buy_vip(30) is not null as a \gset
select buy_vip(30) is not null as b \gset
reset role;
insert into r select 'v1_vip_dias', round(extract(epoch from vip_until - now()) / 86400)::text from characters where id = :'tid';
insert into r select 'v1_vip_custo', (200 - gems)::text from wallets where character_id = :'tid';
insert into r select 'v2_exp_vip', bonus_mult(c, 'exp')::text from characters c where id = :'tid';
-- Passe: resgate do dia, não repete no mesmo dia
select gold as g0, pots as p0 from wallets w join characters c on c.id = w.character_id where c.id = :'tid' \gset
set local role authenticated; select pg_temp.as_(:'tuid');
insert into r select 'p1_dia', pass_claim() -> 'claimed' ->> 'day';
do $$ begin perform pass_claim(); insert into r values ('p2_duas_vezes', 'RESGATOU (erro)'); exception when others then insert into r values ('p2_duas_vezes', sqlerrm); end $$;
reset role;
insert into r select 'p1_gold', (gold - :g0 = (select (free ->> 'gold')::bigint from battle_pass_rewards where day = 1))::text from wallets where character_id = :'tid';
-- sequência: resgatou ontem no dia 7 → hoje é o Dia 7 (estrela)
update battle_pass set last_claim = (now() at time zone 'America/Sao_Paulo')::date - 1, day = 7 where character_id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
insert into r select 'p3_sequencia', (pass_claim() -> 'claimed') ->> 'star';
-- faltou um dia → volta pro Dia 1
reset role; update battle_pass set last_claim = (now() at time zone 'America/Sao_Paulo')::date - 3, day = 12 where character_id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
insert into r select 'p4_faltou', pass_claim() -> 'claimed' ->> 'day';
-- Premium: 50 💎, entrega o grátis + o premium (Dia 1 dá 3 dias de VIP)
reset role; update battle_pass set last_claim = (now() at time zone 'America/Sao_Paulo')::date - 1, day = 1 where character_id = :'tid'; update characters set vip_until = null where id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
select buy_pass_premium() is not null as c1 \gset
insert into r select 'p5_premium_vip', (pass_claim() -> 'claimed' -> 'premium' ->> 'vip_days');
reset role; insert into r select 'p5_vip_ganho', round(extract(epoch from vip_until - now()) / 86400)::text from characters where id = :'tid';
-- acumula até 90 dias
set local role authenticated; select pg_temp.as_(:'tuid');
select buy_pass_premium() is not null as c2 \gset
select buy_pass_premium() is not null as c3 \gset
do $$ begin perform buy_pass_premium(); insert into r values ('p6_max90', 'COMPROU (erro)'); exception when others then insert into r values ('p6_max90', sqlerrm); end $$;
-- boost de exp do passe soma com o VIP
reset role; insert into character_boosts values (:'tid', 'exp', now() + interval '1 hour') on conflict (character_id, kind) do update set until = excluded.until;
insert into r select 'b1_vip_mais_boost', bonus_mult(c, 'exp')::text from characters c where id = :'tid';
-- nível baixo: passe trancado
update characters set level = 5 where id = :'tid'; update battle_pass set last_claim = null where character_id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
do $$ begin perform pass_claim(); insert into r values ('p7_nivel', 'RESGATOU (erro)'); exception when others then insert into r values ('p7_nivel', sqlerrm); end $$;
-- sem diamantes
reset role; update wallets set gems = 3 where character_id = :'tid';
set local role authenticated; select pg_temp.as_(:'tuid');
do $$ begin perform buy_vip(60); insert into r values ('v3_sem_gemas', 'COMPROU (erro)'); exception when others then insert into r values ('v3_sem_gemas', sqlerrm); end $$;
reset role;
select k || ' => ' || coalesce(v, 'NULL') from r order by k;
rollback;
