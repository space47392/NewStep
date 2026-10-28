-- First-week checklist: small steps for a student who's new to the school.
--
-- Most steps tick themselves from what the student already did in the app
-- (a profile photo, a buddy, a first message, a question, a first star).
-- Opening the school guide ticks "guide". The steps that happen off the
-- phone ("found my classrooms", "found a spot for lunch") are ticked by hand.
--
-- Step keys must match FIRST_WEEK_STEPS in src/lib/firstWeek.ts (a unit
-- test checks this). Safe to run more than once.

create table if not exists public.first_week_steps (
  user_id uuid not null references public.profiles (id) on delete cascade,
  step text not null check (step in ('guide', 'classes', 'lunch')),
  done_at timestamptz not null default now(),
  primary key (user_id, step)
);

alter table public.first_week_steps enable row level security;

drop policy if exists "Students can see their own first-week steps" on public.first_week_steps;
create policy "Students can see their own first-week steps"
  on public.first_week_steps for select to authenticated
  using (user_id = auth.uid());
-- Writes only go through set_first_week_step().

-- Tick or untick a step done by hand (or by visiting the guide).
create or replace function public.set_first_week_step(p_step text, p_done boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if p_step not in ('guide', 'classes', 'lunch') then
    raise exception 'Unknown step.';
  end if;
  if p_done then
    insert into public.first_week_steps (user_id, step) values (auth.uid(), p_step)
    on conflict (user_id, step) do nothing;
  else
    delete from public.first_week_steps where user_id = auth.uid() and step = p_step;
  end if;
end;
$$;
revoke all on function public.set_first_week_step(text, boolean) from public, anon;
grant execute on function public.set_first_week_step(text, boolean) to authenticated;

-- Everything the checklist needs in one call, about the signed-in student only.
create or replace function public.first_week_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'profile', exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.avatar_url is not null and coalesce(array_length(p.interests, 1), 0) > 0
    ),
    'buddy', exists (select 1 from public.buddy_pairs b where b.newcomer_id = auth.uid() and b.status in ('asked', 'active', 'ended')),
    'hello', exists (select 1 from public.messages m where m.sender_id = auth.uid()),
    'ask', exists (select 1 from public.posts p where p.author_id = auth.uid()),
    'star', exists (select 1 from public.sky_diary d where d.user_id = auth.uid()),
    'manual', coalesce((select jsonb_agg(s.step) from public.first_week_steps s where s.user_id = auth.uid()), '[]'::jsonb)
  )
  where auth.uid() is not null;
$$;
revoke all on function public.first_week_status() from public, anon;
grant execute on function public.first_week_status() to authenticated;
