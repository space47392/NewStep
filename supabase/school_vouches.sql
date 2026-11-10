-- Classmates vouch: two verified students at a school confirm a new one.
--
-- No one has to review anything by hand. A student waiting on verification
-- gets a short code. They give it to classmates (a buddy, someone in class),
-- who enter it in their own app, see who it belongs to, and confirm. Two
-- confirmations from verified students at that school verify them.
--
-- Guard rails:
--   * Only verified students at the same school can vouch, and not for
--     themselves or across a block.
--   * Each student can vouch for at most 5 people a day and try at most 20
--     codes a day, so codes can't be guessed.
--   * Every vouch is kept (who vouched for whom). If an account turns out
--     to be fake, the people who vouched for it are on record.
--
-- The code alphabet must match VOUCH_ALPHABET in src/lib/schoolVerification.ts
-- (a test checks this). Run after school_access_pending.sql. Safe to run
-- more than once.

-- 'vouch' joins the ways a student can be verified.
alter table public.profiles drop constraint if exists profiles_school_verify_method_check;
alter table public.profiles add constraint profiles_school_verify_method_check
  check (school_verify_method is null or school_verify_method in ('email', 'student_id', 'grandfathered', 'vouch'));

create table if not exists public.school_vouch_codes (
  student_id uuid primary key references public.profiles (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.school_vouches (
  student_id uuid not null references public.profiles (id) on delete cascade,
  voucher_id uuid not null references public.profiles (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, voucher_id, school_id),
  check (student_id <> voucher_id)
);

-- Every code lookup, to cap guessing.
create table if not exists public.school_vouch_attempts (
  voucher_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists school_vouch_attempts_idx on public.school_vouch_attempts (voucher_id, created_at desc);

alter table public.school_vouch_codes enable row level security;
alter table public.school_vouches enable row level security;
alter table public.school_vouch_attempts enable row level security;
-- No policies: only through the functions below.

-- Vouches needed to be verified.
create or replace function public.vouches_needed()
returns integer
language sql
immutable
set search_path = ''
as $$ select 2 $$;

-- My code to share, for the school I'm waiting on (new code if I changed school).
create or replace function public.my_vouch_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select pending_school_id into v_school from public.profiles where id = auth.uid();
  if v_school is null then
    raise exception 'Pick your school first.';
  end if;
  select code into v_code from public.school_vouch_codes where student_id = auth.uid() and school_id = v_school;
  if v_code is not null then
    return v_code;
  end if;
  delete from public.school_vouch_codes where student_id = auth.uid();
  loop
    v_code := (
      select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
        from generate_series(1, 6)
    );
    begin
      insert into public.school_vouch_codes (student_id, school_id, code) values (auth.uid(), v_school, v_code);
      return v_code;
    exception when unique_violation then
      -- Taken: try another.
    end;
  end loop;
end;
$$;

-- Internal: finds the student behind a code if the caller may vouch for them.
-- Counts the attempt either way.
create or replace function public.vouch_target(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.profiles;
  v_code public.school_vouch_codes;
  v_student public.profiles;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select * into v_me from public.profiles where id = auth.uid();
  if v_me.school_id is null or v_me.school_verified_at is null then
    raise exception 'Verify your own school first.';
  end if;
  if (select count(*) from public.school_vouch_attempts where voucher_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'That''s a lot of codes today. Try again tomorrow.';
  end if;
  insert into public.school_vouch_attempts (voucher_id) values (auth.uid());

  select * into v_code from public.school_vouch_codes where code = upper(btrim(coalesce(p_code, '')));
  select * into v_student from public.profiles where id = v_code.student_id;
  if v_code.code is null or v_student.id is null or v_student.pending_school_id is distinct from v_code.school_id then
    raise exception 'That code didn''t match anyone. Check it and try again.';
  end if;
  if v_student.id = auth.uid() then
    raise exception 'Ask a classmate to enter your code.';
  end if;
  if v_code.school_id <> v_me.school_id then
    raise exception 'That student picked a different school.';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = v_student.id)
       or (b.blocker_id = v_student.id and b.blocked_id = auth.uid())
  ) then
    raise exception 'That code didn''t match anyone. Check it and try again.';
  end if;
  return v_student.id;
end;
$$;
revoke all on function public.vouch_target(text) from public, anon, authenticated;

-- Who a code belongs to, so the classmate can check it's the right person.
create or replace function public.preview_vouch(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := public.vouch_target(p_code);
begin
  return (
    select jsonb_build_object(
      'full_name', p.full_name,
      'username', p.username,
      'avatar_url', p.avatar_url,
      'school_name', (select s.name from public.schools s where s.id = p.pending_school_id),
      'already_vouched', exists (select 1 from public.school_vouches v where v.student_id = p.id and v.voucher_id = auth.uid() and v.school_id = p.pending_school_id)
    )
    from public.profiles p where p.id = v_id
  );
end;
$$;

-- Confirm. Returns 'verified' when this was the vouch that got them in.
create or replace function public.vouch_for_classmate(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := public.vouch_target(p_code);
  v_school uuid;
  v_count integer;
begin
  if (select count(*) from public.school_vouches where voucher_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'You''ve vouched for 5 classmates today. Thank you! Try again tomorrow.';
  end if;
  select pending_school_id into v_school from public.profiles where id = v_id;
  insert into public.school_vouches (student_id, voucher_id, school_id)
  values (v_id, auth.uid(), v_school)
  on conflict do nothing;
  select count(*) into v_count from public.school_vouches where student_id = v_id and school_id = v_school;
  if v_count >= public.vouches_needed() then
    perform public.mark_school_verified(v_id, 'vouch');
    delete from public.school_vouch_codes where student_id = v_id;
    return 'verified';
  end if;
  return 'vouched';
end;
$$;

-- Status for the app: same as school_verification.sql plus vouches so far.
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
    'vouches', (select count(*) from public.school_vouches v where v.student_id = p.id and v.school_id = p.pending_school_id),
    'vouches_needed', public.vouches_needed(),
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

revoke all on function public.my_vouch_code() from public, anon;
grant execute on function public.my_vouch_code() to authenticated;
revoke all on function public.preview_vouch(text) from public, anon;
grant execute on function public.preview_vouch(text) to authenticated;
revoke all on function public.vouch_for_classmate(text) from public, anon;
grant execute on function public.vouch_for_classmate(text) to authenticated;
revoke all on function public.my_school_verification() from public, anon;
grant execute on function public.my_school_verification() to authenticated;
