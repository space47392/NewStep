// A light word filter for School Sky text classmates see — anonymous
// wishes above all, plus a star's line and sky description. It catches
// common English and Korean insults, slurs and self-harm taunts, including
// the usual dodges (spaces, symbols, repeated letters, 1→i / 0→o). The
// database runs the same check (supabase/school_sky_safety.sql), so a
// modified app can't skip it.
//
// Matching is on normalised text, so keep entries specific: short or common
// words ("ass", "die") would also match innocent words ("class", "studied").

const BLOCKED: string[] = [
  // English
  'fuck', 'fuk', 'shit', 'bitch', 'bastard', 'asshole', 'dickhead', 'pussy', 'cunt',
  'slut', 'whore', 'faggot', 'retard', 'nigger', 'nigga', 'motherfucker', 'wanker',
  'killyourself', 'godie', 'gokillyourself', 'nobodylikesyou', 'everyonehatesyou',
  // Korean
  '시발', '씨발', '씨바', '시바', 'ㅅㅂ', 'ㅆㅂ', '쓰발',
  '병신', '븅신', 'ㅂㅅ', '좆', '존나', 'ㅈㄴ', '개새끼', '개새', '새끼야', '씹',
  '지랄', 'ㅈㄹ', '미친놈', '미친년', '꺼져', '닥쳐', '엿먹어', '느금마', '니애미', '애미',
  '느그엄마', '섹스', '야동', '자살해', '죽어라', '죽여버', '뒤져', '뒈져', '찐따', '걸레',
  '창녀', '틀딱', '애자',
];

// Short abbreviations only count as whole words ("sky's" isn't "kys").
const BLOCKED_WHOLE_WORDS = /(^|[^a-z'])(k\s*y\s*s|k\s*m\s*s|stfu)([^a-z']|$)/i;

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

// Lowercase, undo look-alike symbols (or drop them), keep only letters
// (Latin + Hangul, including bare consonants like ㅅㅂ), squash repeats.
export function normalizeForFilter(text: string, leet = true): string {
  return text
    .toLowerCase()
    .replace(/[0134578@$]/g, (c) => (leet ? LEET[c] ?? c : ''))
    .replace(/[^a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, '')
    .replace(/(.)\1+/g, '$1');
}

const BLOCKED_NORMALIZED = BLOCKED.map((w) => normalizeForFilter(w));

export function hasBlockedWords(text: string): boolean {
  if (!text) return false;
  if (BLOCKED_WHOLE_WORDS.test(text)) return true;
  // Once reading 1→i / 0→o ("sh1t"), once dropping them ("병1신").
  const variants = [normalizeForFilter(text, true), normalizeForFilter(text, false)];
  return variants.some((n) => BLOCKED_NORMALIZED.some((w) => w && n.includes(w)));
}

export const KIND_WORDS_MESSAGE = "Let's keep it kind 💛 Try saying it a different way.";
