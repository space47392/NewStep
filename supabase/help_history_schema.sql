-- Step 54 — Historical Help Tracking (approved Step 53 design, Option 2).
--
-- Fixes the root cause found in Step 51/53: fetchHelpStats() (points.ts) and
-- award_achievements()'s 'help_completed' threshold both re-count the LIVE
-- `posts` table every time, so a helper's "Helped Students"/completed-count
-- can retroactively shrink whenever a post they completed disappears —
-- specifically, whenever the post's AUTHOR (the student, not the helper)
-- later deletes their account (posts.author_id is `on delete cascade`).
--
-- This migration adds ONE new table (a dedicated, append-only historical
-- record — kept separate from points_history, which is a points *ledger*,
-- not a relationship record) and updates handle_post_completed() to write to
-- it going forward. The ONE-TIME backfill of already-completed posts lives in
-- its own separate file (help_history_backfill.sql) — run this file first,
-- then that one.
--
-- Both CREATE OR REPLACE FUNCTION blocks here are safe to run more than
-- once; the table/index/policy statements use IF NOT EXISTS / DROP IF EXISTS
-- guards so this whole file is safe to re-run too.

-- =====================================================================
-- 1. help_history — one immutable row per completed Help request.
-- =====================================================================
create table if not exists public.help_history (
  id uuid primary key default gen_random_uuid(),
  helper_id uuid not null references public.profiles (id) on delete cascade,
  -- Deliberately `on delete set null`, not cascade — this row exists to
  -- power the HELPER's own historical stats (completedCount/studentsHelped),
  -- so it must survive the student's account being deleted. See
  -- account_deletion_schema.sql's cascade table for the equivalent choice
  -- already made for posts.helper_id/points_history.post_id.
  student_id uuid references public.profiles (id) on delete set null,
  -- Also set null (not cascade) — a completed Help post can be individually
  -- deleted later independent of any account deletion; the historical
  -- record of the completion itself should still survive that too, exactly
  -- like points_history.post_id already does.
  post_id uuid references public.posts (id) on delete set null,
  -- Computed ONCE, at completion time, in handle_post_completed() below —
  -- true iff this helper had never before completed a Help request for this
  -- exact student_id. Never recomputed afterward: this is what keeps
  -- studentsHelped mathematically stable even after student_id above is
  -- later set null by an account deletion. See Step 53's design report for
  -- why a live "count distinct student_id" recheck would (wrongly) let a
  -- single deleted student's several completions start counting as several
  -- distinct students instead of the one they always were.
  is_new_student boolean not null,
  completed_at timestamptz not null default now()
);

create index if not exists help_history_helper_id_idx on public.help_history (helper_id);

-- Mirrors points_history's existing "(post_id, reason) where post_id is not
-- null" idiom — guards against handle_post_completed() ever inserting two
-- rows for the same post (defense in depth; the trigger's own
-- `old.status <> 'completed'` guard already makes this practically
-- unreachable) and is also what makes the Step 54 backfill safely
-- re-runnable (see help_history_backfill.sql).
create unique index if not exists help_history_post_unique_idx
  on public.help_history (post_id) where post_id is not null;

alter table public.help_history enable row level security;

-- Helper-only read — there is no "students I was helped by" screen in the
-- product today, so no student-side SELECT policy is added; one could be
-- added later with no schema change if that feature is ever built.
drop policy if exists "Helper can view their own help history" on public.help_history;
create policy "Helper can view their own help history"
  on public.help_history for select
  using (auth.uid() = helper_id);

-- No INSERT/UPDATE/DELETE policy for any client role, on purpose — exactly
-- like points_history. The only legitimate writer is handle_post_completed()
-- below (SECURITY DEFINER), so a client can never fabricate, edit, backdate,
-- or delete a help_history row.

-- =====================================================================
-- 2. handle_post_completed() — same trigger, same firing condition
-- (`new.status = 'completed' and old.status <> 'completed' and
-- new.helper_id is not null`), same existing points/points_history/
-- notification behavior byte-for-byte. Two changes only:
--   a) one new help_history insert, right after the existing points_history
--      insert;
--   b) the achievement-threshold count award_achievements() reads now comes
--      from help_history instead of a live COUNT(*) over posts — the same
--      bug class Step 53 flagged for fetchHelpStats() also affected this
--      count, just less visibly (a helper's badge could be awarded a
--      completion "late" if an earlier completed post of theirs had already
--      been deleted by the time a later one pushed them over a threshold).
--      This does NOT retroactively re-evaluate any past award — only future
--      completions read from the corrected source, per Step 54's scope.
-- =====================================================================
create or replace function public.handle_post_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_new_student boolean;
begin
  if new.status = 'completed' and old.status <> 'completed' and new.helper_id is not null then
    perform set_config('newstep.allow_points_change', 'on', true);
    update public.profiles
    set points = points + 1
    where id = new.helper_id;

    insert into public.points_history (user_id, amount, reason, post_id)
    values (new.helper_id, 1, 'help_completed', new.id)
    on conflict (post_id, reason) where post_id is not null do nothing;

    -- Computed BEFORE inserting the new row below, or it would always see
    -- itself and never be true.
    v_is_new_student := not exists (
      select 1 from public.help_history
      where helper_id = new.helper_id and student_id = new.author_id
    );

    insert into public.help_history (helper_id, student_id, post_id, is_new_student)
    values (new.helper_id, new.author_id, new.id, v_is_new_student)
    on conflict (post_id) where post_id is not null do nothing;

    perform set_config('newstep.allow_achievement_award', 'on', true);
    perform public.award_achievements(
      new.helper_id,
      'help_completed',
      (select count(*) from public.help_history where helper_id = new.helper_id)
    );

    perform set_config('newstep.allow_notification_create', 'on', true);
    perform public.create_notification(
      new.helper_id, null, 'help_completed', new.id, null, null,
      'Nice work!', 'The request you helped with was marked as completed'
    );
    perform set_config('newstep.allow_notification_create', 'on', true);
    perform public.create_notification(
      new.helper_id, null, 'points_earned', null, null, null,
      'Community Point earned', 'You earned 1 Community Point'
    );
  end if;
  return new;
end;
$$;
