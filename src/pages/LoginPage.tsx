import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useRouter } from '../lib/router';
import { useToast } from '../lib/toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';

// Supabase Auth requires an email field. We derive a stable fake email from
// the phone number so users only ever see/enter their phone number.
export const phoneToEmail = (phone: string) => `${phone.replace(/[^0-9]/g, '')}@pinoni.app`;

export function LoginPage() {
  const { navigate } = useRouter();
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate('/home', { replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !password) {
      toast.error('Please fill all fields');
      return;
    }
    setLoading(true);
    let error: Error | null = null;
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Check your connection and try again.')), 15000)
      );
      const result = await Promise.race([
        supabase.auth.signInWithPassword({ email: phoneToEmail(phone), password }),
        timeout,
      ]) as Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
      error = result.error;
    } catch (e) {
      error = e as Error;
    }
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Welcome back!');
    navigate('/home', { replace: true });
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center relative overflow-hidden px-6 py-8"
      style={{ background: 'linear-gradient(160deg, #F59E0B 0%, #B45309 50%, #92400E 100%)' }}
    >
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)', backgroundSize: '12px 12px' }} />
      <div className="relative w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 mb-2">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-xl"
            style={{ background: 'linear-gradient(135deg, #F59E0B, #92400E)', border: '2px solid rgba(255,255,255,0.3)' }}
          >
            <span className="text-white text-xl font-black">RIN</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-widest drop-shadow-lg" style={{ fontFamily: 'Playfair Display, serif' }}>
            PINONI
          </h1>
          <p className="text-white/80 text-sm font-semibold tracking-wide">
            Earn between 1,200 and 200,000 daily
          </p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl p-6 space-y-4 shadow-2xl">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+250 7XX XXX XXX"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Password</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 pr-10 text-sm text-gray-800 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full py-4 font-black text-base flex items-center justify-center gap-2 shadow-md active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #F59E0B, #92400E)', color: '#fff' }}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
          </button>
          <div className="text-center text-sm text-gray-500">
            No account?{' '}
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="font-bold text-primary hover:underline"
            >
              Register
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
