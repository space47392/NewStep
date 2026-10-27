import { File } from 'expo-file-system';
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
//
// school:school_id ( name ) — same embedded relation POST_SELECT/
// PERSON_SEARCH_FIELDS already join (Step 49, P1 #1). Without it, every
// reader of PublicProfile (UserProfileScreen in particular) could only see
// the raw school_name column, which setMySchool() never writes — a
// directory-based profile (school_id set, school_name left NULL) showed no
// school at all. Always resolve display names via resolveSchoolName()
// (lib/schools.ts), never school_name directly.
export const PUBLIC_PROFILE_FIELDS =
  'id, username, full_name, school_name, school_id, school:school_id ( name ), grade, interests, avatar_url, points, thanks_received_count, is_new_student';

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
> & {
  // Optional, not just nullable — same convention as PersonSearchResult
  // (types/index.ts): most PUBLIC_PROFILE_FIELDS readers now select it, but
  // the type itself doesn't force every future caller to.
  school?: { name: string } | null;
};

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

// My own row for the edit form. null when the row doesn't exist yet
// (a brand-new account) rather than an error.
export async function fetchMyProfile(userId: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_PROFILE_FIELDS)
    .eq('id', userId)
    .maybeSingle<PublicProfile>();
  if (error) throw error;
  return data;
}

export async function fetchMySchoolId(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('profiles').select('school_id').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data?.school_id ?? null;
}

// Uploads to the fixed path avatars/{userId}/avatar.jpg (overwriting the old
// one) and returns its public URL. The path never changes, so the URL gets a
// version suffix — otherwise every screen keeps showing the cached old photo.
export async function uploadAvatar(userId: string, photo: { uri: string; mimeType?: string | null }): Promise<string> {
  const path = `${userId}/avatar.jpg`;
  const bytes = await new File(photo.uri).bytes();
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, bytes, { contentType: photo.mimeType ?? 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export type ProfileEdits = {
  full_name: string;
  grade: string;
  interests: string[];
  avatar_url: string | null;
  is_new_student: boolean | null;
};

export async function saveMyProfile(userId: string, edits: ProfileEdits): Promise<void> {
  const { error } = await supabase.from('profiles').upsert({ id: userId, ...edits, updated_at: new Date().toISOString() });
  if (error) throw error;
}
