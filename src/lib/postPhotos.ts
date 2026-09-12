import { File } from 'expo-file-system';
import { supabase } from './supabase';

const BUCKET = 'post-photos';

export async function uploadPostPhoto(params: {
  userId: string;
  postId: string;
  localUri: string;
  mimeType?: string;
}): Promise<string> {
  const ext = params.mimeType === 'image/png' ? 'png' : 'jpg';
  const path = `${params.userId}/${params.postId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const file = new File(params.localUri);
  const bytes = await file.bytes();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: params.mimeType ?? 'image/jpeg' });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function extractPath(publicUrl: string): string | null {
  const marker = `/${BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  return index === -1 ? null : publicUrl.slice(index + marker.length);
}

// Best-effort cleanup — an orphaned storage file is wasted space, not a
// correctness problem, so failures here are swallowed rather than thrown.
export async function removePostPhotos(photoUrls: string[]): Promise<void> {
  const paths = photoUrls.map(extractPath).filter((p): p is string => p !== null);
  if (paths.length === 0) return;

  try {
    await supabase.storage.from(BUCKET).remove(paths);
  } catch {
    // ignored
  }
}

// Same extraction/removal as removePostPhotos() above, but for account
// deletion (accountStorage.ts) — there, a failed removal must NOT be
// swallowed: silently proceeding to delete the account afterward would leave
// the exact "account says deleted, files definitely remain, and now nothing
// can ever remove them" state Step 51/52 flagged, since no session survives
// to satisfy this bucket's own-folder DELETE policy once the account is
// actually gone. Every other caller of removePostPhotos() keeps its existing
// best-effort behavior untouched.
export async function removePostPhotosStrict(photoUrls: string[]): Promise<void> {
  const paths = photoUrls.map(extractPath).filter((p): p is string => p !== null);
  if (paths.length === 0) return;

  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw error;
}
