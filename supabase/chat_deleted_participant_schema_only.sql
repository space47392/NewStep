-- Step 56A — Chat Deleted Participant: SCHEMA ONLY.
--
-- Split out of chat_deleted_participant_schema.sql (Step 56), which bundled
-- this with two RLS policy replacements. This file contains ONLY the column
-- nullability + FK behavior change — no RLS, no application code. The RLS
-- changes (messages UPDATE/INSERT policies) are deliberately deferred to a
-- later phase (56B+) and must NOT be run from this file.
--
-- What this does: changes conversations.user1_id/user2_id and
-- messages.sender_id from `not null ... on delete cascade` to
-- `nullable ... on delete set null`, so that when a participant deletes
-- their account, the conversation/messages row survives with that one
-- column set to NULL instead of the whole row (and, for a message's
-- conversation, every message in it) being cascade-deleted.
--
-- Data safety: this is a pure ALTER — no `delete`, `truncate`, or `update`
-- statement anywhere in this file, and no column is dropped or renamed.
-- Every existing conversations/messages row keeps every one of its current
-- values (including any already-set NOT NULL user1_id/user2_id/sender_id)
-- completely unchanged; only the RULE for what happens on a FUTURE profile
-- deletion changes. Running this does not touch, delete, or migrate any
-- existing row.
--
-- Idempotent: `alter column ... drop not null` is a no-op (no error) if the
-- column already allows nulls, and each FK is dropped with `if exists`
-- before being re-added, so re-running this file is safe.

-- =====================================================================
-- 1. conversations.user1_id / user2_id
--
-- different_users / ordered_users / unique_pair are NOT touched — verified
-- (Step 55/56 audit) that all three already tolerate a NULL participant
-- correctly under standard SQL NULL-comparison rules:
--   - `NULL <> x` and `NULL < x` evaluate to NULL, which a CHECK constraint
--     treats as satisfied (not violated).
--   - A UNIQUE constraint treats NULL as distinct from every other value,
--     including another NULL, so multiple rows each having one participant
--     already set null can coexist without ever violating unique_pair.
--
-- Constraint names below (conversations_user1_id_fkey / _user2_id_fkey) are
-- Postgres's standard auto-generated names for the inline `references`
-- clause in chat_schema.sql's original CREATE TABLE (no explicit CONSTRAINT
-- name was given there) — the same names src/lib/chat.ts's
-- fetchConversations() already references directly via PostgREST's embedded
-- relation syntax (`profiles!conversations_user1_id_fkey`), which confirms
-- these are the real, live names in this database today.
--
-- If a `drop constraint` line below errors because a name doesn't match,
-- STOP and run this first to find the actual name before proceeding:
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
-- 2. messages.sender_id
--
-- content / created_at / edited_at / deleted_at / reply_to_message_id /
-- conversation_id / read_at are all untouched by this file.
--
-- Same constraint-name reasoning as above — messages_sender_id_fkey is
-- Postgres's default auto-generated name for chat_schema.sql's inline
-- `references` on sender_id. If it doesn't match, find the real name with:
--   select conname from pg_constraint
--   where conrelid = 'public.messages'::regclass and contype = 'f';
-- =====================================================================
alter table public.messages alter column sender_id drop not null;

alter table public.messages drop constraint if exists messages_sender_id_fkey;
alter table public.messages
  add constraint messages_sender_id_fkey
  foreign key (sender_id) references public.profiles (id) on delete set null;

-- =====================================================================
-- Deliberately NOT included in this file (left for a later phase):
--   - The "Recipients can mark messages as read" RLS fix
--     (auth.uid() <> sender_id -> sender_id is distinct from auth.uid()).
--   - The "Participants can send messages in their conversations" RLS fix
--     (require both participants non-null for a new INSERT).
-- Until those are applied, existing RLS policies still reference
-- user1_id/user2_id/sender_id with `=`/`<>` comparisons that are NULL-
-- sensitive — see Step 56A's report for exactly what that does and does not
-- affect before those two policies are applied in a later phase.
-- =====================================================================
