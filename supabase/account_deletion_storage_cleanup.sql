-- Step 52 — Account Deletion Storage Cleanup.
--
-- Step 51's audit found that account deletion never removed the deleted
-- account's actual Storage files (avatar, story image, post photos) — only
-- the database rows referencing them. `post-photos` already has a DELETE
-- policy (posts_add_photos.sql) that `removePostPhotos()` already relies on
-- for normal post edit/delete; `avatars` and `stories` have never had one.
--
-- This migration adds EXACTLY the two missing DELETE policies, in the same
-- shape as every existing policy on these same buckets (own-folder check via
-- `(storage.foldername(name))[1] = auth.uid()::text` — see profile_schema.sql's
-- "Users can upload/update their own avatar" and stories_schema.sql's
-- equivalents). No SELECT/INSERT/UPDATE policy on any bucket is touched, so
-- public read access and normal avatar/story upload behavior are unchanged.
--
-- Idempotent: each policy is dropped first if it already exists, so running
-- this migration more than once is safe and doesn't error on a duplicate
-- policy name.
--
-- This file is NOT executed automatically — run it once, manually, in the
-- Supabase SQL Editor.

-- =====================================================================
-- 1. avatars — lets a signed-in user delete their own avatar object.
-- Needed both for account-deletion cleanup (accountStorage.ts) and as a
-- reasonable, narrowly-scoped capability on its own (previously: any account
-- that ever uploaded an avatar had NO way to remove it, ever, even though
-- upload/update were already allowed on the same folder).
-- =====================================================================
drop policy if exists "Users can delete their own avatar" on storage.objects;

create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- 2. stories — same shape, for the one fixed `${userId}/story.jpg` object
-- replace_story() (stories_schema.sql) always upserts to. Does not change
-- the 24-hour expiry lifecycle at all — expired stories still just sit
-- inert (filtered out by `expires_at > now()` in fetchActiveStories()/etc.)
-- until overwritten; this policy only ever matters when something explicitly
-- calls storage.objects delete for this bucket, which today is only the new
-- account-deletion cleanup path.
-- =====================================================================
drop policy if exists "Users can delete their own story image" on storage.objects;

create policy "Users can delete their own story image"
  on storage.objects for delete
  using (bucket_id = 'stories' and (storage.foldername(name))[1] = auth.uid()::text);
