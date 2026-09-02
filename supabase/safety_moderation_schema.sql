-- Safety & Moderation foundation (Step 7): reports, blocks, and a client-immutable
-- role column. Every change below is additive — no existing table's SELECT policy
-- is touched except messages' INSERT policy (drop+recreate, adding one condition
-- to the SAME single policy, never a second one — avoiding the OR-combination
-- trap from Step 1) and get_or_create_conversation()/create_notification()
-- (CREATE OR REPLACE, 100% of the original logic preserved, only appended to).

-- =====================================================================
-- 1. Reports — private, target-typed, duplicate-guarded
-- =====================================================================
-- One nullable FK per possible target (same pattern as notifications' post_id/
-- conversation_id/achievement_id) instead of a single generic "target_id" —
-- keeps real referential integrity per type instead of an untyped polymorphic
-- reference. Only the reference is stored — never message content, comment
-- text, or anything else about the reported content itself.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'story', 'profile', 'message')),
  -- ON DELETE SET NULL (not CASCADE) on every target reference: if the reported
  -- content or account is later deleted, the report survives as a record
  -- instead of the evidence disappearing along with it.
  post_id uuid references public.posts (id) on delete set null,
  comment_id uuid references public.comments (id) on delete set null,
  story_id uuid references public.stories (id) on delete set null,
  reported_user_id uuid references public.profiles (id) on delete set null,
  message_id uuid references public.messages (id) on delete set null,
  reason text not null check (reason in ('harassment', 'spam', 'inappropriate', 'impersonation', 'hate', 'other')),
  details text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  constraint reports_no_self_report check (reported_user_id is null or reported_user_id <> reporter_id),
  -- Exactly the one column matching target_type may be set — keeps the table
  -- honest even though Postgres can't express "polymorphic FK" natively.
  constraint reports_target_matches_type check (
    (target_type = 'post' and post_id is not null and comment_id is null and story_id is null and reported_user_id is null and message_id is null)
    or (target_type = 'comment' and comment_id is not null and post_id is null and story_id is null and reported_user_id is null and message_id is null)
    or (target_type = 'story' and story_id is not null and post_id is null and comment_id is null and reported_user_id is null and message_id is null)
    or (target_type = 'profile' and reported_user_id is not null and post_id is null and comment_id is null and story_id is null and message_id is null)
    or (target_type = 'message' and message_id is not null and post_id is null and comment_id is null and story_id is null and reported_user_id is null)
  )
);

-- One partial unique index per target type — the same idiom already used for
-- points_history's duplicate-award guard — stops the same reporter filing
-- unlimited duplicate reports against the exact same content, without the
-- multi-column-NULL pitfall a single combined UNIQUE constraint would hit
-- (NULL <> NULL, so a plain composite unique constraint wouldn't actually
-- catch duplicates here).
create unique index reports_unique_post on public.reports (reporter_id, post_id) where target_type = 'post';
create unique index reports_unique_comment on public.reports (reporter_id, comment_id) where target_type = 'comment';
create unique index reports_unique_story on public.reports (reporter_id, story_id) where target_type = 'story';
create unique index reports_unique_profile on public.reports (reporter_id, reported_user_id) where target_type = 'profile';
create unique index reports_unique_message on public.reports (reporter_id, message_id) where target_type = 'message';

alter table public.reports enable row level security;

-- You can file a report as yourself only.
create policy "Users can create their own reports"
  on public.reports for insert
  with check (auth.uid() = reporter_id);

-- Deliberately NO select/update/delete policy for any client role. Reports are
-- fully private — not even "see your own reports" — and there is no
-- moderator role/UI yet to grant read access to. A plain .insert() without
-- .select() succeeds fine with zero read access back.

-- =====================================================================
-- 2. Blocks
-- =====================================================================
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocks_not_self check (blocker_id <> blocked_id),
  constraint blocks_unique unique (blocker_id, blocked_id)
);

create index blocks_blocker_idx on public.blocks (blocker_id);
create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

-- Deliberately asymmetric: you can see who YOU blocked (to manage/unblock
-- them), but not who has blocked you — matching how blocking behaves on most
-- real social platforms, and your "don't expose block status" requirement.
create policy "Users can view who they have blocked"
  on public.blocks for select
  using (auth.uid() = blocker_id);

create policy "Users can block others as themselves"
  on public.blocks for insert
  with check (auth.uid() = blocker_id);

create policy "Users can unblock their own blocks"
  on public.blocks for delete
  using (auth.uid() = blocker_id);

-- Checks BOTH directions regardless of the caller's own restricted SELECT
-- access (SECURITY DEFINER bypasses RLS) — this is the one place "is there a
-- block between these two people" gets decided; everything below calls this
-- instead of querying public.blocks directly, so there's exactly one
-- definition of what "blocked" means.
create or replace function public.users_blocked(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = user_a and blocked_id = user_b)
       or (blocker_id = user_b and blocked_id = user_a)
  );
$$;

-- =====================================================================
-- 3. profiles.role — added and locked down in the same migration, unlike
-- profiles.points (Step 2), which only got its guard after the gap was found
-- live. There is no legitimate client path to change this at all yet — no
-- promotion mechanism exists — so this rejects every change unconditionally,
-- the most conservative possible starting point.
-- =====================================================================
alter table public.profiles
  add column role text not null default 'user' check (role in ('user', 'moderator', 'admin'));

create or replace function public.guard_profile_role_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'profiles.role cannot be modified directly.';
end;
$$;

create trigger guard_profile_role_update
  before update on public.profiles
  for each row
  when (old.role is distinct from new.role)
  execute function public.guard_profile_role_update();

-- =====================================================================
-- 4. Blocking takes effect: new conversations
-- =====================================================================
-- Same function, same normalization logic as before — one check added at the
-- top. Existing conversations (reached via the chat list, not this function)
-- are untouched here; they're still fully readable (see #6) and only new
-- MESSAGES within them are affected (#5).
create or replace function public.get_or_create_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv_id uuid;
  uid1 uuid := least(auth.uid(), other_user_id);
  uid2 uuid := greatest(auth.uid(), other_user_id);
begin
  if public.users_blocked(auth.uid(), other_user_id) then
    raise exception 'Unable to start a conversation with this user.';
  end if;

  select id into conv_id from public.conversations where user1_id = uid1 and user2_id = uid2;

  if conv_id is null then
    insert into public.conversations (user1_id, user2_id)
    values (uid1, uid2)
    returning id into conv_id;
  end if;

  return conv_id;
end;
$$;

-- =====================================================================
-- 5. Blocking takes effect: new messages in EXISTING conversations too
-- =====================================================================
-- Drop + recreate the one existing INSERT policy (not a second policy) — the
-- original two conditions (sender_id = self, must be a participant) are kept
-- byte-for-byte; only the "and not blocked" clause is new. Message history
-- itself is untouched — nothing here affects SELECT.
drop policy "Participants can send messages in their conversations" on public.messages;

create policy "Participants can send messages in their conversations"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
        and not public.users_blocked(c.user1_id, c.user2_id)
    )
  );

-- =====================================================================
-- 6. Blocking takes effect: notifications
-- =====================================================================
-- Same function as Step 6, same guard-flag protection, same self-notification
-- check — one more check added: skip (silently, like the self-check) if
-- either party has blocked the other. This single change covers all 7
-- notification types at once, since every trigger already routes through here.
create or replace function public.create_notification(
  p_user_id uuid,
  p_actor_id uuid,
  p_type text,
  p_post_id uuid,
  p_conversation_id uuid,
  p_achievement_id uuid,
  p_push_title text,
  p_push_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('newstep.allow_notification_create', true), 'off') <> 'on' then
    raise exception 'create_notification() cannot be called directly.';
  end if;

  if p_actor_id is not null and p_actor_id = p_user_id then
    return;
  end if;

  if p_actor_id is not null and public.users_blocked(p_user_id, p_actor_id) then
    return;
  end if;

  insert into public.notifications (user_id, actor_id, type, post_id, conversation_id, achievement_id)
  values (p_user_id, p_actor_id, p_type, p_post_id, p_conversation_id, p_achievement_id);

  perform public.send_push_notification(p_user_id, p_push_title, p_push_body, jsonb_build_object('type', p_type));
end;
$$;
