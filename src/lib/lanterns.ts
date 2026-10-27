import { supabase } from './supabase';

// School Sky Lanterns (supabase/school_sky_lanterns.sql): a worry sent up
// anonymously; classmates send back warm notes with their name.

export type Lantern = {
  id: string;
  text: string;
  crisis: boolean;
  created_at: string;
  mine: boolean;
  note_count: number;
  noted_by_me: boolean;
  // "Me too" (school_sky_lanterns_care.sql).
  hug_count: number;
  hugged_by_me: boolean;
};

export type LanternNote = {
  id: string;
  text: string;
  created_at: string;
  hidden: boolean;
  mine: boolean;
  author_id: string | null;
  author_name: string | null;
  author_avatar: string | null;
  // The lantern's writer said this note helped.
  helped: boolean;
};

export const LANTERN_MAX = 300;
export const NOTE_MAX = 200;

// Gentle ways to begin, for when it is hard to know where to start.
export const LANTERN_STARTERS = [
  "Lately I've been worried about ",
  "I feel alone when ",
  "I'm stressed about ",
  "Today was hard because ",
  "I wish someone knew that ",
];

// Gentle starters for a warm note.
export const NOTE_STARTERS = [
  'That sounds really hard 💛',
  "You're not alone in this.",
  "I've felt that way too.",
  'Proud of you for sharing.',
  'Sending you a hug 🫂',
];

export async function fetchLanterns(): Promise<Lantern[]> {
  const { data, error } = await supabase.rpc('fetch_lanterns');
  if (error) throw error;
  // Before school_sky_lanterns_care.sql runs, the "Me too" fields are missing.
  return ((data ?? []) as Lantern[]).map((l) => ({ ...l, hug_count: l.hug_count ?? 0, hugged_by_me: !!l.hugged_by_me }));
}

export async function sendLantern(text: string): Promise<void> {
  const { error } = await supabase.rpc('send_lantern', { p_text: text.trim() });
  if (error) throw error;
}

export async function deleteMyLantern(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_my_lantern', { p_lantern: id });
  if (error) throw error;
}

export async function fetchLanternNotes(lanternId: string): Promise<LanternNote[]> {
  const { data, error } = await supabase.rpc('fetch_lantern_notes', { p_lantern: lanternId });
  if (error) throw error;
  return ((data ?? []) as LanternNote[]).map((n) => ({ ...n, helped: !!n.helped }));
}

export async function addLanternNote(lanternId: string, text: string): Promise<void> {
  const { error } = await supabase.rpc('add_lantern_note', { p_lantern: lanternId, p_text: text.trim() });
  if (error) throw error;
}

export async function setLanternNoteHidden(noteId: string, hidden: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_lantern_note_hidden', { p_note: noteId, p_hidden: hidden });
  if (error) throw error;
}

export async function deleteMyLanternNote(noteId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_my_lantern_note', { p_note: noteId });
  if (error) throw error;
}

export async function reportLantern(target: { lanternId?: string; noteId?: string }): Promise<void> {
  const { error } = await supabase.rpc('report_lantern', {
    p_lantern: target.lanternId ?? null,
    p_note: target.noteId ?? null,
  });
  if (error) throw error;
}

// "Me too": returns true when I now feel it too, false when taken back.
export async function toggleLanternHug(lanternId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_lantern_hug', { p_lantern: lanternId });
  if (error) throw error;
  return !!data;
}

// The lantern's writer thanks a note; its writer is told, without learning who.
export async function markLanternNoteHelped(noteId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_lantern_note_helped', { p_note: noteId });
  if (error) throw error;
}
