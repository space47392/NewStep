-- ⚠️ SUPERSEDED — DO NOT RUN THIS FILE. ⚠️
-- Split (Step 56A/56B) into:
--   supabase/chat_deleted_participant_schema_only.sql  (already applied)
--   supabase/chat_deleted_participant_rls_only.sql      (use this one for RLS)
--
-- Step 56B's verification found that the INSERT policy below was drafted
-- against an already-superseded shape of "Participants can send messages in
-- their conversations" (the version from message_replies_schema.sql, which
-- validated reply_to_message_id inline via a subquery against `messages`
-- itself). That shape was already replaced in production by
-- message_reply_target_fix.sql specifically BECAUSE that inline subquery
-- caused Postgres error 42P17 ("infinite recursion detected in policy for
-- relation messages") — a policy on table T cannot safely subquery T from
-- within its own WITH CHECK. Running the INSERT policy in section 4 below
-- would silently reintroduce that exact bug for every message send, not
-- just deleted-participant conversations. chat_deleted_participant_rls_only.sql
-- has the corrected version (built on the actual current policy shape,
-- reply validation left untouched in its own trigger). This file is kept
-- only as a historical record of the Step 56 design; nothing in it should
-- be executed.
--
-- Step 56 — Chat Deleted Participant Implementation (Step 55 approved policy).
--
-- Problem (Step 51/55): conversations.user1_id/user2_id and messages.sender_id
-- are all `on delete cascade`. When either participant deletes their account,
-- the WHOLE conversation — including every message the OTHER, still-active
-- participant ever sent — disappears with them.
--
-- Fix: make the participant/sender columns nullable with `on delete set null`
-- instead of cascade, so the conversation and its message history survive a
-- participant's account deletion; only that participant's identity is
-- removed (client renders "Deleted User" — see ChatScreen.tsx/
-- ConversationScreen.tsx). This affects future account deletions only —
-- conversations/messages already lost to the old cascade cannot be recovered.
--
-- This migration does NOT redesign the conversation model: still exactly two
-- participants per row, same table shapes, same constraint names. Every
-- statement below is safe to run more than once (drop-if-exists before each
-- add), and does not assume the database is empty.

-- =====================================================================
-- 1. conversations.user1_id / user2_id — nullable, ON DELETE SET NULL.
--
-- different_users / ordered_users / unique_pair are deliberately left
-- untouched below — verified (Step 55) that all three are already
-- null-safe:
--   - `NULL <> x` and `NULL < x` both evaluate to NULL, and a CHECK
--     constraint treats a NULL result as satisfied (not violated).
--   - A UNIQUE constraint treats NULL as distinct from every other value,
--     including another NULL — any number of rows with one participant
--     already set null can coexist without ever violating unique_pair.
-- No redesign of these three constraints is needed or performed.
--
-- Constraint names below (conversations_user1_id_fkey / _user2_id_fkey) are
-- Postgres's standard auto-generated names for an inline `references`
-- clause with no explicit CONSTRAINT name — exactly how chat_schema.sql
-- originally declared them, and the same names src/lib/chat.ts's
-- fetchConversations() already references directly in its PostgREST
-- embedded-relation select (`profiles!conversations_user1_id_fkey`), which
-- confirms these are the real, live names. If this migration errors on the
-- `drop constraint` lines because a name doesn't match, run this first to
-- find the actual name before proceeding:
--   select conname from pg_constraint
--   where conrelid = 'public.conversations'::regclass and contype = 'f';
-- =====================================================================
alter table public.conversations alter column user1_id drop not null;
alter table public.conversations alter column user2_id drop not null;

alter table public.conversations drop constraint if exists conversations_user1_id_fkey;
alter table public.conversations
  add constraint conversations_user1_id_fkey
  foreign key (user1_id) references public.profiles (id) on delete set null;

alter table public.conversations drop constraint if exists conversations_user2_id_fkey;
alter table public.conversations
  add constraint conversations_user2_id_fkey
  foreign key (user2_id) references public.profiles (id) on delete set null;

-- =====================================================================
-- 2. messages.sender_id — nullable, ON DELETE SET NULL. content/created_at/
-- edited_at/deleted_at/reply_to_message_id/conversation_id are all untouched.
-- Same constraint-name reasoning as above (messages_sender_id_fkey is the
-- Postgres default for messages_schema's inline `references` on sender_id).
-- If it doesn't match, find the real name with:
--   select conname from pg_constraint
--   where conrelid = 'public.messages'::regclass and contype = 'f';
-- =====================================================================
alter table public.messages alter column sender_id drop not null;

alter table public.messages drop constraint if exists messages_sender_id_fkey;
alter table public.messages
  add constraint messages_sender_id_fkey
  foreign key (sender_id) references public.profiles (id) on delete set null;

-- =====================================================================
-- 3. RLS fix #1 — "Recipients can mark messages as read" (messages UPDATE).
--
-- The existing condition `auth.uid() <> sender_id` evaluates to NULL (not
-- true) the moment sender_id becomes NULL, and RLS's USING clause treats a
-- NULL result as "denied" — meaning nobody, including the surviving
-- participant, could ever mark a deleted sender's old message as read.
-- `IS DISTINCT FROM` always yields a real true/false even when one side is
-- NULL, closing exactly that gap and nothing else — every other condition on
-- this policy is unchanged.
-- =====================================================================
drop policy if exists "Recipients can mark messages as read" on public.messages;

create policy "Recipients can mark messages as read"
  on public.messages for update
  using (
    sender_id is distinct from auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
  )
  with check (sender_id is distinct from auth.uid());

-- =====================================================================
-- 4. RLS fix #2 — "Participants can send messages in their conversations"
-- (messages INSERT). This is the actual security boundary for "a remaining
-- participant cannot send a NEW message once the conversation is
-- historical-only" — not just a UI restriction, so it also blocks a direct
-- REST/RPC call that bypasses the app entirely.
--
-- Same policy shape as before — sender check, participant check, and the
-- existing reply-target check (message_replies_schema.sql) are all preserved
-- byte-for-byte — with exactly one new condition: both of the conversation's
-- participant columns must still be non-null. A conversation with either
-- side already null is a preserved historical record only; no new message,
-- from either side, can ever be inserted into it again.
-- =====================================================================
drop policy if exists "Participants can send messages in their conversations" on public.messages;

create policy "Participants can send messages in their conversations"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.user1_id is not null
        and c.user2_id is not null
        and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
    )
    and (
      reply_to_message_id is null
      or exists (
        select 1 from public.messages m
        where m.id = reply_to_message_id and m.conversation_id = conversation_id
      )
    )
  );

-- =====================================================================
-- Explicitly verified and left UNCHANGED (no fix needed):
--
--   - "Participants can view their conversations" (conversations SELECT)
--     and "Participants can view messages in their conversations" (messages
--     SELECT) — both use `c.user1_id = auth.uid() or c.user2_id = auth.uid()`.
--     A live session's own auth.uid() always matches its own (never-null)
--     column regardless of what the OTHER column holds, so a random
--     unrelated user still cannot read a preserved conversation, and the
--     surviving participant still can.
--
--   - guard_message_not_blocked() (users_blocked_security_fix.sql) —
--     users_blocked(x, NULL) safely evaluates to false; a deleted party
--     can't meaningfully be "blocked" since they can never insert anything
--     regardless (no valid session), so this degrades to a harmless no-op.
--
--   - get_or_create_conversation() — inserting a deleted user's old id into
--     user1_id/user2_id already fails on the FK constraint itself (that id
--     no longer exists in public.profiles), so a deleted user's identity can
--     never be reused to create a brand-new conversation. No code change
--     needed here.
--
--   - notifications.conversation_id (on delete cascade) / actor_id (on
--     delete set null, notifications_schema.sql) — conversations are no
--     longer deleted by this scenario at all, so the cascade on
--     conversation_id simply never fires for it anymore; actor_id's
--     existing set-null path, plus Step 52B's guard_notification_update()
--     bypass, already handles a deleted actor generically — message
--     notifications included. No notification schema change needed.
-- =====================================================================
