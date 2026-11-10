// School verification (supabase/school_verification.sql). Pure and unit
// tested; the database calls are in schoolVerificationApi.ts.

export type SchoolIdRequest = { status: 'pending' | 'approved' | 'rejected'; note: string | null; created_at: string };

export type SchoolVerification = {
  verified: boolean;
  method: 'email' | 'student_id' | 'grandfathered' | 'vouch' | null;
  pending_school_id: string | null;
  pending_school_name: string | null;
  // Whether we know this school's email domain (so the email route works).
  pending_school_has_email: boolean;
  // Classmates who confirmed so far, and how many it takes.
  vouches?: number;
  vouches_needed?: number;
  request: SchoolIdRequest | null;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string): string {
  const at = normalizeEmail(email).split('@');
  return at.length === 2 ? at[1] : '';
}

export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Same rule as email_matches_school(): the domain itself or a subdomain of it.
export function emailMatchesDomains(email: string, domains: string[]): boolean {
  const d = emailDomain(email);
  if (!d) return false;
  return domains.some((x) => {
    const dom = x.trim().toLowerCase();
    return d === dom || d.endsWith('.' + dom);
  });
}

// Codes from Supabase Auth are 6 digits by default (up to 10 if configured).
export function cleanCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, 10);
}

export type VerificationStage = 'verified' | 'no_school' | 'needs_verifying' | 'id_pending' | 'id_rejected';

export function verificationStage(v: SchoolVerification | null): VerificationStage {
  if (!v) return 'no_school';
  if (v.verified && !v.pending_school_id) return 'verified';
  if (!v.pending_school_id) return v.verified ? 'verified' : 'no_school';
  if (v.request?.status === 'pending') return 'id_pending';
  if (v.request?.status === 'rejected') return 'id_rejected';
  return 'needs_verifying';
}

// Vouch codes (school_vouches.sql): no 0/O or 1/I, so they're easy to read out.
export const VOUCH_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const VOUCH_CODE_LENGTH = 6;

// Uppercases and keeps only characters a code can have (spaces, dashes and
// the lookalikes 0/O/1/I are dropped).
export function cleanVouchCode(input: string): string {
  return input
    .toUpperCase()
    .split('')
    .filter((c) => VOUCH_ALPHABET.includes(c))
    .join('')
    .slice(0, VOUCH_CODE_LENGTH);
}

export function vouchProgress(v: SchoolVerification | null): { have: number; need: number } {
  return { have: v?.vouches ?? 0, need: v?.vouches_needed ?? 2 };
}
