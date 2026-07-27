import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useRouter } from '../lib/router';
import { useToast } from '../lib/toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { phoneToEmail } from './LoginPage';

export function RegisterPage() {
  const { navigate } = useRouter();
  const toast = useToast();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [refCode, setRefCode] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) setRefCode(ref);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !password || !fullName) {
      toast.error('Please fill all required fields');
      return;
    }
    setLoading(true);
    // Call our edge function to create the user server-side, bypassing the
    // weak-password / HIBP check that Supabase applies to client-side signUp.
    const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/signup`;
    const fnRes = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ phone, password, full_name: fullName, ref_code: refCode || null }),
    });
    const fnData = await fnRes.json().catch(() => null);
    if (!fnRes.ok || fnData?.error) {
      setLoading(false);
      toast.error(fnData?.error || 'Failed to create account');
      return;
    }
    // Sign in with the newly created credentials.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: phoneToEmail(phone),
      password,
    });
    if (signInError) {
      setLoading(false);
      toast.error('Account created! Please sign in.');
      navigate('/login');
      return;
    }
    setLoading(false);
    toast.success('Account created! Welcome to PINONI!');
    navigate('/home', { replace: true });
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center relative overflow-hidden px-6 py-8"
      style={{ background: 'linear-gradient(160deg, #F59E0B 0%, #B45309 50%, #92400E 100%)' }}
    >
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)', backgroundSize: '12px 12px' }} />
      <div className="relative w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl"
            style={{ background: 'linear-gradient(135deg, #F59E0B, #92400E)', border: '2px solid rgba(255,255,255,0.3)' }}
          >
            <span className="text-white text-lg font-black">RIN</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-widest" style={{ fontFamily: 'Playfair Display, serif' }}>
            Create Account
          </h1>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl p-6 space-y-4 shadow-2xl">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Full Name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+250 7XX XXX XXX"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Password</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Choose any password"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Referral Code (optional)</label>
            <input
              value={refCode}
              onChange={(e) => setRefCode(e.target.value)}
              placeholder="ABCD1234"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full py-4 font-black text-base flex items-center justify-center gap-2 shadow-md active:scale-95 transition-transform disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #F59E0B, #92400E)', color: '#fff' }}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Account'}
          </button>
          <div className="text-center text-sm text-gray-500">
            Have an account?{' '}
            <button type="button" onClick={() => navigate('/login')} className="font-bold text-primary hover:underline">
              Sign In
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
