import { useEffect, useState, useCallback } from 'react';
import { supabase, fmt, fmtDate, Profile } from '../../lib/supabase';
import { useToast } from '../../lib/toast';
import { Loader2, Search, ShieldCheck, User as UserIcon, Trash2, Pencil, X, Key, Lock } from 'lucide-react';

type UserVip = {
  id: string;
  plan_name: string;
  investment_amount: number;
  daily_income: number;
  days_paid: number;
  duration_days: number;
  is_active: boolean;
  created_at: string;
};

type UserLocked = {
  id: string;
  plan_name: string;
  investment_amount: number;
  daily_income: number;
  duration_days: number;
  days_paid: number;
  accrued_income: number;
  total_return: number;
  is_claimed: boolean;
  claim_at: string;
  created_at: string;
};

export function AdminUsers() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [editBalance, setEditBalance] = useState('');
  const [viewingProducts, setViewingProducts] = useState<Profile | null>(null);
  const [userVips, setUserVips] = useState<UserVip[]>([]);
  const [userLocked, setUserLocked] = useState<UserLocked[]>([]);
  const [loadingVips, setLoadingVips] = useState(false);
  const [resettingPw, setResettingPw] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (search.trim()) {
      const s = search.trim();
      q = q.or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,referral_code.ilike.%${s}%`);
    } else {
      q = q.limit(500);
    }
    const { data, error } = await q;
    if (error) { toast.error(error.message); setLoading(false); return; }
    setRows((data || []) as Profile[]);
    setLoading(false);
  }, [search, toast]);

  useEffect(() => { load(); }, [load]);

  const toggleAdmin = async (p: Profile) => {
    const next = !p.is_admin;
    if (!window.confirm(`${next ? 'Grant' : 'Revoke'} admin privileges for ${p.full_name}?`)) return;
    setBusy(p.id);
    const { error } = await supabase.from('profiles').update({ is_admin: next }).eq('id', p.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${p.full_name} is ${next ? 'now an admin' : 'no longer an admin'}.`);
    load();
  };

  const saveBalance = async () => {
    if (!editing) return;
    setBusy(editing.id);
    const { error } = await supabase.rpc('admin_update_balance', {
      p_user_id: editing.id,
      p_new_balance: Number(editBalance),
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Balance updated');
    setEditing(null);
    load();
  };

  const deleteUser = async (p: Profile) => {
    if (!window.confirm(`Delete ${p.full_name}'s account? This permanently removes their data.`)) return;
    setBusy(p.id);
    const { error } = await supabase.rpc('admin_delete_user', { p_user_id: p.id });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success('User deleted');
    load();
  };

  const viewProducts = async (p: Profile) => {
    setViewingProducts(p);
    setLoadingVips(true);
    const [vRes, lRes] = await Promise.all([
      supabase.from('user_vips').select('*').eq('user_id', p.id).order('created_at', { ascending: false }),
      supabase.from('locked_investments').select('*').eq('user_id', p.id).order('created_at', { ascending: false }),
    ]);
    if (vRes.error) { toast.error(vRes.error.message); }
    if (lRes.error) { toast.error(lRes.error.message); }
    setUserVips((vRes.data || []) as UserVip[]);
    setUserLocked((lRes.data || []) as UserLocked[]);
    setLoadingVips(false);
  };

  const deleteVip = async (vipId: string) => {
    if (!window.confirm('Delete this VIP product?')) return;
    setBusy(vipId);
    const { error } = await supabase.rpc('admin_delete_user_vip', { p_user_vip_id: vipId });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Product deleted');
    if (viewingProducts) viewProducts(viewingProducts);
  };

  const deleteLocked = async (lockedId: string) => {
    if (!window.confirm('Delete this locked investment? If unclaimed, the investment amount will be refunded to the user.')) return;
    setBusy(lockedId);
    const { error } = await supabase.rpc('admin_delete_locked_investment', { p_locked_id: lockedId });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Locked investment deleted');
    if (viewingProducts) viewProducts(viewingProducts);
  };

  const resetPassword = async () => {
    if (!resettingPw || !newPassword) { toast.error('Enter new password'); return; }
    setBusy(resettingPw.id);
    const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-reset-password`;
    const fnRes = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ user_id: resettingPw.id, new_password: newPassword }),
    });
    const fnData = await fnRes.json().catch(() => null);
    setBusy(null);
    if (!fnRes.ok || fnData?.error) { toast.error(fnData?.error || 'Failed to reset password'); return; }
    toast.success('Password updated');
    setResettingPw(null);
    setNewPassword('');
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, referral code"
          className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No users found</div>
      ) : (
        <div className="space-y-2">
          {rows.map((p) => (
            <div key={p.id} className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-foreground truncate flex items-center gap-1">
                      {p.full_name}
                      {p.is_admin && <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{p.phone || '—'}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Joined {fmtDate(p.created_at)} · Code: {p.referral_code || '—'}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-black text-foreground">FRW {fmt(p.main_balance || 0)}</div>
                  <div className="text-[10px] text-muted-foreground">Balance</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                <div className="bg-muted/50 rounded-lg py-1.5">
                  <div className="text-xs font-bold text-foreground">{fmt(p.total_deposit || 0)}</div>
                  <div className="text-[10px] text-muted-foreground">Deposits</div>
                </div>
                <div className="bg-muted/50 rounded-lg py-1.5">
                  <div className="text-xs font-bold text-foreground">{fmt(p.total_earnings || 0)}</div>
                  <div className="text-[10px] text-muted-foreground">Earnings</div>
                </div>
                <div className="bg-muted/50 rounded-lg py-1.5">
                  <div className="text-xs font-bold text-foreground">{fmt(p.total_referral_commission || 0)}</div>
                  <div className="text-[10px] text-muted-foreground">Commission</div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  onClick={() => { setEditing(p); setEditBalance(String(p.main_balance || 0)); }}
                  className="text-xs font-bold py-2 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center gap-1"
                >
                  <Pencil className="w-3 h-3" /> Edit Balance
                </button>
                <button
                  onClick={() => { setResettingPw(p); setNewPassword(''); }}
                  className="text-xs font-bold py-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center gap-1"
                >
                  <Key className="w-3 h-3" /> Reset Password
                </button>
                <button
                  onClick={() => viewProducts(p)}
                  className="text-xs font-bold py-2 rounded-lg bg-muted text-foreground border border-border"
                >
                  View Products
                </button>
                <button
                  onClick={() => toggleAdmin(p)}
                  disabled={busy === p.id}
                  className={`text-xs font-bold py-2 rounded-lg disabled:opacity-60 ${
                    p.is_admin ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-primary/10 text-primary border border-primary/20'
                  }`}
                >
                  {busy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : p.is_admin ? 'Revoke Admin' : 'Make Admin'}
                </button>
              </div>
              <button
                onClick={() => deleteUser(p)}
                disabled={busy === p.id}
                className="w-full mt-2 text-xs font-bold py-2 rounded-lg bg-red-600 text-white disabled:opacity-60 flex items-center justify-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Account
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Edit balance modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setEditing(null)}>
          <div className="bg-card rounded-2xl p-4 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">Edit Balance - {editing.full_name}</span>
              <button onClick={() => setEditing(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <input
              type="number"
              value={editBalance}
              onChange={(e) => setEditBalance(e.target.value)}
              className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
            <button
              onClick={saveBalance}
              disabled={busy === editing.id}
              className="w-full bg-primary text-white text-sm font-bold py-2 rounded-lg disabled:opacity-60"
            >
              {busy === editing.id ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resettingPw && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setResettingPw(null)}>
          <div className="bg-card rounded-2xl p-4 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">Reset Password - {resettingPw.full_name}</span>
              <button onClick={() => setResettingPw(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
            <button
              onClick={resetPassword}
              disabled={busy === resettingPw.id}
              className="w-full bg-primary text-white text-sm font-bold py-2 rounded-lg disabled:opacity-60"
            >
              {busy === resettingPw.id ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Reset Password'}
            </button>
          </div>
        </div>
      )}

      {/* View products modal */}
      {viewingProducts && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setViewingProducts(null)}>
          <div className="bg-card rounded-2xl p-4 w-full max-w-sm max-h-[80vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">Products - {viewingProducts.full_name}</span>
              <button onClick={() => setViewingProducts(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            {loadingVips ? (
              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
            ) : userVips.length === 0 && userLocked.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">No products</div>
            ) : (
              <div className="space-y-2">
                {userVips.length > 0 && (
                  <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide pt-1">Current Investments</div>
                )}
                {userVips.map((v) => (
                  <div key={v.id} className="bg-muted/40 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold">{v.plan_name}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${v.is_active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                        {v.is_active ? 'Active' : 'Expired'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Investment: RWF {fmt(v.investment_amount)} · Daily: RWF {fmt(v.daily_income)} · Days: {v.days_paid}/{v.duration_days}
                    </div>
                    <button
                      onClick={() => deleteVip(v.id)}
                      disabled={busy === v.id}
                      className="w-full mt-2 text-xs font-bold py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 flex items-center justify-center gap-1 disabled:opacity-60"
                    >
                      {busy === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Trash2 className="w-3 h-3" /> Delete Product</>}
                    </button>
                  </div>
                ))}
                {userLocked.length > 0 && (
                  <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wide pt-2 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Locked Investments
                  </div>
                )}
                {userLocked.map((l) => (
                  <div key={l.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-amber-900">{l.plan_name}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        l.is_claimed ? 'bg-green-100 text-green-700' :
                        new Date(l.claim_at) <= new Date() ? 'bg-green-100 text-green-700' :
                        'bg-amber-200 text-amber-800'
                      }`}>
                        {l.is_claimed ? 'Claimed' : new Date(l.claim_at) <= new Date() ? 'Ready' : `${l.days_paid}/${l.duration_days}d`}
                      </span>
                    </div>
                    <div className="text-xs text-amber-700">
                      Amount: RWF {fmt(l.investment_amount)} · Daily: RWF {fmt(l.daily_income)} · Accrued: RWF {fmt(l.accrued_income)} · Total: RWF {fmt(l.total_return)}
                    </div>
                    <button
                      onClick={() => deleteLocked(l.id)}
                      disabled={busy === l.id}
                      className="w-full mt-2 text-xs font-bold py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 flex items-center justify-center gap-1 disabled:opacity-60"
                    >
                      {busy === l.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Trash2 className="w-3 h-3" /> Delete Locked Investment</>}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
