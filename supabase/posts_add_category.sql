-- Adds a category to each post. Existing rows (if any) are backfilled with the default.
alter table public.posts
  add column category text not null default 'Looking for Friends'
  check (category in ('Need Help', 'School Question', 'Looking for Friends'));
