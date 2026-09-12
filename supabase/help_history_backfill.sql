-- Step 54 — ONE-TIME backfill of help_history for Help posts that were
-- already completed before help_history_schema.sql existed.
--
-- Run this AFTER help_history_schema.sql (it needs both the table and its
-- unique `post_id` index to already exist).
--
-- KNOWN LIMITATION — completed_at accuracy: `posts` has no `updated_at`/
-- `completed_at` column, so there is no record of WHEN a post's status
-- actually changed to 'completed'. This backfill uses `posts.created_at`
-- (when the post was ORIGINALLY WRITTEN, not when it was completed) as the
-- best available stand-in, for both the `completed_at` value it writes and
-- for ordering `is_new_student` below. For any helper/student pair with
-- more than one historical completion, this means the row marked
-- `is_new_student = true` is the one whose ORIGINAL POST is oldest, not
-- necessarily the one that was COMPLETED first — these can differ if a
-- student's earlier-written post happened to be completed later than a
-- later-written one. This is a one-time approximation limited to
-- pre-existing data; every completion recorded from now on (via
-- handle_post_completed()) gets its real completion moment and an
-- `is_new_student` value that is never subject to this ambiguity.
--
-- Idempotent: relies on help_history_post_unique_idx (post_id where post_id
-- is not null) via `on conflict ... do nothing` — re-running this after
-- some rows already exist inserts nothing new for posts already backfilled.
-- Does not modify or delete any row in `posts`.

insert into public.help_history (helper_id, student_id, post_id, is_new_student, completed_at)
select
  p.helper_id,
  p.author_id,
  p.id,
  row_number() over (
    partition by p.helper_id, p.author_id
    order by p.created_at, p.id
  ) = 1,
  p.created_at
from public.posts p
where p.status = 'completed'
  and p.helper_id is not null
on conflict (post_id) where post_id is not null do nothing;
