-- School verification: only students who prove they go to a school get in.
--
-- Until now, picking a school in the list was enough to see that school's
-- guide, School Sky, lanterns, buddies and classmates, and anyone could
-- switch schools at will. Now:
--
--   * Picking a school sets profiles.pending_school_id. profiles.school_id
--     (what every school-scoped policy and query already uses) is only set
--     once the student is verified, so unverified accounts are outside every
--     school space without touching those policies.
--   * Clients can no longer change school_id/school_name (or the
--     verification columns) directly. Only the functions below can.
--   * Verify by school email: a 6-digit code sent to an address on the
--     school's email domain (schools.email_domains). Only a session that
--     signed in with an emailed code (JWT amr "otp") counts, so an account
--     created with a typed-in address and no inbox access doesn't. One
--     school email verifies one account.
--   * Or by student ID photo (students without a school email): a moderator
--     approves or rejects it, and the app deletes the photo right after.
--   * Accounts that already had a school when this ran are grandfathered as
--     verified.
--
-- School email domains are added from the SQL editor:
--   select public.set_school_email_domains('<school uuid>', array['myschool.org']);
--
-- Domain matching must agree with src/lib/schoolVerification.ts (tested).
-- Run after moderation.sql. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.schools add column if not exists email_domains text[] not null default '{}';

alter table public.profiles add column if not exists pending_school_id uuid references public.schools (id) on delete set null;
alter table public.profiles add column if not exists school_verified_at timestamptz;
alter table public.profiles add column if not exists school_verify_method text;
alter table public.profiles add column if not exists school_email_hash text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_school_verify_method_check') then
    alter table public.profiles add constraint profiles_school_verify_method_check
      check (school_verify_method is null or school_verify_method in ('email', 'student_id', 'grandfathered'));
  end if;
end;
$$;
-- One school email, one account.
create unique index if not exists profiles_school_email_hash_key on public.profiles (school_email_hash) where school_email_hash is not null;

-- ---------------------------------------------------------------------------
-- Lock the school columns: only the functions here may change them
-- ---------------------------------------------------------------------------

create or replace function public.guard_profile_school_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('newstep.allow_school_change', true), 'off') = 'on' then
    return new;
  end if;
  raise exception 'Your school can only be changed from the school screen.';
end;
$$;

drop trigger if exists guard_profile_school_update on public.profiles;
create trigger guard_profile_school_update
  before update on public.profiles
  for each row
  when (
    old.school_id is distinct from new.school_id
    or old.school_name is distinct from new.school_name
    or old.pending_school_id is distinct from new.pending_school_id
    or old.school_verified_at is distinct from new.school_verified_at
    or old.school_verify_method is distinct from new.school_verify_method
    or old.school_email_hash is distinct from new.school_email_hash
  )
  execute function public.guard_profile_school_update();

-- Existing students keep their school.
do $$
begin
  perform set_config('newstep.allow_school_change', 'on', true);
  update public.profiles
     set school_verified_at = now(), school_verify_method = 'grandfathered'
   where (school_id is not null or school_name is not null) and school_verified_at is null;
  perform set_config('newstep.allow_school_change', 'off', true);
end;
$$;

-- Marks the signed-in student verified for their pending school.
create or replace function public.mark_school_verified(p_user uuid, p_method text, p_email_hash text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('newstep.allow_school_change', 'on', true);
  update public.profiles
     set school_id = pending_school_id,
         school_name = null,
         pending_school_id = null,
         school_verified_at = now(),
         school_verify_method = p_method,
         school_email_hash = coalesce(p_email_hash, school_email_hash)
   where id = p_user and pending_school_id is not null;
  perform set_config('newstep.allow_school_change', 'off', true);
end;
$$;
-- Internal: called by the verification functions only.
revoke all on function public.mark_school_verified(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Picking a school
-- ---------------------------------------------------------------------------

-- Picking your own school again keeps you verified. Picking a different one
-- leaves the old school and waits for verification at the new one.
create or replace function public.choose_school(p_school uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if not exists (select 1 from public.schools where id = p_school) then
    raise exception 'School not found.';
  end if;
  select * into v_me from public.profiles where id = auth.uid();
  perform set_config('newstep.allow_school_change', 'on', true);
  if v_me.school_id = p_school and v_me.school_verified_at is not null then
    update public.profiles set pending_school_id = null where id = auth.uid();
    perform set_config('newstep.allow_school_change', 'off', true);
    return 'verified';
  end if;
  update public.profiles
     set pending_school_id = p_school,
         school_id = null,
         school_name = null,
         school_verified_at = null,
         school_verify_method = null,
         school_email_hash = null
   where id = auth.uid();
  perform set_config('newstep.allow_school_change', 'off', true);
  return 'pending';
end;
$$;
revoke all on function public.choose_school(uuid) from public, anon;
grant execute on function public.choose_school(uuid) to authenticated;

-- SQL editor only: which email domains a school's students have.
create or replace function public.set_school_email_domains(p_school uuid, p_domains text[])
returns text[]
language sql
security definer
set search_path = ''
as $$
  update public.schools
     set email_domains = (select coalesce(array_agg(distinct lower(btrim(d))), '{}') from unnest(p_domains) d where btrim(d) <> '')
   where id = p_school
  returning email_domains;
$$;
revoke all on function public.set_school_email_domains(uuid, text[]) from public, anon, authenticated;

-- An email's domain belongs to a school when it is one of its domains or a
-- subdomain of one ("student.myschool.org" for "myschool.org").
create or replace function public.email_matches_school(p_email text, p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.schools s, unnest(s.email_domains) d
    where s.id = p_school
      and (lower(split_part(btrim(p_email), '@', 2)) = d
           or lower(split_part(btrim(p_email), '@', 2)) like '%.' || d)
  );
$$;
revoke all on function public.email_matches_school(text, uuid) from public, anon;
grant execute on function public.email_matches_school(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. School email
-- ---------------------------------------------------------------------------

-- The app asks Supabase Auth to email a sign-in code to the school address
-- from a separate, throwaway client. That creates an auth user for the
-- address; these are remembered here and never get a student profile.
create table if not exists public.school_email_verifiers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.school_email_verifiers enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_user_meta_data ->> 'purpose' = 'school_email_check' then
    insert into public.school_email_verifiers (user_id) values (new.id) on conflict do nothing;
    return new;
  end if;
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

-- Short-lived proof that someone opened the school inbox.
create table if not exists public.school_email_proofs (
  token_hash text primary key,
  email text not null,
  issued_by uuid,
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table public.school_email_proofs enable row level security;

-- Called by the throwaway session right after it signs in with the emailed
-- code. Refuses any session that didn't sign in that way.
create or replace function public.issue_school_email_proof()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_token text;
begin
  if auth.uid() is null or v_email = '' then
    raise exception 'You must be signed in.';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' in ('otp', 'magiclink')
      and (a ->> 'timestamp')::bigint > extract(epoch from now() - interval '15 minutes')
  ) then
    raise exception 'Use the code we emailed you.';
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.school_email_proofs (token_hash, email, issued_by, expires_at)
  values (encode(sha256(convert_to(v_token, 'utf8')), 'hex'), v_email, auth.uid(), now() + interval '10 minutes');
  return v_token;
end;
$$;

-- Called by the student's own session with the proof. Checks the email is on
-- the pending school's domain and isn't already someone else's.
create or replace function public.redeem_school_email_proof(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proof public.school_email_proofs;
  v_me public.profiles;
  v_hash text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select * into v_proof from public.school_email_proofs
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex');
  if v_proof.token_hash is null or v_proof.used_at is not null or v_proof.expires_at < now() then
    raise exception 'That code has expired. Send a new one.';
  end if;
  select * into v_me from public.profiles where id = auth.uid();
  if v_me.pending_school_id is null then
    raise exception 'Pick your school first.';
  end if;
  if not public.email_matches_school(v_proof.email, v_me.pending_school_id) then
    raise exception 'That email isn''t from your school.';
  end if;
  v_hash := encode(sha256(convert_to(v_proof.email, 'utf8')), 'hex');
  if exists (select 1 from public.profiles where school_email_hash = v_hash and id <> auth.uid()) then
    raise exception 'That school email already verified another account.';
  end if;

  update public.school_email_proofs set used_at = now() where token_hash = v_proof.token_hash;
  perform public.mark_school_verified(auth.uid(), 'email', v_hash);

  -- The throwaway auth user has done its job.
  if v_proof.issued_by is not null and v_proof.issued_by <> auth.uid()
     and exists (select 1 from public.school_email_verifiers where user_id = v_proof.issued_by) then
    delete from auth.users where id = v_proof.issued_by;
  end if;
  return 'verified';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Student ID photo, reviewed by a moderator
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('student-ids', 'student-ids', false)
on conflict (id) do nothing;

drop policy if exists "Students upload their own student ID" on storage.objects;
create policy "Students upload their own student ID"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'student-ids' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Students and moderators can view student IDs" on storage.objects;
create policy "Students and moderators can view student IDs"
  on storage.objects for select to authenticated
  using (bucket_id = 'student-ids' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_moderator()));

drop policy if exists "Students and moderators can delete student IDs" on storage.objects;
create policy "Students and moderators can delete student IDs"
  on storage.objects for delete to authenticated
  using (bucket_id = 'student-ids' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_moderator()));

create table if not exists public.school_id_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade,
  -- Cleared once reviewed: the photo itself is deleted by the app.
  photo_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text check (note is null or char_length(note) <= 300),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists school_id_requests_one_pending on public.school_id_requests (user_id) where status = 'pending';
alter table public.school_id_requests enable row level security;
-- No policies: only through the functions below.

-- Returns the photo path of any earlier pending request it replaced, so the
-- app can delete that file.
create or replace function public.submit_student_id(p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_old text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select pending_school_id into v_school from public.profiles where id = auth.uid();
  if v_school is null then
    raise exception 'Pick your school first.';
  end if;
  if coalesce(split_part(p_path, '/', 1), '') <> auth.uid()::text then
    raise exception 'Upload the photo first.';
  end if;
  if (select count(*) from public.school_id_requests where user_id = auth.uid() and created_at > now() - interval '1 day') >= 3 then
    raise exception 'That''s a few tries today — a moderator will look soon. Try again tomorrow.';
  end if;
  select photo_path into v_old from public.school_id_requests where user_id = auth.uid() and status = 'pending';
  delete from public.school_id_requests where user_id = auth.uid() and status = 'pending';
  insert into public.school_id_requests (user_id, school_id, photo_path) values (auth.uid(), v_school, p_path);
  return v_old;
end;
$$;

create or replace function public.school_id_queue()
returns table (id uuid, user_id uuid, full_name text, username text, school_name text, photo_path text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_moderator() then
    raise exception 'Only moderators can review reports.';
  end if;
  return query
  select r.id, r.user_id, p.full_name, p.username, s.name, r.photo_path, r.created_at
    from public.school_id_requests r
    join public.profiles p on p.id = r.user_id
    join public.schools s on s.id = r.school_id
   where r.status = 'pending'
   order by r.created_at
   limit 100;
end;
$$;

-- Approve or reject. Returns the photo path so the app deletes the file.
create or replace function public.review_student_id(p_request uuid, p_approve boolean, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.school_id_requests;
begin
  if not public.is_moderator() then
    raise exception 'Only moderators can review reports.';
  end if;
  select * into v_req from public.school_id_requests where id = p_request and status = 'pending';
  if v_req.id is null then
    raise exception 'Already reviewed.';
  end if;
  update public.school_id_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         note = nullif(btrim(coalesce(p_note, '')), ''),
         photo_path = null,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_request;
  -- Only if they're still waiting on that same school.
  if p_approve and exists (select 1 from public.profiles where id = v_req.user_id and pending_school_id = v_req.school_id) then
    perform public.mark_school_verified(v_req.user_id, 'student_id');
  end if;
  return v_req.photo_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- Status for the app
-- ---------------------------------------------------------------------------

create or replace function public.my_school_verification()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'verified', p.school_verified_at is not null and (p.school_id is not null or p.school_name is not null),
    'method', p.school_verify_method,
    'pending_school_id', p.pending_school_id,
    'pending_school_name', (select s.name from public.schools s where s.id = p.pending_school_id),
    'pending_school_has_email', coalesce((select cardinality(s.email_domains) > 0 from public.schools s where s.id = p.pending_school_id), false),
    'request', (
      select jsonb_build_object('status', r.status, 'note', r.note, 'created_at', r.created_at)
        from public.school_id_requests r
       where r.user_id = p.id and r.school_id = p.pending_school_id
       order by r.created_at desc limit 1
    )
  )
  from public.profiles p
  where p.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Privileges (src/lib/__tests__/sqlPrivileges.test.ts checks these)
-- ---------------------------------------------------------------------------

revoke all on function public.my_school_verification() from public, anon;
grant execute on function public.my_school_verification() to authenticated;
revoke all on function public.issue_school_email_proof() from public, anon;
grant execute on function public.issue_school_email_proof() to authenticated;
revoke all on function public.redeem_school_email_proof(text) from public, anon;
grant execute on function public.redeem_school_email_proof(text) to authenticated;
revoke all on function public.submit_student_id(text) from public, anon;
grant execute on function public.submit_student_id(text) to authenticated;
revoke all on function public.school_id_queue() from public, anon;
grant execute on function public.school_id_queue() to authenticated;
revoke all on function public.review_student_id(uuid, boolean, text) from public, anon;
grant execute on function public.review_student_id(uuid, boolean, text) to authenticated;
