import { interpretSky } from '../skyInterpret';

const HEX = /^#[0-9a-f]{6}$/i;

describe('interpretSky', () => {
  it('ignores text that is not about the sky', () => {
    expect(interpretSky('I had pizza for lunch', 'day')).toBeNull();
  });

  it('paints a valid three-band palette from an English description', () => {
    const scene = interpretSky('a pink sunset with fluffy clouds', 'dusk');
    expect(scene).not.toBeNull();
    expect(scene!.colors).toHaveLength(3);
    scene!.colors.forEach((c) => expect(c).toMatch(HEX));
    expect(scene!.clouds).not.toBe('none');
  });

  it('understands Korean', () => {
    const scene = interpretSky('하늘이 맑고 달이 떴어', 'day');
    expect(scene).not.toBeNull();
    scene!.colors.forEach((c) => expect(c).toMatch(HEX));
  });

  it('gives the same scene for the same words', () => {
    const a = interpretSky('stars over a dark blue sky', 'night');
    const b = interpretSky('stars over a dark blue sky', 'night');
    expect(a).toEqual(b);
  });
});
