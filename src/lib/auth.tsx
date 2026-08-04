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

  // Fetch profile row from DB — safe to call anywhere except inside onAuthStateChange
  const fetchAndSetProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    setProfile(data as Profile | null);
    setLoading(false);
  }, []);

  // refreshProfile is called externally (e.g. after buying a VIP plan)
  // It uses getSession() which is safe outside of onAuthStateChange
  const refreshProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    await fetchAndSetProfile(session.user.id);
  }, [fetchAndSetProfile]);

  useEffect(() => {
    let cancelled = false;

    // Initial load: check for existing session explicitly.
    // onAuthStateChange does NOT reliably fire on page refresh,
    // so without this, returning users get stuck on the loading spinner.
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (!data.session?.user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      // Check session age for auto-logout
      const startStr = localStorage.getItem(SESSION_KEY);
      if (startStr) {
        const elapsed = Date.now() - Number(startStr);
        if (elapsed > MAX_SESSION_MS) {
          localStorage.removeItem(SESSION_KEY);
          await supabase.auth.signOut();
          return;
        }
      } else {
        localStorage.setItem(SESSION_KEY, String(Date.now()));
      }
      await fetchAndSetProfile(data.session.user.id);
    });

    // onAuthStateChange handles subsequent events (login, logout, token refresh).
    // The callback must NOT be async — awaiting Supabase calls inside it creates
    // a deadlock that blocks signInWithPassword from resolving. Wrap async work
    // in an IIFE so the callback returns immediately.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      (async () => {
        if (event === 'SIGNED_IN') {
          localStorage.setItem(SESSION_KEY, String(Date.now()));
        }

        if (event === 'SIGNED_OUT') {
          localStorage.removeItem(SESSION_KEY);
          setProfile(null);
          setLoading(false);
          return;
        }

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
            localStorage.removeItem(SESSION_KEY);
            await supabase.auth.signOut();
            return;
          }
        } else if (event === 'SIGNED_IN') {
          localStorage.setItem(SESSION_KEY, String(Date.now()));
        }

        await fetchAndSetProfile(session.user.id);
      })();
    });

    // Safety timeout: if nothing has resolved loading after 8 seconds,
    // stop spinning so the user is never permanently stuck.
    const safety = setTimeout(() => {
      setLoading(false);
    }, 8000);

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
      cancelled = true;
      clearTimeout(safety);
      sub.subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [fetchAndSetProfile]);

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
