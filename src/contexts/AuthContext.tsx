import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications } from '../lib/notifications';

type SignOutOptions = { scope?: 'local' | 'global' };

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  username: string | null;
  usernameLoading: boolean;
  refreshUsername: () => Promise<void>;
  signOut: (options?: SignOutOptions) => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  username: null,
  usernameLoading: true,
  refreshUsername: async () => {},
  signOut: async () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [usernameLoading, setUsernameLoading] = useState(true);

  useEffect(() => {
    // Load the current session when the app starts. The .catch() matters: without
    // it, a rejected getSession() call (e.g. a SecureStore/network hiccup) would
    // leave `loading` stuck true forever — the whole app parked on the launch
    // spinner with no way forward.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
      })
      .catch(() => {
        setSession(null);
      })
      .finally(() => {
        setLoading(false);
      });

    // Listen for login/logout events and update state automatically
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Re-registers on every login (and on app reopen with a persisted session) —
    // harmless if it runs more than once, since it just overwrites the same token.
    if (session?.user) {
      registerForPushNotifications(session.user.id).catch((err) => console.warn('Push registration failed', err));
    }
  }, [session?.user?.id]);

  // Only fetches and returns the value — deliberately does NOT set state
  // itself, so callers control exactly when (and whether) a result still
  // applies. The mount effect below is the one place that actually needs
  // that guard (Step 40).
  const fetchUsername = useCallback(async (userId: string) => {
    const { data } = await supabase.from('profiles').select('username').eq('id', userId).maybeSingle();
    return data?.username ?? null;
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setUsername(null);
      setUsernameLoading(false);
      return;
    }

    // Guards against a slow response for a previous account landing after a
    // fast logout→login switches to a different one — without this, Account
    // A's username could overwrite Account B's already-applied state (and,
    // since AppNavigator's onboarding gate is driven by `!!username`, could
    // even route a brand-new B past ChooseUsernameScreen). `cancelled` flips
    // true via this effect's own cleanup, which React runs before the next
    // invocation (triggered by session?.user?.id changing) starts (Step 40).
    let cancelled = false;
    setUsernameLoading(true);
    fetchUsername(session.user.id)
      .then((value) => {
        if (!cancelled) setUsername(value);
      })
      .catch(() => {
        if (!cancelled) setUsername(null);
      })
      .finally(() => {
        if (!cancelled) setUsernameLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, fetchUsername]);

  // Called after the user successfully picks a username, so AppNavigator's gate
  // re-evaluates and lets them into the main app without needing to relog in.
  // No cancellation guard needed here — this is a direct, synchronous result
  // of the current session's own action, not a background load that could be
  // superseded by an account switch mid-flight.
  const refreshUsername = useCallback(async () => {
    if (!session?.user) return;
    const value = await fetchUsername(session.user.id);
    setUsername(value);
  }, [session?.user, fetchUsername]);

  const signOut = useCallback(
    async (options?: SignOutOptions) => {
      // Captured now, before anything async runs, and never re-read from
      // `session` afterward — supabase.auth.signOut() below clears the
      // client's session, so re-reading `session` partway through this
      // function could pick up a different (or cleared) value if an account
      // switch raced with this call (Step 40).
      const userId = session?.user?.id;
      if (userId) {
        // Best-effort — a shared device shouldn't keep receiving this
        // account's pushes once it signs out, but logout must succeed even
        // if this fails, and must never block on it. Still fully
        // authenticated as exactly this user at this point (signOut()
        // hasn't run yet), so the same RLS that already lets
        // registerForPushNotifications() write this column allows clearing
        // it — scoped to this one row, never another account's.
        try {
          await supabase.from('profiles').update({ expo_push_token: null }).eq('id', userId);
        } catch {
          // Ignored on purpose — see comment above.
        }
      }
      await supabase.auth.signOut(options?.scope ? { scope: options.scope } : undefined);
    },
    [session]
  );

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, username, usernameLoading, refreshUsername, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook — call useAuth() in any screen to get the current user
export function useAuth() {
  return useContext(AuthContext);
}
