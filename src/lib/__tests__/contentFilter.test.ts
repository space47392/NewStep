import { hasBlockedWords, normalizeForFilter } from '../contentFilter';

describe('normalizeForFilter', () => {
  it('lowercases, undoes look-alikes and squashes repeats', () => {
    expect(normalizeForFilter('SH1TTT')).toBe('shit');
    expect(normalizeForFilter('f.u.c.k')).toBe('fuck');
  });

  it('can drop digits instead of reading them as letters', () => {
    expect(normalizeForFilter('병1신', false)).toBe('병신');
  });
});

describe('hasBlockedWords', () => {
  it.each(['fuck you', 'F U C K', 'sh1t', 'go kill yourself', 'kys', '시발', '시 발', 'ㅅㅂ', '병1신'])(
    'blocks %p',
    (text) => {
      expect(hasBlockedWords(text)).toBe(true);
    }
  );

  // Innocent words that contain a blocked word once normalised.
  it.each(['', 'I love this class', 'we studied together', "the sky's so pink", 'assignment due friday', '오늘 하늘 예쁘다'])(
    'allows %p',
    (text) => {
      expect(hasBlockedWords(text)).toBe(false);
    }
  );
});
