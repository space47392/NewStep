import { File } from 'expo-file-system';
import { supabase } from './supabase';
import { colors } from '../constants/theme';
import { SkyPalette } from './skyColors';
import { interpretSky } from './skyInterpret';
import { mixHex } from './skyColors';

// School Sky (supabase/school_sky.sql): one mood star per student, visible
// to classmates for 24 hours after it was last set.

export type SkyMood = 'happy' | 'excited' | 'chill' | 'nervous' | 'tired' | 'down';

export const SKY_MOODS: { key: SkyMood; emoji: string; label: string; color: string }[] = [
  { key: 'happy', emoji: '😊', label: 'Good', color: colors.sticker.yellow },
  { key: 'excited', emoji: '🤩', label: 'Excited', color: colors.sticker.pink },
  { key: 'chill', emoji: '😌', label: 'Chill', color: colors.sticker.mint },
  { key: 'nervous', emoji: '😬', label: 'Nervous', color: colors.sticker.lilac },
  { key: 'tired', emoji: '😴', label: 'Tired', color: colors.sticker.blue },
  { key: 'down', emoji: '🥺', label: 'Down', color: '#C9C6E0' },
];

export function skyMood(key: string) {
  return SKY_MOODS.find((m) => m.key === key) ?? SKY_MOODS[0];
}

export const SKY_NOTE_MAX = 80;
const STAR_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type SkyStar = {
  user_id: string;
  mood: SkyMood;
  note: string | null;
  // A real-sky photo taken with the camera (school_sky_photos.sql).
  photo_url: string | null;
  // Three sky colours — from the AI-read description, or from a photo.
  sky_colors: SkyPalette | null;
  // The student's own words about the sky and how it was read
  // (school_sky_describe.sql).
  sky_desc: string | null;
  sky_title: string | null;
  sky_clouds: SkyClouds | null;
  sky_things: SkyThing[] | null;
  updated_at: string;
  profile: { id: string; full_name: string | null; username: string | null; avatar_url: string | null } | null;
};

// RLS already limits rows to the viewer's own school; this only drops
// stars older than a day.
export async function fetchSchoolSky(limit = 60): Promise<SkyStar[]> {
  const since = new Date(Date.now() - STAR_LIFETIME_MS).toISOString();
  const { data, error } = await supabase
    .from('sky_stars')
    .select('user_id, mood, note, photo_url, sky_colors, sky_desc, sky_title, sky_clouds, sky_things, updated_at, profile:profiles!sky_stars_user_id_fkey ( id, full_name, username, avatar_url )')
    .gt('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as SkyStar[];
}

export type SkyClouds = 'none' | 'few' | 'scattered' | 'overcast';
export type SkyThing =
  | 'moon' | 'sun' | 'stars' | 'rainbow' | 'rain' | 'snow' | 'birds' | 'airplane' | 'fog' | 'lightning' | 'shooting_star';

// How the AI read a student's description of the sky.
export type SkyScene = {
  colors: SkyPalette;
  clouds: SkyClouds;
  cloud_color: string;
  things: SkyThing[];
  title: string;
};

// Turn the AI painter on once the describe-sky Edge Function is deployed
// with an ANTHROPIC_API_KEY (a paid API). Until then the description is
// read on the phone itself (skyInterpret.ts) — free and instant.
const USE_AI_PAINTER = false;

// Paints a student's description of the sky. Returns null when the text
// isn't about the sky.
export async function describeSky(text: string, timeOfDay: 'dawn' | 'day' | 'dusk' | 'night'): Promise<SkyScene | null> {
  if (!USE_AI_PAINTER) return interpretSky(text, timeOfDay);
  return describeSkyWithAI(text, timeOfDay);
}

// The AI version: sends the words to the describe-sky Edge Function, which
// asks Claude for painting instructions and screens the text.
async function describeSkyWithAI(text: string, timeOfDay: string): Promise<SkyScene | null> {
  const { data, error } = await supabase.functions.invoke('describe-sky', { body: { text, timeOfDay } });
  if (error) {
    // The function's own message (rate limit, sign-in) when there is one.
    let message = "Couldn't paint the sky right now.";
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }
  if (!data?.appropriate) return null;
  return data as SkyScene;
}

export async function setMyStar(params: {
  mood: SkyMood;
  note: string;
  photoUrl: string | null;
  skyColors: SkyPalette | null;
  desc: string | null;
  scene: SkyScene | null;
}): Promise<void> {
  const { mood, note, photoUrl, skyColors, desc, scene } = params;
  const { error } = await supabase.rpc('set_my_star', {
    p_mood: mood,
    p_note: note.trim() || null,
    p_photo_url: photoUrl,
    p_sky_colors: scene ? scene.colors : photoUrl ? skyColors : null,
    p_sky_desc: scene && desc ? desc.trim() : null,
    p_sky_title: scene?.title ?? null,
    p_sky_clouds: scene?.clouds ?? null,
    p_sky_things: scene?.things ?? null,
  });
  if (error) throw error;
}

// Today's sky as classmates described it: their colours averaged band by
// band, the most common cloudiness, and what they saw. Null when nobody
// has described the sky today.
export type TodaySky = { colors: SkyPalette; clouds: SkyClouds; cloudColor: string; things: SkyThing[] };

export function blendDescribedSky(
  stars: { sky_desc: string | null; sky_colors: SkyPalette | null; sky_things: SkyThing[] | null; sky_clouds: SkyClouds | null }[]
): TodaySky | null {
  const described = stars.filter((s) => s.sky_desc && s.sky_colors);
  if (described.length === 0) return null;
  const colors = [0, 1, 2].map((band) =>
    described.reduce((acc, s, i) => (i === 0 ? s.sky_colors![band] : mixHex(acc, s.sky_colors![band], 1 / (i + 1))), '')
  ) as SkyPalette;
  const shared = sharedSky(described);
  return { colors, clouds: shared.clouds ?? 'few', cloudColor: mixHex(colors[2], '#ffffff', 0.45), things: shared.things };
}

export const THING_EMOJI: Record<SkyThing, string> = {
  moon: '🌙',
  sun: '☀️',
  stars: '✨',
  rainbow: '🌈',
  rain: '🌧️',
  snow: '❄️',
  birds: '🐦',
  airplane: '✈️',
  fog: '🌫️',
  lightning: '⚡',
  shooting_star: '🌠',
};

// What today's described skies have in common: things at least one
// classmate saw (most-mentioned first), and the cloudiest common reading.
export function sharedSky(stars: { sky_things: SkyThing[] | null; sky_clouds: SkyClouds | null }[]) {
  const counts = new Map<SkyThing, number>();
  const cloudVotes: Record<SkyClouds, number> = { none: 0, few: 0, scattered: 0, overcast: 0 };
  for (const s of stars) {
    (s.sky_things ?? []).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
    if (s.sky_clouds) cloudVotes[s.sky_clouds] += 1;
  }
  const things = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 5);
  const described = Object.values(cloudVotes).reduce((a, b) => a + b, 0);
  const clouds = described
    ? ((Object.entries(cloudVotes) as [SkyClouds, number][]).sort((a, b) => b[1] - a[1])[0][0])
    : null;
  return { things, clouds };
}

// One sky photo per student at a fixed path, overwritten each time — same
// pattern as stories, so account deletion can remove it by path.
export function skyPhotoPath(userId: string): string {
  return `${userId}/sky.jpg`;
}

export async function uploadSkyPhoto(userId: string, localUri: string): Promise<string> {
  const bytes = await new File(localUri).bytes();
  const { error } = await supabase.storage
    .from('sky')
    .upload(skyPhotoPath(userId), bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('sky').getPublicUrl(skyPhotoPath(userId));
  // Same URL every time, so bust the image cache after a retake.
  return `${data.publicUrl}?v=${Date.now()}`;
}

// Best-effort: a leftover file is overwritten by the next photo anyway.
export async function removeSkyPhoto(userId: string): Promise<void> {
  await supabase.storage.from('sky').remove([skyPhotoPath(userId)]);
}

export async function removeMyStar(userId: string): Promise<void> {
  const { error } = await supabase.from('sky_stars').delete().eq('user_id', userId);
  if (error) throw error;
  await removeSkyPhoto(userId).catch(() => {});
}

// A stable spot in the sky for each student, so their star doesn't jump
// around between visits. Returns fractions (0–1) of the sky's width/height.
export function starPosition(userId: string, index: number): { x: number; y: number } {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = (h >>> 0) / 4294967295;
  const b = ((Math.imul(h, 2654435761) >>> 0) % 10000) / 10000;
  // Spread rows so crowded skies don't stack everything in one band.
  const row = index % 5;
  // Kept above the horizon silhouette (bottom of the sky), and out of the
  // moon's corner (top right), where a star would sit on top of the moon.
  const x = 0.1 + a * 0.8;
  let y = 0.1 + row * 0.12 + b * 0.09;
  if (x > 0.62 && y < 0.3) y += 0.22;
  return { x, y };
}

// ---------------------------------------------------------------------------
// Twinkles, wishes and the Sky Diary (supabase/school_sky_social.sql)
// ---------------------------------------------------------------------------

export type TwinkleSummary = {
  // How many twinkles each star got today.
  counts: Record<string, number>;
  // Classmates I've already twinkled at today.
  sentTo: Set<string>;
};

export async function fetchTodayTwinkles(myId: string): Promise<TwinkleSummary> {
  const since = new Date(Date.now() - STAR_LIFETIME_MS).toISOString();
  const { data, error } = await supabase
    .from('sky_twinkles')
    .select('sender_id, recipient_id')
    .gt('created_at', since)
    .limit(500);
  if (error) throw error;
  const counts: Record<string, number> = {};
  const sentTo = new Set<string>();
  for (const row of data ?? []) {
    counts[row.recipient_id] = (counts[row.recipient_id] ?? 0) + 1;
    if (row.sender_id === myId) sentTo.add(row.recipient_id);
  }
  return { counts, sentTo };
}

export async function sendTwinkle(recipientId: string): Promise<void> {
  const { error } = await supabase.rpc('send_twinkle', { p_recipient: recipientId });
  if (error) throw error;
}

export type SkyWish = {
  id: string;
  text: string;
  created_at: string;
  cheers: number;
  mine: boolean;
  cheered: boolean;
};

export const WISH_MAX = 60;

// Today's wishes at my school — never who made them.
export async function fetchWishes(): Promise<SkyWish[]> {
  const { data, error } = await supabase.rpc('fetch_sky_wishes');
  if (error) throw error;
  return (data ?? []) as SkyWish[];
}

export async function makeWish(text: string): Promise<void> {
  const { error } = await supabase.rpc('make_wish', { p_text: text.trim() });
  if (error) throw error;
}

export async function cheerWish(wishId: string): Promise<void> {
  const { error } = await supabase.rpc('cheer_wish', { p_wish: wishId });
  if (error) throw error;
}

// Hides the wish for me and keeps the report for review
// (school_sky_safety.sql). Nothing is hidden for others by report count.
export async function reportWish(wishId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('report_wish', { p_wish: wishId, p_reason: reason ?? null });
  if (error) throw error;
}

export async function deleteWish(wishId: string): Promise<void> {
  const { error } = await supabase.from('sky_wishes').delete().eq('id', wishId);
  if (error) throw error;
}

export type SkyDiaryDay = {
  day: string; // YYYY-MM-DD
  mood: SkyMood;
  note: string | null;
  sky_colors: SkyPalette | null;
};

export async function fetchSkyDiary(userId: string, limit = 120): Promise<SkyDiaryDay[]> {
  const { data, error } = await supabase
    .from('sky_diary')
    .select('day, mood, note, sky_colors')
    .eq('user_id', userId)
    .order('day', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SkyDiaryDay[];
}

// ---------------------------------------------------------------------------
// Mood weather + today's constellation name (no server side)
// ---------------------------------------------------------------------------

export type SkyWeather = 'clouds' | 'rain' | 'meteors' | 'fireflies' | 'aurora' | 'flicker';

const WEATHER_BY_MOOD: Record<SkyMood, SkyWeather> = {
  tired: 'clouds',
  down: 'rain',
  excited: 'meteors',
  happy: 'fireflies',
  chill: 'aurora',
  nervous: 'flicker',
};

// The school's mood today: the most common mood among today's stars (the
// most recent one wins a tie).
export function dominantMoods(stars: { mood: SkyMood; updated_at: string }[]): SkyMood[] {
  const tally = new Map<SkyMood, { n: number; latest: number }>();
  for (const s of stars) {
    const t = tally.get(s.mood) ?? { n: 0, latest: 0 };
    t.n += 1;
    t.latest = Math.max(t.latest, new Date(s.updated_at).getTime());
    tally.set(s.mood, t);
  }
  return [...tally.entries()].sort((a, b) => b[1].n - a[1].n || b[1].latest - a[1].latest).map(([m]) => m);
}

export function moodWeather(mood: SkyMood): SkyWeather {
  return WEATHER_BY_MOOD[mood];
}

export function weatherLine(mood: SkyMood, school: string | undefined, when: string): string {
  const where = school ?? 'Your school';
  switch (mood) {
    case 'tired':
      return `${where} feels a little tired ${when} 😴`;
    case 'down':
      return `A soft rain over ${where} ${when} 🌧️`;
    case 'excited':
      return `${where} is buzzing ${when} 🤩`;
    case 'happy':
      return `${where} is glowing ${when} 😊`;
    case 'chill':
      return `${where} is calm ${when} 😌`;
    case 'nervous':
      return `Stars are flickering over ${where} ${when} 😬`;
  }
}

const ADJECTIVE: Record<SkyMood, string> = {
  happy: 'Sunny',
  excited: 'Rocketing',
  chill: 'Drifting',
  nervous: 'Trembling',
  tired: 'Sleepy',
  down: 'Gentle',
};
const CREATURE: Record<SkyMood, string> = {
  happy: 'Sunflower 🌻',
  excited: 'Rocket 🚀',
  chill: 'Whale 🐋',
  nervous: 'Rabbit 🐇',
  tired: 'Owl 🦉',
  down: 'Lantern 🏮',
};

// "The Sleepy Owl 🦉" — from today's top two moods (or one, doubled up).
export function constellationName(moods: SkyMood[]): string | null {
  if (moods.length === 0) return null;
  const first = moods[0];
  const second = moods[1] ?? moods[0];
  return `The ${ADJECTIVE[first]} ${CREATURE[second]}`;
}
