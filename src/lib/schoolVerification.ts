// School verification (supabase/school_verification.sql). Pure and unit
// tested; the database calls are in schoolVerificationApi.ts.

export type SchoolIdRequest = { status: 'pending' | 'approved' | 'rejected'; note: string | null; created_at: string };

export type SchoolVerification = {
  verified: boolean;
  method: 'email' | 'student_id' | 'grandfathered' | null;
  pending_school_id: string | null;
  pending_school_name: string | null;
  // Whether we know this school's email domain (so the email route works).
  pending_school_has_email: boolean;
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
