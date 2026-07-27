import { useEffect, useState, useCallback } from 'react';
import { Layout, PageHeader } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { useRouter } from '../lib/router';
import { useToast } from '../lib/toast';
import { supabase, fmt } from '../lib/supabase';
import { Loader2, Gift, Key } from 'lucide-react';

export function RedeemPage() {
  const { profile, refreshProfile } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!profile) {
    navigate('/login');
    return null;
  }

  const redeem = async () => {
    if (!code.trim()) { toast.error('Enter a code'); return; }
    setSubmitting(true);

    const { data: found } = await supabase
      .from('redeem_codes')
      .select('*')
      .eq('code', code.trim().toUpperCase())
      .maybeSingle();

    if (!found) { setSubmitting(false); toast.error('Invalid code'); return; }
    if (!found.is_active) { setSubmitting(false); toast.error('Code is inactive'); return; }
    if (found.used_count >= found.max_uses) { setSubmitting(false); toast.error('Code fully redeemed'); return; }

    if (found.expires_at && new Date(found.expires_at) < new Date()) {
      setSubmitting(false); toast.error('Code expired'); return;
    }

    // One-time use per user
    const { data: existing } = await supabase
      .from('user_redeems')
      .select('id')
      .eq('user_id', profile.id)
      .eq('code_id', found.id)
      .maybeSingle();

    if (existing) {
      setSubmitting(false);
      toast.error('You have already redeemed this code');
      return;
    }

    // Relative expiry check
    if (found.expiry_minutes) {
      const { data: firstRedeem } = await supabase
        .from('user_redeems')
        .select('created_at')
        .eq('code_id', found.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstRedeem) {
        const elapsed = (Date.now() - new Date(firstRedeem.created_at).getTime()) / 60000;
        if (elapsed > found.expiry_minutes) {
          setSubmitting(false);
          toast.error('Code has expired');
          return;
        }
      }
    }

    const { error: insErr } = await supabase.from('user_redeems').insert({
      user_id: profile.id,
      code_id: found.id,
      code: found.code,
      reward_amount: found.reward_amount,
    });

    if (insErr) {
      setSubmitting(false);
      if (insErr.code === '23505') {
        toast.error('You have already redeemed this code');
      } else {
        toast.error(insErr.message);
      }
      return;
    }

    await supabase.from('redeem_codes').update({ used_count: found.used_count + 1 }).eq('id', found.id);
    await supabase.from('transactions').insert({
      user_id: profile.id,
      type: 'redeem',
      amount: found.reward_amount,
      description: `Redeemed code ${found.code}`,
    });
    await supabase.from('profiles').update({
      main_balance: (profile.main_balance || 0) + found.reward_amount,
      total_earnings: (profile.total_earnings || 0) + found.reward_amount,
    }).eq('id', profile.id);

    await refreshProfile();
    setSubmitting(false);
    setCode('');
    toast.success(`Redeemed! +FRW ${fmt(found.reward_amount)}`);
  };

  return (
    <Layout>
      <PageHeader title="Redeem Gift" />
      <div className="p-4 space-y-4">
        <div className="glass-card rounded-2xl p-6 text-center">
          <Gift className="w-12 h-12 text-primary mx-auto mb-2" />
          <div className="text-sm font-bold text-foreground">Enter your gift code</div>
          <div className="text-xs text-muted-foreground mt-1">Each code can only be redeemed once per user</div>
        </div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter code"
          className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm uppercase focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          onClick={redeem}
          disabled={submitting}
          className="w-full rounded-xl font-black text-sm px-8 py-3.5 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #F59E0B, #92400E)', color: '#fff' }}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {submitting ? 'Redeeming...' : 'Redeem'}
        </button>
      </div>
    </Layout>
  );
}

export function ChangePasswordPage() {
  const { navigate } = useRouter();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!current || !next || !confirm) { toast.error('Fill all fields'); return; }
    if (next !== confirm) { toast.error('Passwords do not match'); return; }
    setSubmitting(true);
    // Verify current password by re-authenticating
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setSubmitting(false); toast.error('Session expired'); return; }
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    if (signInErr) { setSubmitting(false); toast.error('Current password is incorrect'); return; }
    // Now update password
    const { error } = await supabase.auth.updateUser({ password: next });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Password updated');
    navigate('/profile');
  };

  return (
    <Layout>
      <PageHeader title="Change Password" />
      <div className="p-4 space-y-4">
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password" className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        <button
          onClick={submit}
          disabled={submitting}
          className="w-full rounded-xl font-black text-sm px-8 py-3.5 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #F59E0B, #92400E)', color: '#fff' }}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {submitting ? 'Updating...' : 'Update Password'}
        </button>
      </div>
    </Layout>
  );
}

export function MyProductsPage() {
  const { profile } = useAuth();
  const { navigate } = useRouter();
  const [vips, setVips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    supabase.from('user_vips').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).then(({ data }) => {
      setVips(data || []);
      setLoading(false);
    });
  }, [profile]);

  if (!profile) { navigate('/login'); return null; }

  const active = vips.filter((v) => v.is_active);
  const totalIncome = vips.reduce((s, v) => s + (v.days_paid || 0) * v.daily_income, 0);

  return (
    <Layout>
      <PageHeader title="My Products" />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card rounded-2xl p-4">
            <div className="text-xs text-muted-foreground">Active Plans</div>
            <div className="text-xl font-black text-foreground">{active.length}</div>
          </div>
          <div className="glass-card rounded-2xl p-4">
            <div className="text-xs text-muted-foreground">Total Income</div>
            <div className="text-xl font-black text-foreground">FRW {fmt(totalIncome)}</div>
          </div>
        </div>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
        ) : vips.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No products yet.<br />
            <button onClick={() => navigate('/vip')} className="text-primary font-bold mt-2">Browse VIP Plans</button>
          </div>
        ) : (
          <div className="space-y-3">
            {vips.map((v) => (
              <div key={v.id} className="glass-card rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-bold text-foreground">{v.plan_name}</div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${v.is_active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                    {v.is_active ? 'Active' : 'Expired'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Investment:</span> <span className="font-semibold text-foreground">FRW {fmt(v.investment_amount)}</span></div>
                  <div><span className="text-muted-foreground">Daily:</span> <span className="font-semibold text-foreground">FRW {fmt(v.daily_income)}</span></div>
                  <div><span className="text-muted-foreground">Days paid:</span> <span className="font-semibold text-foreground">{v.days_paid}/{v.duration_days}</span></div>
                  <div><span className="text-muted-foreground">Total return:</span> <span className="font-semibold text-foreground">FRW {fmt(v.total_return)}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
