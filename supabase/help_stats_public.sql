-- Public help-stat totals (counts only).
--
-- help_history is helper-only readable (see help_history_schema.sql), which
-- is right for the rows themselves — but it meant fetchHelpStats() silently
-- returned 0 whenever someone OTHER than the helper looked: the asker's
-- "Helped N students" line on a completed request, other students' profiles,
-- and the Community tab's per-contributor "Helped" count.
--
-- This exposes only the two aggregate numbers, never the rows (no student
-- ids, no post ids), via a SECURITY DEFINER function. The same totals are
-- already implied publicly by points/achievements, so nothing new leaks.
--
-- Safe to run more than once.

create or replace function public.get_help_stats(p_user_id uuid)
returns table (completed_count integer, students_helped integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*)::integer as completed_count,
    count(*) filter (where is_new_student)::integer as students_helped
  from public.help_history
  where helper_id = p_user_id;
$$;

revoke all on function public.get_help_stats(uuid) from public;
grant execute on function public.get_help_stats(uuid) to authenticated;
