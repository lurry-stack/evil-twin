import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase, Profile } from './supabase';

const SESSION_KEY = 'pinoni_session_start';
const MAX_SESSION_MS = 5 * 60 * 60 * 1000; // 5 hours

type AuthCtx = {
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  profile: null,
  loading: true,
  isAdmin: false,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    // Check session age for auto-logout
    const startStr = localStorage.getItem(SESSION_KEY);
    if (startStr) {
      const elapsed = Date.now() - Number(startStr);
      if (elapsed > MAX_SESSION_MS) {
        await supabase.auth.signOut();
        localStorage.removeItem(SESSION_KEY);
        setProfile(null);
        setLoading(false);
        return;
      }
    } else {
      localStorage.setItem(SESSION_KEY, String(Date.now()));
    }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();
    setProfile(data as Profile | null);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProfile();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        localStorage.setItem(SESSION_KEY, String(Date.now()));
      }
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem(SESSION_KEY);
      }
      (async () => { await loadProfile(); })();
    });
    // Check session expiry every minute
    const interval = setInterval(() => {
      const startStr = localStorage.getItem(SESSION_KEY);
      if (startStr) {
        const elapsed = Date.now() - Number(startStr);
        if (elapsed > MAX_SESSION_MS) {
          supabase.auth.signOut();
          localStorage.removeItem(SESSION_KEY);
          setProfile(null);
        }
      }
    }, 60000);
    return () => {
      sub.subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    await loadProfile();
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(SESSION_KEY);
    setProfile(null);
  }, []);

  return (
    <Ctx.Provider value={{ profile, loading, isAdmin: !!profile?.is_admin, refreshProfile, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
