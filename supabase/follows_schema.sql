-- Follow / Social Graph (Step 10). One new table, two new trigger functions,
-- and one widened CHECK constraint on the existing notifications table.
-- Nothing about messages, create_notification()'s body, or any existing RLS
-- policy is touched — only additive objects, reusing what Steps 6/7 already
-- built rather than introducing a second notification or blocking mechanism.

-- =====================================================================
-- 1. follows — a one-way relationship, exactly the shape you proposed.
-- =====================================================================
create table public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint follows_not_self check (follower_id <> following_id),
  constraint follows_unique unique (follower_id, following_id)
);

create index follows_follower_idx on public.follows (follower_id);
create index follows_following_idx on public.follows (following_id);

alter table public.follows enable row level security;

-- Public, like `likes` — followers/following lists are a normal visible
-- feature of a profile, unlike `blocks` (deliberately private/asymmetric).
create policy "Follows are viewable by everyone"
  on public.follows for select
  using (true);

create policy "Users can follow as themselves"
  on public.follows for insert
  with check (auth.uid() = follower_id);

create policy "Users can unfollow their own follows"
  on public.follows for delete
  using (auth.uid() = follower_id);

-- =====================================================================
-- 2. Blocked-pair protection. Can't be expressed in the INSERT policy's
-- WITH CHECK directly — users_blocked() requires its transaction-local guard
-- flag to already be set (Step 7's users_blocked_security_fix.sql), and a
-- plain RLS boolean expression can't run `perform set_config(...)` first.
-- Same fix already applied to messages: move the check into a BEFORE INSERT
-- trigger, a real function body that can set the flag itself.
-- =====================================================================
create or replace function public.guard_follow_not_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('newstep.allow_users_blocked_check', 'on', true);
  if public.users_blocked(new.follower_id, new.following_id) then
    raise exception 'Unable to follow this user.';
  end if;
  return new;
end;
$$;

create trigger guard_follow_not_blocked
  before insert on public.follows
  for each row execute function public.guard_follow_not_blocked();

-- =====================================================================
-- 3. Widen the existing notifications.type CHECK to allow 'follow' — same
-- pattern already used to widen posts_status_check (Step 1). Nothing else
-- about the notifications table changes.
-- =====================================================================
alter table public.notifications
  drop constraint notifications_type_check,
  add constraint notifications_type_check
    check (type in (
      'like', 'comment', 'volunteer', 'help_completed', 'points_earned',
      'achievement_earned', 'message', 'follow'
    ));

-- =====================================================================
-- 4. Follow notification — routes through the EXISTING create_notification()
-- (Steps 6/7) instead of writing to public.notifications directly, so "skip
-- notifying yourself" and "skip notifying a blocked pair" both come for free
-- from logic that already exists, not a second copy of it. In practice a
-- blocked pair can never reach this trigger at all — guard_follow_not_blocked
-- above already stops the INSERT before a row exists — so this is a second,
-- redundant layer, consistent with how the rest of this project guards things.
-- =====================================================================
create or replace function public.notify_new_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  follower_name text;
begin
  select full_name into follower_name from public.profiles where id = new.follower_id;
  perform set_config('newstep.allow_notification_create', 'on', true);
  perform public.create_notification(
    new.following_id, new.follower_id, 'follow', null, null, null,
    'New follower', coalesce(follower_name, 'Someone') || ' started following you'
  );
  return new;
end;
$$;

create trigger on_follow_created_notify
  after insert on public.follows
  for each row execute function public.notify_new_follow();
