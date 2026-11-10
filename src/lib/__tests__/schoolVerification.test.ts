import { readFileSync } from 'fs';
import { join } from 'path';
import { cleanVouchCode, VOUCH_ALPHABET, VOUCH_CODE_LENGTH, vouchProgress, cleanCode, emailDomain, emailMatchesDomains, looksLikeEmail, verificationStage, type SchoolVerification } from '../schoolVerification';

describe('school email domains', () => {
  it('reads the domain, ignoring case and spaces', () => {
    expect(emailDomain('  Wooju.Kim@Student.MySchool.ORG ')).toBe('student.myschool.org');
    expect(emailDomain('not-an-email')).toBe('');
  });

  it('accepts the domain itself and its subdomains, nothing else', () => {
    const domains = ['myschool.org'];
    expect(emailMatchesDomains('a@myschool.org', domains)).toBe(true);
    expect(emailMatchesDomains('a@student.myschool.org', domains)).toBe(true);
    expect(emailMatchesDomains('a@fakemyschool.org', domains)).toBe(false);
    expect(emailMatchesDomains('a@myschool.org.evil.com', domains)).toBe(false);
    expect(emailMatchesDomains('a@gmail.com', domains)).toBe(false);
    expect(emailMatchesDomains('a@myschool.org', [])).toBe(false);
  });

  it('follows the same rule as email_matches_school() in the SQL', () => {
    const sql = readFileSync(join(__dirname, '../../../supabase/school_verification.sql'), 'utf8');
    expect(sql).toMatch(/= d\s+or lower\(split_part\(btrim\(p_email\), '@', 2\)\) like '%\.' \|\| d/);
  });

  it('checks the shape of an email before sending', () => {
    expect(looksLikeEmail('a@b.co')).toBe(true);
    expect(looksLikeEmail('a@b')).toBe(false);
    expect(looksLikeEmail('a b@c.d')).toBe(false);
  });
});

it('keeps only the digits of a typed code', () => {
  expect(cleanCode(' 12 34-56 ')).toBe('123456');
});

describe('verificationStage', () => {
  const base: SchoolVerification = { verified: false, method: null, pending_school_id: null, pending_school_name: null, pending_school_has_email: false, request: null };

  it('knows a verified student', () => {
    expect(verificationStage({ ...base, verified: true, method: 'email' })).toBe('verified');
  });

  it('asks a student with a picked school to verify', () => {
    expect(verificationStage({ ...base, pending_school_id: 's', pending_school_name: 'Sunny Hills High' })).toBe('needs_verifying');
  });

  it('shows a student ID waiting for review, or turned down', () => {
    const pending = { ...base, pending_school_id: 's', request: { status: 'pending' as const, note: null, created_at: '' } };
    expect(verificationStage(pending)).toBe('id_pending');
    expect(verificationStage({ ...pending, request: { ...pending.request, status: 'rejected' as const } })).toBe('id_rejected');
  });

  it('treats no profile or no school as no school', () => {
    expect(verificationStage(null)).toBe('no_school');
    expect(verificationStage(base)).toBe('no_school');
  });
});

describe('vouch codes', () => {
  it('use the same alphabet as my_vouch_code() in the SQL', () => {
    const sql = readFileSync(join(__dirname, '../../../supabase/school_vouches.sql'), 'utf8');
    expect(sql).toContain(`v_alphabet text := '${VOUCH_ALPHABET}'`);
    expect(sql).toContain(`generate_series(1, ${VOUCH_CODE_LENGTH})`);
  });

  it('never use lookalike characters', () => {
    for (const c of '0O1I') expect(VOUCH_ALPHABET).not.toContain(c);
  });

  it('cleans what a student types', () => {
    expect(cleanVouchCode(' ab-c 2d9x7 ')).toBe('ABC2D9');
    expect(cleanVouchCode('o0i1KQ')).toBe('KQ');
  });

  it('counts progress towards two vouches', () => {
    expect(vouchProgress(null)).toEqual({ have: 0, need: 2 });
    expect(vouchProgress({ verified: false, method: null, pending_school_id: 's', pending_school_name: null, pending_school_has_email: false, request: null, vouches: 1, vouches_needed: 2 })).toEqual({ have: 1, need: 2 });
  });
});
