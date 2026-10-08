import { File } from 'expo-file-system';
import { supabase } from './supabase';
import { colors } from '../constants/theme';
import { SkyPalette } from './skyColors';

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
  // Three colours read from the photo (school_sky_colors.sql).
  sky_colors: SkyPalette | null;
  updated_at: string;
  profile: { id: string; full_name: string | null; username: string | null; avatar_url: string | null } | null;
};

// RLS already limits rows to the viewer's own school; this only drops
// stars older than a day.
export async function fetchSchoolSky(limit = 60): Promise<SkyStar[]> {
  const since = new Date(Date.now() - STAR_LIFETIME_MS).toISOString();
  const { data, error } = await supabase
    .from('sky_stars')
    .select('user_id, mood, note, photo_url, sky_colors, updated_at, profile:profiles!sky_stars_user_id_fkey ( id, full_name, username, avatar_url )')
    .gt('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as SkyStar[];
}

export async function setMyStar(
  mood: SkyMood,
  note: string,
  photoUrl: string | null,
  skyColors: SkyPalette | null
): Promise<void> {
  const { error } = await supabase.rpc('set_my_star', {
    p_mood: mood,
    p_note: note.trim() || null,
    p_photo_url: photoUrl,
    p_sky_colors: photoUrl ? skyColors : null,
  });
  if (error) throw error;
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
