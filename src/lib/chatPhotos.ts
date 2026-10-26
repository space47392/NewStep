import { useEffect, useState } from 'react';
import { File } from 'expo-file-system';
import { supabase } from './supabase';

// Chat photos live in the PRIVATE 'chat-photos' bucket (chat_photos.sql) at
// {conversation_id}/{sender_id}/{file}. Only the two people in the
// conversation can read them, so the app shows them through short-lived
// signed URLs instead of public links.

const BUCKET = 'chat-photos';
const URL_TTL = 60 * 60; // seconds a signed URL stays valid

export async function uploadChatPhoto(params: {
  conversationId: string;
  senderId: string;
  localUri: string;
  mimeType?: string;
}): Promise<string> {
  const ext = params.mimeType === 'image/png' ? 'png' : 'jpg';
  const path = `${params.conversationId}/${params.senderId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const bytes = await new File(params.localUri).bytes();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: params.mimeType ?? 'image/jpeg' });
  if (error) throw error;
  return path;
}

// Best-effort: a leftover file is wasted space, not a privacy leak (the
// bucket is private either way).
export async function removeChatPhoto(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // ignore
  }
}

// Signed URLs, remembered for this app session so scrolling doesn't re-sign.
const cache = new Map<string, { url: string; expires: number }>();

export async function chatPhotoUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now() + 60_000) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, URL_TTL);
  if (error || !data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, expires: Date.now() + URL_TTL * 1000 });
  return data.signedUrl;
}

export function useChatPhotoUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (path ? cache.get(path)?.url ?? null : null));
  useEffect(() => {
    if (!path) return;
    let alive = true;
    chatPhotoUrl(path).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

// Voice messages share the same private bucket and folder rules.
export async function uploadChatAudio(params: { conversationId: string; senderId: string; localUri: string }): Promise<string> {
  const path = `${params.conversationId}/${params.senderId}/${Date.now()}-${Math.random().toString(36).slice(2)}.m4a`;
  const bytes = await new File(params.localUri).bytes();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'audio/mp4' });
  if (error) throw error;
  return path;
}
