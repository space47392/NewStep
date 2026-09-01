-- Adds a private, trusted-only ledger of how a user earned their profiles.points.
-- Derived from the exact same event handle_post_completed() already fires on, so
-- profiles.points and this ledger can never drift apart — one write path, one
-- transaction. Run after secure_help_lifecycle.sql.

create table public.points_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null,
  reason text not null check (reason in ('help_completed')),
  post_id uuid references public.posts (id) on delete set null,
  created_at timestamptz not null default now()
);

create index points_history_user_id_idx on public.points_history (user_id, created_at desc);

-- Belt-and-suspenders against awarding the same post twice: handle_post_completed()
-- already only fires once per post (old.status <> 'completed' guard, see
-- secure_help_lifecycle.sql), but this makes "one help_completed row per post" a
-- hard database guarantee too, independent of the trigger's own logic.
create unique index points_history_post_reason_unique_idx
  on public.points_history (post_id, reason)
  where post_id is not null;

alter table public.points_history enable row level security;

-- Private per-user ledger, NOT the public leaderboard. A user can see WHY they
-- earned points; nobody else can see their detailed earn history — only their
-- public total (profiles.points) is visible to others, same as before.
create policy "Users can view their own points history"
  on public.points_history for select
  using (auth.uid() = user_id);

-- Deliberately NO insert/update/delete policy for authenticated/anon. With RLS
-- enabled and zero permissive write policies, every client-side write attempt
-- (fake entries, deleting entries, awarding self or someone else) is rejected
-- outright. The only writer is handle_post_completed() below — SECURITY DEFINER,
-- so it bypasses RLS the same way it already does for profiles.points.

-- Same function, same trigger (on_post_completed, unchanged) as
-- secure_help_lifecycle.sql — one addition: log the award to points_history in
-- the same transaction as the points increment.
create or replace function public.handle_post_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' and new.helper_id is not null then
    perform set_config('newstep.allow_points_change', 'on', true);
    update public.profiles
    set points = points + 1
    where id = new.helper_id;

    insert into public.points_history (user_id, amount, reason, post_id)
    values (new.helper_id, 1, 'help_completed', new.id)
    on conflict (post_id, reason) where post_id is not null do nothing;
  end if;
  return new;
end;
$$;
