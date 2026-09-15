-- Step 56B — Chat Deleted Participant: RLS ONLY.
--
-- Companion to chat_deleted_participant_schema_only.sql (Step 56A, already
-- applied). Contains ONLY the two RLS policy replacements needed now that
-- conversations.user1_id/user2_id and messages.sender_id can be NULL — no
-- schema/column changes, no UI, no application code.
--
-- IMPORTANT CORRECTION vs. the original (superseded) chat_deleted_participant_
-- schema.sql: that file's INSERT policy was built on an already-replaced
-- shape of "Participants can send messages in their conversations" — the
-- version from message_replies_schema.sql, which validated
-- reply_to_message_id with a subquery against `messages` INSIDE the policy's
-- own WITH CHECK. That exact shape was already found to cause Postgres error
-- 42P17 ("infinite recursion detected in policy for relation messages") and
-- was replaced by message_reply_target_fix.sql, which moved reply
-- validation into a separate BEFORE INSERT trigger
-- (guard_message_reply_target) instead. The policy below is built on THAT
-- current, correct shape — reply validation is left completely alone in its
-- own trigger, not touched by this file at all.
--
-- Idempotent: each policy is dropped (if it exists) immediately before being
-- recreated, so this is safe to run more than once.

-- =====================================================================
-- 1. "Recipients can mark messages as read" (messages UPDATE).
--
-- Current live condition: `auth.uid() <> sender_id`. Once sender_id is NULL
-- (Step 56A), `auth.uid() <> NULL` evaluates to NULL, and RLS's USING clause
-- treats a NULL result as "denied" — meaning nobody, including the
-- surviving participant, could mark a deleted sender's old message as read.
-- `IS DISTINCT FROM` always yields a real true/false even when one side is
-- NULL, closing exactly that gap. The conversation-participant check
-- (exists (...)) is unchanged.
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
-- 2. "Participants can send messages in their conversations" (messages
-- INSERT) — rebuilt from the CURRENT live shape (message_reply_target_fix.sql):
--   with check (
--     auth.uid() = sender_id
--     and exists (
--       select 1 from public.conversations c
--       where c.id = conversation_id and (c.user1_id = auth.uid() or c.user2_id = auth.uid())
--     )
--   );
-- reply_to_message_id validation is NOT part of this policy — it already
-- lives in the separate guard_message_reply_target() BEFORE INSERT trigger
-- and is untouched by this migration.
--
-- The one new condition added: `c.user1_id is not null and c.user2_id is not
-- null`. A conversation with either participant already null is a preserved
-- historical record only — this is the actual security boundary for "no new
-- message can be inserted once the conversation is historical-only" (blocks
-- a direct REST/RPC call too, not just the UI).
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
  );

-- =====================================================================
-- Explicitly verified and left UNCHANGED — no fix needed:
--   - "Participants can view their conversations" (conversations SELECT)
--     and "Participants can view messages in their conversations" (messages
--     SELECT), both still exactly as chat_schema.sql defined them (never
--     redefined by any later file). Both use
--     `c.user1_id = auth.uid() or c.user2_id = auth.uid()` — a live
--     session's own auth.uid() always matches its own (never-null) column
--     regardless of what the OTHER column holds, so an unrelated user still
--     cannot read a preserved conversation, and the surviving participant
--     still can.
--   - guard_message_reply_target() (message_reply_target_fix.sql) — reply
--     validation trigger, untouched.
--   - guard_message_not_blocked() (users_blocked_security_fix.sql) —
--     users_blocked(x, NULL) safely evaluates to false; untouched.
--   - edit_message() / delete_message() (messages_edit_delete.sql) — both
--     SECURITY DEFINER RPCs keyed on `sender_id = auth.uid()`, unaffected by
--     either policy change above; untouched.
--   - get_or_create_conversation() — untouched; a deleted user's old id
--     already can't be reused (FK violation), independent of RLS.
-- =====================================================================
