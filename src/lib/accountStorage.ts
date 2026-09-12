import { supabase } from './supabase';
import { removePostPhotosStrict } from './postPhotos';

// Removes every Storage object this account owns — avatar, active story
// image, and every post photo. Must run BEFORE delete_my_account() while the
// caller is still authenticated (Step 51/52): every bucket's own DELETE
// policy checks `(storage.foldername(name))[1] = auth.uid()::text`, and once
// the auth.users row is gone there is no session left to satisfy that check —
// this account (or anyone else) could never clean these files up again.
//
// Deliberately throws rather than swallowing failures (unlike
// removePostPhotos()'s existing best-effort behavior elsewhere) — silently
// proceeding to delete the account afterward would leave exactly the
// misleading state Step 51 flagged: "account deleted" while owned files
// definitely still remain, permanently. account.ts's deleteMyAccount() relies
// on this throwing to decide whether it's safe to call the deletion RPC at
// all.
export async function cleanupAccountStorage(userId: string): Promise<void> {
  const results = await Promise.allSettled([
    removeAvatarFile(userId),
    removeStoryFile(userId),
    removeAllPostPhotosForAuthor(userId),
  ]);

  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failures.length > 0) {
    // Whichever of the three succeeded are already gone — only the failed
    // one(s) still need a retry, and re-running this whole function is safe
    // (removing an already-removed object, or an object that never existed,
    // is a harmless no-op in Supabase Storage, not an error).
    throw new Error('Could not remove all of your stored files. Please try again.');
  }
}

// Fixed, upsert-overwritten path — same one EditProfileScreen.tsx's
// handleSave() always uploads to. A user who never set a custom avatar has
// no object at this path at all; removing a path that doesn't exist is a
// normal no-op, not an error.
async function removeAvatarFile(userId: string): Promise<void> {
  const { error } = await supabase.storage.from('avatars').remove([`${userId}/avatar.jpg`]);
  if (error) throw error;
}

// Fixed, upsert-overwritten path — same one stories.ts's uploadStory() always
// writes to (replace_story() only ever keeps one row/file per author). A user
// with no active (or ever-posted) story has no object here either.
async function removeStoryFile(userId: string): Promise<void> {
  const { error } = await supabase.storage.from('stories').remove([`${userId}/story.jpg`]);
  if (error) throw error;
}

// Post photos have no single fixed path — uploadPostPhoto() (postPhotos.ts)
// gives every post its own subfolder (`${userId}/${postId}/...`), so there's
// no one path to remove directly. Rather than listing Storage folders (a
// second, separate way to enumerate "this user's files" that could drift out
// of sync with what's actually referenced), this reads the same photo_urls
// this account's own posts already carry in the database — the one source of
// truth CreatePostScreen/EditProfileScreen already trust — and reuses
// removePostPhotosStrict() exactly like deletePost()/editPost() already do
// for a single post. Filtering by `author_id = userId` also means every path
// this ever touches is structurally under `${userId}/...` — it can never
// reach another account's folder, by construction, without needing to parse
// or trust any path string itself.
async function removeAllPostPhotosForAuthor(userId: string): Promise<void> {
  const { data, error } = await supabase.from('posts').select('photo_urls').eq('author_id', userId);
  if (error) throw error;

  const allPhotoUrls = (data ?? []).flatMap((row) => row.photo_urls ?? []);
  if (allPhotoUrls.length > 0) {
    await removePostPhotosStrict(allPhotoUrls);
  }
}
