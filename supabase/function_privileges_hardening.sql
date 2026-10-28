-- Function privileges hardening.
--
-- Postgres lets everyone (PUBLIC) execute a new function by default, and
-- "create or replace" keeps whatever grants a function already had. Many
-- security definer functions here never revoked that. Most check auth.uid()
-- inside, so a signed-out caller got an error, but two were a real problem:
--
--   * send_push_notification(): anyone with the public anon key could send
--     any push text to any student. It's only meant to be called from inside
--     the database (create_notification).
--   * same_school(a, b): anyone could learn whether two students go to the
--     same school.
--
-- This file:
--   1. Revokes every security definer function in public (except trigger
--      functions, which can't be called directly) from PUBLIC and anon, and
--      grants it to authenticated only.
--   2. Revokes send_push_notification from authenticated too, so only the
--      database itself can call it.
--
-- Any security definer function added after this file must revoke from
-- public/anon itself (src/lib/__tests__/sqlPrivileges.test.ts checks this).
-- Safe to run more than once.

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype <> 'trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end;
$$;

-- Internal only: called by create_notification(), never by the app.
revoke all on function public.send_push_notification(uuid, text, text, jsonb) from public, anon, authenticated;

-- Quick check (should list nothing):
--   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
--     and has_function_privilege('anon', p.oid, 'execute');
