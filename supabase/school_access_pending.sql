-- Reading vs. reaching out: what a student can do before verifying.
--
-- A brand-new transfer student often has no school email or student ID in
-- their first days, which is exactly when they need help most. So a student
-- who has picked a school but not verified it yet (profiles.pending_school_id)
-- can READ that school's guide. Everything that reaches other students stays
-- verified-only: sharing or thanking tips, buddies, classmates, messages,
-- School Sky and lanterns. Those all key off profiles.school_id, which stays
-- null until verified (school_verification.sql).
--
-- Run after school_verification.sql. Safe to run more than once.

drop policy if exists "Students can read their school's tips" on public.school_tips;
create policy "Students can read their school's tips"
  on public.school_tips for select to authenticated
  using (
    school_id = (select coalesce(p.school_id, p.pending_school_id) from public.profiles p where p.id = auth.uid())
  );

-- Same as school_tips.sql, with a clearer message for a student still
-- waiting on verification (their school_id is null until then).
create or replace function public.add_school_tip(p_category text, p_title text, p_body text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select * into v_me from public.profiles where id = auth.uid();
  if v_me.school_id is null then
    if v_me.pending_school_id is not null then
      raise exception 'Verify your school first to share tips.';
    end if;
    raise exception 'Add your school first.';
  end if;
  if (select count(*) from public.school_tips where author_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'That''s a lot of tips for one day — thank you! Try again tomorrow.';
  end if;
  insert into public.school_tips (school_id, author_id, category, title, body)
  values (v_me.school_id, auth.uid(), p_category, btrim(p_title), nullif(btrim(coalesce(p_body, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_school_tip(text, text, text) from public, anon;
grant execute on function public.add_school_tip(text, text, text) to authenticated;
