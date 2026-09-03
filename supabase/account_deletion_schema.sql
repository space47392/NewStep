-- Account deletion (Step 9). Two pieces:
--
-- 1. reports.reporter_id gets the same "preserve moderation evidence"
-- treatment every other target column in that table already has (ON DELETE
-- SET NULL, not CASCADE — see safety_moderation_schema.sql). reporter_id was
-- the one column left as CASCADE, which contradicted that table's own stated
-- design principle. Left as-is, deleting your own account would have
-- silently erased any report you'd filed against someone else — the exact
-- "don't silently delete moderation evidence" case this step calls out.
--
-- 2. delete_my_account() deletes the caller's own auth.users row directly via
-- SQL, inside a SECURITY DEFINER function — the standard Supabase pattern for
-- self-service deletion that needs neither a service-role key nor an Edge
-- Function: a function owned by a sufficiently privileged role (same as
-- every other SECURITY DEFINER function in this project) can modify
-- auth.users directly, and Supabase's own auth schema already cleans up its
-- internal session/token tables when a user row is deleted.
--
-- Deleting auth.users cascades to public.profiles (profiles.id references
-- auth.users(id) on delete cascade — profile_schema.sql), which in turn
-- cascades to everything that already references profiles.id: posts,
-- comments, likes, stories, conversations + messages, points_history,
-- user_achievements, notifications, blocks. None of that cascade behavior is
-- changed by this migration — it already existed, table by table, since
-- whichever step first created each one. See the written report for the one
-- real caveat this doesn't solve (shared conversation history).

alter table public.reports
  alter column reporter_id drop not null,
  drop constraint reports_reporter_id_fkey,
  add constraint reports_reporter_id_fkey
    foreign key (reporter_id) references public.profiles (id) on delete set null;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You must be signed in to delete your account.';
  end if;

  delete from auth.users where id = v_uid;
end;
$$;
