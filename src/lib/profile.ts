import { supabase } from './supabase';
import { Profile } from '../types';

// Safe, explicit column list for any profile read that isn't strictly "my
// own row, fully under my own control" — this is what fetchProfileById()
// selects (used for BOTH other users' profiles and the current user's own,
// across many screens), and what ProfileScreen/EditProfileScreen's own
// self-reads use too, for consistency. Deliberately excludes:
//   - expo_push_token: usable directly against Expo's public push API with
//     no other credential — must never be readable by any client but the
//     Postgres functions that already send pushes server-side.
//   - role: would let anyone enumerate moderators/admins.
// There is no email or other private column on this table to begin with.
// See Step 29's audit — profiles' RLS SELECT policy is public (posts_schema.sql's
// "Profiles are viewable by everyone"), so `select('*')` was the actual leak,
// not RLS; this list is the fix, not an RLS change.
export const PUBLIC_PROFILE_FIELDS =
  'id, username, full_name, school_name, school_id, grade, interests, avatar_url, points, thanks_received_count, is_new_student';

export type PublicProfile = Pick<
  Profile,
  | 'id'
  | 'username'
  | 'full_name'
  | 'school_name'
  | 'school_id'
  | 'grade'
  | 'interests'
  | 'avatar_url'
  | 'points'
  | 'thanks_received_count'
  | 'is_new_student'
>;

export async function fetchProfileById(userId: string): Promise<PublicProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_PROFILE_FIELDS)
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data as unknown as PublicProfile;
}

// A narrower single-column write than EditProfileScreen's full-profile
// upsert — used only by the onboarding "Choose Interests" step (Step 25),
// which touches nothing else about the profile. Same column, same RLS.
export async function setMyInterests(userId: string, interests: string[]): Promise<void> {
  const { error } = await supabase.from('profiles').update({ interests }).eq('id', userId);
  if (error) throw error;
}

// Same narrow-write shape as setMyInterests(), for the onboarding "Are you
// new to this school?" step (Step 29 fix). Same column, same RLS, same
// meaning as EditProfileScreen's existing New Student Mode toggle — this is
// just an earlier, dedicated place to answer it once, not a new field or a
// second New Student Mode implementation.
export async function setIsNewStudent(userId: string, isNewStudent: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ is_new_student: isNewStudent }).eq('id', userId);
  if (error) throw error;
}
