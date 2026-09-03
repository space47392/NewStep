import { Share } from 'react-native';
import { Post } from '../types';

// Native share sheet only — no custom messaging system, no automatic message
// creation. There's no configured deep-link scheme or hosted post page (see
// app.json), so this shares only what's already public post content — no
// post id/URL that could leak anything private.
export async function sharePost(post: Post): Promise<void> {
  const author = post.profiles?.full_name ?? 'A NewStep student';
  const message = `${author} on NewStep (${post.category}):\n\n${post.content}`;
  try {
    await Share.share({ message });
  } catch {
    // Share sheet dismissed/cancelled or unavailable — nothing to recover.
  }
}
