// One place to turn a thrown value into words a student can read.
//
// Supabase errors (PostgrestError, AuthError, StorageError) all extend Error,
// and our RPCs raise friendly messages on purpose ("That's your own tip 💛"),
// so those are shown as-is. Raw network failures are not friendly, so they
// get a plain sentence instead.

const NETWORK = /network request failed|failed to fetch|networkerror|load failed|timed? ?out/i;

export const OFFLINE_MESSAGE = "Can't reach NewStep right now — check your connection and try again.";

export function isNetworkError(err: unknown): boolean {
  return err instanceof Error && NETWORK.test(err.message);
}

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isNetworkError(err)) return OFFLINE_MESSAGE;
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}
