-- School Community (Step 4) needs no new tables or RLS changes — profiles and
-- posts are both already fully public-read, and profiles' existing "own row
-- only" UPDATE policy already prevents anyone from editing someone else's
-- school_name. This is the one purely-additive change: an index to keep the
-- student-count / member-list / posts-by-school queries fast as the table
-- grows, instead of full scans. Partial (WHERE school_name IS NOT NULL) since
-- accounts that haven't set a school are never filtered on it.
create index if not exists profiles_school_name_idx
  on public.profiles (school_name)
  where school_name is not null;
