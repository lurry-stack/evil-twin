import { useEffect, useState, useCallback } from 'react';
import { Layout, PageHeader } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { useRouter } from '../lib/router';
import { useToast } from '../lib/toast';
import { supabase, fmt, LockedInvestment } from '../lib/supabase';
import { Loader2, Gift, Key, Lock, Unlock, Clock, CheckCircle2, ArrowRight } from 'lucide-react';

export function RedeemPage() {
  const { profile, refreshProfile } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!profile) navigate('/login', { replace: true });
  }, [profile, navigate]);

  if (!profile) return null;

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
    toast.success(`Redeemed! +RWF ${fmt(found.reward_amount)}`);
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
  const { profile, refreshProfile } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();
  const [vips, setVips] = useState<any[]>([]);
  const [locked, setLocked] = useState<LockedInvestment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const loadData = useCallback(async () => {
    if (!profile) return;
    const [vRes, lRes] = await Promise.all([
      supabase.from('user_vips').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('locked_investments').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }),
    ]);
    setVips(vRes.data || []);
    setLocked((lRes.data || []) as LockedInvestment[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!profile) navigate('/login', { replace: true });
  }, [profile, navigate]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!profile) return null;

  const active = vips.filter((v: any) => v.is_active);
  const activeLockedCount = locked.filter((l) => !l.is_claimed).length;
  const totalIncome = vips.reduce((s, v) => s + (v.days_paid || 0) * v.daily_income, 0);
  const lockedBalance = locked
    .filter((l) => !l.is_claimed)
    .reduce((s, l) => s + l.total_return, 0);
  const lockedAccrued = locked
    .filter((l) => !l.is_claimed)
    .reduce((s, l) => s + l.accrued_income, 0);

  const handleClaim = async (lockedId: string) => {
    setBusyId(lockedId);
    const { data, error } = await supabase.rpc('claim_locked_investment', { p_locked_id: lockedId });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Claimed RWF ${fmt(data as number)}! Added to your balance.`);
    loadData();
    refreshProfile();
  };

  const fmtCountdown = (claimAt: string) => {
    const remaining = new Date(claimAt).getTime() - now;
    if (remaining <= 0) return 'Ready to claim!';
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((remaining % (1000 * 60)) / 1000);
    return `${days}d ${hours}h ${mins}m ${secs}s`;
  };

  return (
    <Layout>
      <PageHeader title="My Products" />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card rounded-2xl p-4">
            <div className="text-xs text-muted-foreground">Active Plans</div>
            <div className="text-xl font-black text-foreground">{active.length + activeLockedCount}</div>
          </div>
          <div className="glass-card rounded-2xl p-4">
            <div className="text-xs text-muted-foreground">Total Income</div>
            <div className="text-xl font-black text-foreground">RWF {fmt(totalIncome)}</div>
          </div>
        </div>

        {lockedBalance > 0 && (
          <div className="rounded-2xl p-4 border border-amber-300/50" style={{ background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)' }}>
            <div className="flex items-center gap-2 mb-1">
              <Lock className="w-4 h-4 text-amber-700" />
              <div className="text-xs font-bold text-amber-800">Locked Balance (not in account)</div>
            </div>
            <div className="text-2xl font-black text-amber-900">RWF {fmt(lockedBalance)}</div>
            <div className="text-xs text-amber-700 mt-0.5">Accrued so far: RWF {fmt(lockedAccrued)}</div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
        ) : vips.length === 0 && locked.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No products yet.<br />
            <button onClick={() => navigate('/vip')} className="text-primary font-bold mt-2">Browse VIP Plans</button>
          </div>
        ) : (
          <>
            {vips.length > 0 && (
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
                      <div><span className="text-muted-foreground">Investment:</span> <span className="font-semibold text-foreground">RWF {fmt(v.investment_amount)}</span></div>
                      <div><span className="text-muted-foreground">Daily:</span> <span className="font-semibold text-foreground">RWF {fmt(v.daily_income)}</span></div>
                      <div><span className="text-muted-foreground">Days paid:</span> <span className="font-semibold text-foreground">{v.days_paid}/{v.duration_days}</span></div>
                      <div><span className="text-muted-foreground">Total return:</span> <span className="font-semibold text-foreground">RWF {fmt(v.total_return)}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {locked.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-600" />
                  <h3 className="text-sm font-bold text-foreground">Locked Investments</h3>
                </div>
                {locked.map((l) => {
                  const canClaim = now >= new Date(l.claim_at).getTime() && !l.is_claimed;
                  return (
                    <div key={l.id} className="rounded-2xl p-4 border border-amber-200" style={{ background: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-bold text-amber-900">{l.plan_name} (Locked)</div>
                        {l.is_claimed ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Claimed
                          </span>
                        ) : canClaim ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 animate-pulse">
                            Ready!
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {l.days_paid}/{l.duration_days}d
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-amber-700">Amount:</span> <span className="font-semibold text-amber-900">RWF {fmt(l.investment_amount)}</span></div>
                        <div><span className="text-amber-700">Daily (16%):</span> <span className="font-semibold text-amber-900">RWF {fmt(l.daily_income)}</span></div>
                        <div><span className="text-amber-700">Accrued:</span> <span className="font-semibold text-amber-900">RWF {fmt(l.accrued_income)}</span></div>
                        <div><span className="text-amber-700">Total payout:</span> <span className="font-semibold text-amber-900">RWF {fmt(l.total_return)}</span></div>
                      </div>
                      {!l.is_claimed && (
                        <div className="mt-3">
                          <div className="text-center text-xs font-bold text-amber-800 mb-2">
                            {canClaim ? 'Claim your earnings now!' : `Claim in ${fmtCountdown(l.claim_at)}`}
                          </div>
                          <button
                            onClick={() => handleClaim(l.id)}
                            disabled={!canClaim || busyId === l.id}
                            className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            style={canClaim
                              ? { background: 'linear-gradient(135deg, #10B981, #047857)', color: '#fff' }
                              : { background: '#E5E7EB', color: '#6B7280' }
                            }
                          >
                            {busyId === l.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : canClaim ? (
                              <><Unlock className="w-4 h-4" /> Claim RWF {fmt(l.total_return)}</>
                            ) : (
                              <><Clock className="w-4 h-4" /> Locked</>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <button
          onClick={() => navigate('/vip')}
          className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-primary/30 text-primary active:scale-95 transition-transform"
        >
          Browse More Plans <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </Layout>
  );
}
