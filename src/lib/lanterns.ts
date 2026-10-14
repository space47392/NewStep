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
};

export const LANTERN_MAX = 300;
export const NOTE_MAX = 200;

// Gentle starters for a warm note.
export const NOTE_STARTERS = [
  'That sounds really hard 💛',
  "You're not alone in this.",
  "I've felt that way too.",
  'Proud of you for sharing.',
  'Sending you a hug 🫂',
];

// Signs the writer may be in danger (kept in step with
// sounds_like_crisis() in the SQL). Used to show support lines first.
const CRISIS = /(kill ?my ?self|\bkms\b|want(ed)? to die|wanna die|end (it all|my life)|suicid|self[- ]?harm|cut(ting)? myself|hurt myself|no reason to live|better off without me|don'?t want to be here|disappear forever|죽고\s?싶|자살|자해|살기\s?싫|사라지고\s?싶|없어지고\s?싶|끝내고\s?싶|손목|뛰어내리)/i;

export function soundsLikeCrisis(text: string): boolean {
  return CRISIS.test(text);
}

export async function fetchLanterns(): Promise<Lantern[]> {
  const { data, error } = await supabase.rpc('fetch_lanterns');
  if (error) throw error;
  return (data ?? []) as Lantern[];
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
  return (data ?? []) as LanternNote[];
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
