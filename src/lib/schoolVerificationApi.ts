import { File } from 'expo-file-system';
import { supabase, createThrowawayClient } from './supabase';
import { normalizeEmail, type SchoolVerification } from './schoolVerification';

// School verification calls (supabase/school_verification.sql).

export async function fetchMySchoolVerification(): Promise<SchoolVerification | null> {
  const { data, error } = await supabase.rpc('my_school_verification');
  if (error) throw error;
  return (data as SchoolVerification | null) ?? null;
}

// 'verified' when it's the school you're already verified at, else 'pending'.
export async function chooseSchool(schoolId: string): Promise<'verified' | 'pending'> {
  const { data, error } = await supabase.rpc('choose_school', { p_school: schoolId });
  if (error) throw error;
  return data as 'verified' | 'pending';
}

export async function emailMatchesMySchool(email: string, schoolId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('email_matches_school', { p_email: normalizeEmail(email), p_school: schoolId });
  if (error) throw error;
  return !!data;
}

// --- School email ----------------------------------------------------------
//
// Supabase Auth emails a one-time code to the school address. Signing in with
// it happens on a throwaway client (memory only), which then asks the server
// for a short-lived proof. The student's own session redeems the proof.

let throwaway: ReturnType<typeof createThrowawayClient> | null = null;

export async function sendSchoolEmailCode(email: string): Promise<void> {
  throwaway = createThrowawayClient();
  const { error } = await throwaway.auth.signInWithOtp({
    email: normalizeEmail(email),
    options: { shouldCreateUser: true, data: { purpose: 'school_email_check' } },
  });
  if (error) throw error;
}

export async function confirmSchoolEmailCode(email: string, code: string): Promise<void> {
  const client = throwaway ?? createThrowawayClient();
  const { error: otpError } = await client.auth.verifyOtp({ email: normalizeEmail(email), token: code, type: 'email' });
  if (otpError) throw otpError;
  try {
    const { data: proof, error: proofError } = await client.rpc('issue_school_email_proof');
    if (proofError) throw proofError;
    const { error } = await supabase.rpc('redeem_school_email_proof', { p_token: proof as string });
    if (error) throw error;
  } finally {
    // 'local': only this throwaway session. If the school email is the
    // student's own sign-in email, a global sign-out would log them out too.
    await client.auth.signOut({ scope: 'local' }).catch(() => {});
    throwaway = null;
  }
}

// --- Student ID photo --------------------------------------------------------

const BUCKET = 'student-ids';

export async function submitStudentId(userId: string, localUri: string, mimeType?: string | null): Promise<void> {
  const path = `${userId}/${Date.now()}.jpg`;
  const bytes = await new File(localUri).bytes();
  const { error: upError } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: mimeType ?? 'image/jpeg' });
  if (upError) throw upError;
  const { data: replaced, error } = await supabase.rpc('submit_student_id', { p_path: path });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw error;
  }
  // An earlier photo waiting for review was replaced: delete that file.
  if (replaced) await supabase.storage.from(BUCKET).remove([replaced as string]).catch(() => {});
}

export type StudentIdRequest = {
  id: string;
  user_id: string;
  full_name: string | null;
  username: string | null;
  school_name: string;
  photo_path: string;
  created_at: string;
};

export async function fetchStudentIdQueue(): Promise<StudentIdRequest[]> {
  const { data, error } = await supabase.rpc('school_id_queue');
  if (error) throw error;
  return (data ?? []) as StudentIdRequest[];
}

// Short-lived link for a moderator to look at the photo.
export async function studentIdPhotoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

// The photo is deleted as soon as it has been reviewed, approved or not.
export async function reviewStudentId(requestId: string, approve: boolean, note?: string): Promise<void> {
  const { data: path, error } = await supabase.rpc('review_student_id', { p_request: requestId, p_approve: approve, p_note: note ?? null });
  if (error) throw error;
  if (path) await supabase.storage.from(BUCKET).remove([path as string]).catch(() => {});
}

// --- Classmates vouch -------------------------------------------------------

export async function fetchMyVouchCode(): Promise<string> {
  const { data, error } = await supabase.rpc('my_vouch_code');
  if (error) throw error;
  return data as string;
}

export type VouchPreview = {
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  school_name: string;
  already_vouched: boolean;
};

export async function previewVouch(code: string): Promise<VouchPreview> {
  const { data, error } = await supabase.rpc('preview_vouch', { p_code: code });
  if (error) throw error;
  return data as VouchPreview;
}

// 'verified' when this vouch was the one that got them in.
export async function vouchForClassmate(code: string): Promise<'verified' | 'vouched'> {
  const { data, error } = await supabase.rpc('vouch_for_classmate', { p_code: code });
  if (error) throw error;
  return data as 'verified' | 'vouched';
}
