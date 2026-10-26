-- School guide: tips from classmates — "the stuff nobody tells you on day one".
--
-- Each tip belongs to one school and one category. Students at that school
-- can read them, mark one "This helped" (once each), and the most helpful
-- rise to the top. Writes go through the functions below, which check the
-- school and keep it to a sensible pace.

create table if not exists public.school_tips (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete cascade,
  category text not null check (category in ('around', 'food', 'clubs', 'classes', 'people', 'other')),
  title text not null check (char_length(btrim(title)) between 3 and 80),
  body text check (body is null or char_length(body) <= 500),
  helpful_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists school_tips_school_idx on public.school_tips (school_id, helpful_count desc, created_at desc);

create table if not exists public.school_tip_helpful (
  tip_id uuid not null references public.school_tips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tip_id, user_id)
);

create table if not exists public.school_tip_reports (
  id uuid primary key default gen_random_uuid(),
  tip_id uuid references public.school_tips (id) on delete set null,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (tip_id, reporter_id)
);

alter table public.school_tips enable row level security;
alter table public.school_tip_helpful enable row level security;
alter table public.school_tip_reports enable row level security;

-- Read: tips from my own school.
drop policy if exists "Students can read their school's tips" on public.school_tips;
create policy "Students can read their school's tips"
  on public.school_tips for select to authenticated
  using (school_id = (select p.school_id from public.profiles p where p.id = auth.uid()));

drop policy if exists "Students can see their own helpful marks" on public.school_tip_helpful;
create policy "Students can see their own helpful marks"
  on public.school_tip_helpful for select to authenticated
  using (user_id = auth.uid());
-- (No policies on reports: only reachable through report_school_tip.)

-- Share a tip.
create or replace function public.add_school_tip(p_category text, p_title text, p_body text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  select school_id into v_school from public.profiles where id = auth.uid();
  if v_school is null then
    raise exception 'Add your school first.';
  end if;
  if (select count(*) from public.school_tips where author_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'That''s a lot of tips for one day — thank you! Try again tomorrow.';
  end if;
  insert into public.school_tips (school_id, author_id, category, title, body)
  values (v_school, auth.uid(), p_category, btrim(p_title), nullif(btrim(coalesce(p_body, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_school_tip(text, text, text) from public, anon;
grant execute on function public.add_school_tip(text, text, text) to authenticated;

-- Delete my own tip.
create or replace function public.delete_school_tip(p_tip uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.school_tips where id = p_tip and author_id = auth.uid();
$$;
revoke all on function public.delete_school_tip(uuid) from public, anon;
grant execute on function public.delete_school_tip(uuid) to authenticated;

-- "This helped" on or off. Returns the new count.
create or replace function public.toggle_school_tip_helpful(p_tip uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tip public.school_tips;
  v_count integer;
begin
  select * into v_tip from public.school_tips where id = p_tip;
  if v_tip.id is null or v_tip.school_id is distinct from (select school_id from public.profiles where id = auth.uid()) then
    raise exception 'Tip not found.';
  end if;
  if v_tip.author_id = auth.uid() then
    raise exception 'That''s your own tip 💛';
  end if;
  if exists (select 1 from public.school_tip_helpful where tip_id = p_tip and user_id = auth.uid()) then
    delete from public.school_tip_helpful where tip_id = p_tip and user_id = auth.uid();
  else
    insert into public.school_tip_helpful (tip_id, user_id) values (p_tip, auth.uid());
  end if;
  select count(*) into v_count from public.school_tip_helpful where tip_id = p_tip;
  update public.school_tips set helpful_count = v_count where id = p_tip;
  return v_count;
end;
$$;
revoke all on function public.toggle_school_tip_helpful(uuid) from public, anon;
grant execute on function public.toggle_school_tip_helpful(uuid) to authenticated;

-- Report a tip for review. Reports are reviewed from the SQL editor:
--   select r.created_at, r.reason, t.title, t.body, t.author_id
--   from public.school_tip_reports r left join public.school_tips t on t.id = r.tip_id
--   order by r.created_at desc;
create or replace function public.report_school_tip(p_tip uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.school_tips t
    where t.id = p_tip and t.school_id = (select school_id from public.profiles where id = auth.uid())
  ) then
    raise exception 'Tip not found.';
  end if;
  insert into public.school_tip_reports (tip_id, reporter_id, reason)
  values (p_tip, auth.uid(), left(p_reason, 200))
  on conflict (tip_id, reporter_id) do nothing;
end;
$$;
revoke all on function public.report_school_tip(uuid, text) from public, anon;
grant execute on function public.report_school_tip(uuid, text) to authenticated;
