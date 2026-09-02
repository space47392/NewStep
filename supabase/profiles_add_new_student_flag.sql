-- New Student Mode (Step 5) needs exactly one small, optional field. Nullable
-- tri-state rather than a plain boolean default false: null = hasn't answered
-- yet ("Do not force users to answer"), true = yes, false = "Not right now".
-- No RLS changes — the existing "Users can update their own profile" policy
-- already restricts writes to auth.uid() = id (same protection every other
-- profile field relies on), and the existing public SELECT policy already
-- covers reading it, same as grade/interests today.
alter table public.profiles
  add column is_new_student boolean;
