import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// ─── Replace these with your actual values from supabase.com → Project Settings → API ───
const SUPABASE_URL = 'https://nlrgfbrdzqevvykegxmv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5scmdmYnJkenFldnZ5a2VneG12Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NjYyNTksImV4cCI6MjA5NzU0MjI1OX0.5jSx0V-31IP0MaB3qT_j1F12H707SoHdQ6Vmo6fNsmA';
// ─────────────────────────────────────────────────────────────────────────────────────────

// SecureStore adapter so Supabase can persist the auth session on-device
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
