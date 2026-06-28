import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications } from '../lib/notifications';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  username: string | null;
  usernameLoading: boolean;
  refreshUsername: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  username: null,
  usernameLoading: true,
  refreshUsername: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [usernameLoading, setUsernameLoading] = useState(true);

  useEffect(() => {
    // Load the current session when the app starts
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
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

  const loadUsername = useCallback(async (userId: string) => {
    const { data } = await supabase.from('profiles').select('username').eq('id', userId).maybeSingle();
    setUsername(data?.username ?? null);
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setUsername(null);
      setUsernameLoading(false);
      return;
    }

    setUsernameLoading(true);
    loadUsername(session.user.id).finally(() => setUsernameLoading(false));
  }, [session?.user?.id, loadUsername]);

  // Called after the user successfully picks a username, so AppNavigator's gate
  // re-evaluates and lets them into the main app without needing to relog in.
  const refreshUsername = useCallback(async () => {
    if (!session?.user) return;
    await loadUsername(session.user.id);
  }, [session?.user, loadUsername]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

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
