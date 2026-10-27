// Signs the writer may be in danger. Used to show support lines first and,
// on the server, to flag a lantern for care.
//
// Must stay in step with public.sounds_like_crisis() (supabase/crisis_check_v2.sql):
// both lowercase the text, drop spaces and punctuation, then look for the same
// phrases. Dropping punctuation matters — phone keyboards type curly quotes
// ("don’t"), and people write "self-harm" or "self harm" interchangeably.
//
// Covered by src/lib/__tests__/crisis.test.ts.

const PHRASES = [
  // English
  'killmyself', 'wanttodie', 'wantedtodie', 'wannadie', 'endmylife', 'enditall', 'suicid',
  'selfharm', 'cutmyself', 'cuttingmyself', 'hurtmyself', 'noreasontolive', 'betteroffwithoutme',
  'dontwanttobehere', 'disappearforever',
  // Korean
  '죽고싶', '자살', '자해', '살기싫', '사라지고싶', '없어지고싶', '끝내고싶', '손목', '뛰어내리',
];

// Whitespace, apostrophes (straight and curly), hyphens, dots, underscores.
const IGNORED = /[\s'‘’`\-_.]+/g;

// "kms" is too short to match inside other words ("bookmarks"), so it only
// counts on its own. "5 kms away" still matches — showing support lines when
// they weren't needed is the safe mistake.
const KMS = /(^|[^a-z])kms([^a-z]|$)/;

export function normalizeForCrisis(text: string): string {
  return text.toLowerCase().replace(IGNORED, '');
}

export function soundsLikeCrisis(text: string): boolean {
  if (!text) return false;
  if (KMS.test(text.toLowerCase())) return true;
  const flat = normalizeForCrisis(text);
  return PHRASES.some((p) => flat.includes(p));
}
