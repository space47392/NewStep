import { SkyClouds, SkyScene, SkyThing } from './sky';
import { SkyPalette } from './skyColors';

// Reads a student's description of the sky ("pink sunset, clouds like
// cotton candy", "하늘이 맑고 달이 떴어") on the phone itself — no AI, no
// cost — and turns it into the same painting instructions the AI version
// (supabase/functions/describe-sky) returns. English and Korean.

type Phase = 'dawn' | 'day' | 'dusk' | 'night';

// Each colour word paints the sky top → horizon.
const COLOR_WORDS: { words: string[]; name: string; palette: SkyPalette }[] = [
  { name: 'Pink', words: ['pink', 'rose', 'cotton candy', '분홍', '핑크', '솜사탕', '장미'], palette: ['#5b4a9e', '#d97aa6', '#ffc2cf'] },
  { name: 'Golden', words: ['gold', 'golden', 'yellow', '노랑', '노란', '황금', '금빛'], palette: ['#3d4f9e', '#e8a25a', '#ffe08a'] },
  { name: 'Orange', words: ['orange', 'peach', 'fire', '주황', '오렌지', '복숭아', '불타'], palette: ['#3b3586', '#e9785f', '#ffc177'] },
  { name: 'Red', words: ['red', 'crimson', '빨강', '빨간', '붉'], palette: ['#2d2a6e', '#c4475b', '#ff9a7a'] },
  { name: 'Purple', words: ['purple', 'violet', 'lavender', 'lilac', '보라', '라벤더', '자주'], palette: ['#2a2470', '#7b5bb8', '#d9a5d6'] },
  { name: 'Blue', words: ['blue', 'clear', 'bright', 'sunny', '파랑', '파란', '푸른', '하늘색', '맑', '화창'], palette: ['#1f5fc4', '#4f92dd', '#bfe0fa'] },
  { name: 'Grey', words: ['grey', 'gray', 'gloomy', 'dull', '회색', '잿빛', '우중충', '흐릿'], palette: ['#4b5470', '#7d8599', '#b9bdc8'] },
  { name: 'Dark', words: ['dark', 'black', 'pitch', '깜깜', '어두', '검은', '까만', '캄캄'], palette: ['#03061a', '#0c1640', '#24305e'] },
  { name: 'Navy', words: ['navy', 'deep blue', 'indigo', '남색', '군청', '짙은 파랑'], palette: ['#0a1238', '#1e2d6b', '#4a5590'] },
  { name: 'Green', words: ['green', 'aurora', '초록', '녹색', '오로라'], palette: ['#0b1f3a', '#1f6f6a', '#7ee6be'] },
];

const PHASE_WORDS: { phase: Phase; words: string[] }[] = [
  { phase: 'dusk', words: ['sunset', 'dusk', 'evening', 'twilight', '노을', '석양', '저녁', '해질'] },
  { phase: 'dawn', words: ['sunrise', 'dawn', 'morning', '일출', '새벽', '아침', '해돋이'] },
  { phase: 'night', words: ['night', 'midnight', '밤', '한밤', '자정'] },
  { phase: 'day', words: ['noon', 'afternoon', 'daytime', '낮', '오후', '점심'] },
];

const PHASE_PALETTE: Record<Phase, SkyPalette> = {
  dawn: ['#4f5aa6', '#c69ac6', '#ffdcc0'],
  day: ['#2a6fd0', '#5c9ae2', '#cfe7fb'],
  dusk: ['#2a2f86', '#c9627e', '#ffc58a'],
  night: ['#050a26', '#14215a', '#3a3f72'],
};

// Order matters: longer / more specific phrases first so "비행기" isn't
// read as "비" (rain) and "별똥별" isn't read as just "별" (stars).
const THING_WORDS: { thing: SkyThing; words: string[] }[] = [
  { thing: 'shooting_star', words: ['shooting star', 'meteor', '별똥별', '유성'] },
  { thing: 'airplane', words: ['airplane', 'plane', 'jet', '비행기'] },
  { thing: 'rainbow', words: ['rainbow', '무지개'] },
  { thing: 'lightning', words: ['lightning', 'thunder', 'storm', '번개', '천둥', '폭풍'] },
  { thing: 'moon', words: ['moon', 'crescent', '달', '보름', '초승달'] },
  { thing: 'sun', words: ['sun', 'sunny', '햇빛', '햇살', '태양', '해가', '해 '] },
  { thing: 'stars', words: ['star', '별'] },
  { thing: 'rain', words: ['rain', 'drizzle', 'shower', '비가', '비 ', '빗', '소나기', '이슬비'] },
  { thing: 'snow', words: ['snow', '눈이', '눈 ', '눈발', '함박눈'] },
  { thing: 'birds', words: ['bird', 'seagull', 'crow', '새가', '새들', '새 ', '갈매기', '까마귀', '비둘기'] },
  { thing: 'fog', words: ['fog', 'mist', 'haze', 'hazy', '안개', '뿌연'] },
];

const CLOUD_WORDS: { clouds: SkyClouds; words: string[] }[] = [
  { clouds: 'none', words: ['no cloud', 'cloudless', 'clear', '구름 없', '구름없', '구름 한 점', '맑'] },
  { clouds: 'overcast', words: ['overcast', 'cloudy', 'covered', 'gloomy', '흐림', '흐려', '흐리', '잔뜩', '먹구름', '우중충'] },
  { clouds: 'few', words: ['few cloud', 'a cloud', 'little cloud', '구름 조금', '구름이 조금', '몇 개', '한두'] },
  { clouds: 'scattered', words: ['cloud', 'cotton', 'fluffy', '구름', '뭉게', '솜'] },
];

// The text has to be about the sky at all.
const SKY_HINTS = [
  'sky', 'cloud', 'sun', 'moon', 'star', 'rain', 'snow', 'sunset', 'sunrise', 'blue', 'pink', 'orange', 'purple',
  'grey', 'gray', 'dark', 'bright', 'clear', 'fog', 'rainbow', 'bird', 'plane', 'light', 'night', 'storm',
  '하늘', '구름', '해', '달', '별', '비', '눈', '노을', '맑', '흐', '파랗', '파란', '분홍', '보라', '주황', '깜깜',
  '어두', '밝', '무지개', '새', '비행기', '안개', '밤', '빛',
];

const mixHex = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

const includesAny = (text: string, words: string[]) => words.some((w) => text.includes(w));

export function interpretSky(raw: string, timeOfDay: Phase): SkyScene | null {
  const text = ` ${raw.toLowerCase().replace(/\s+/g, ' ')} `;
  if (!includesAny(text, SKY_HINTS)) return null;

  const namedPhase = PHASE_WORDS.find((p) => includesAny(text, p.words))?.phase ?? null;
  const phase = namedPhase ?? timeOfDay;
  const colorHits = COLOR_WORDS.filter((c) => includesAny(text, c.words));

  // Start from the time of day, then paint in each colour mentioned.
  let palette: SkyPalette = [...PHASE_PALETTE[phase]] as SkyPalette;
  colorHits.forEach((c, i) => {
    const weight = i === 0 ? 0.7 : 0.4;
    palette = palette.map((band, j) => mixHex(band, c.palette[j], weight)) as SkyPalette;
  });
  // Night skies keep a dark top whatever colour is named.
  if (phase === 'night') palette[0] = mixHex(palette[0], '#050a26', 0.6);

  const clouds = CLOUD_WORDS.find((c) => includesAny(text, c.words))?.clouds ?? 'few';
  // A grey, covered sky loses most of its colour.
  if (clouds === 'overcast' && !colorHits.some((c) => c.name !== 'Grey')) {
    palette = palette.map((band, j) => mixHex(band, ['#4b5470', '#7d8599', '#b9bdc8'][j], 0.6)) as SkyPalette;
  }
  const things = THING_WORDS.filter((t) => includesAny(text, t.words)).map((t) => t.thing);
  // "별똥별" contains "별" and "새벽" contains "새": check stars and birds
  // again with those words taken out.
  const plain = text.replace(/별똥별|shooting star/g, ' ').replace(/새벽/g, ' ').replace(/sunset|sunrise/g, ' ');
  const finalThings = things.filter((t) => {
    if (t === 'stars') return includesAny(plain, ['star', '별']);
    if (t === 'birds') return includesAny(plain, THING_WORDS.find((w) => w.thing === 'birds')!.words);
    if (t === 'sun') return includesAny(plain, THING_WORDS.find((w) => w.thing === 'sun')!.words);
    return true;
  });

  // Only call it a sunset/sunrise when the student did.
  const noun = namedPhase ? { dawn: 'sunrise', day: 'sky', dusk: 'sunset', night: 'night' }[namedPhase] : 'sky';
  let title: string;
  if (finalThings.includes('rainbow')) title = 'Rainbow after the rain';
  else if (finalThings.includes('shooting_star')) title = 'Night of a shooting star';
  else if (finalThings.includes('lightning')) title = 'Stormy sky';
  else if (finalThings.includes('snow')) title = 'Snowy sky';
  else if (finalThings.includes('rain')) title = 'Rainy sky';
  else if (phase === 'night' && finalThings.includes('stars')) title = colorHits[0] ? `${colorHits[0].name} starry night` : 'Starry night';
  else if (phase === 'night' && finalThings.includes('moon')) title = 'Moonlit night';
  else if (clouds === 'overcast') title = 'Cloudy sky';
  else if (text.includes('cotton') || text.includes('솜사탕')) title = `Cotton-candy ${noun}`;
  else if (colorHits[0]) title = `${colorHits[0].name} ${noun}`;
  else title = { dawn: 'Soft morning sky', day: 'Clear day sky', dusk: 'Evening sky', night: 'Quiet night sky' }[phase];

  return {
    colors: palette,
    clouds,
    cloud_color: phase === 'day' ? '#ffffff' : mixHex(palette[2], '#ffffff', 0.4),
    things: finalThings.slice(0, 6),
    title: title.charAt(0).toUpperCase() + title.slice(1),
  };
}
