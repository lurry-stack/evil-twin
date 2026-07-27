import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../lib/auth';
import { useRouter } from '../lib/router';
import { useToast } from '../lib/toast';
import { supabase } from '../lib/supabase';
import {
  ShieldCheck, ArrowLeftRight, Wallet, Users, Crown, ListTodo,
  Settings as SettingsIcon, Gift, Loader2, TrendingUp, Clock, CheckCircle2,
  XCircle, ChevronLeft, Trophy,
} from 'lucide-react';
import { AdminDeposits } from './admin/AdminDeposits';
import { AdminWithdrawals } from './admin/AdminWithdrawals';
import { AdminUsers } from './admin/AdminUsers';
import { AdminVipPlans } from './admin/AdminVipPlans';
import { AdminTasks } from './admin/AdminTasks';
import { AdminSettings } from './admin/AdminSettings';
import { AdminRedeemCodes } from './admin/AdminRedeemCodes';

type TabKey =
  | 'overview' | 'deposits' | 'withdrawals' | 'users'
  | 'vip' | 'tasks' | 'settings' | 'redeem';

const tabs: { key: TabKey; label: string; icon: typeof ShieldCheck }[] = [
  { key: 'overview', label: 'Overview', icon: TrendingUp },
  { key: 'deposits', label: 'Deposits', icon: ArrowLeftRight },
  { key: 'withdrawals', label: 'Withdrawals', icon: Wallet },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'vip', label: 'VIP Plans', icon: Crown },
  { key: 'tasks', label: 'Tasks', icon: ListTodo },
  { key: 'redeem', label: 'Redeem Codes', icon: Gift },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

type Stats = {
  totalUsers: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalBalance: number;
  activeVips: number;
};

export function AdminPage() {
  const { profile, loading } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [distributing, setDistributing] = useState(false);

  const loadStats = useCallback(async () => {
    if (!profile?.is_admin) return;
    setLoadingStats(true);
    try {
      const [users, pendingDep, pendingWd, activeVips, balances] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('deposits').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('withdrawals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('user_vips').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('profiles').select('main_balance, total_deposit'),
      ]);
      const totalBalance = (balances.data || []).reduce(
        (s: number, p: any) => s + Number(p.main_balance || 0), 0,
      );
      const totalDeposits = (balances.data || []).reduce(
        (s: number, p: any) => s + Number(p.total_deposit || 0), 0,
      );
      setStats({
        totalUsers: users.count || 0,
        pendingDeposits: pendingDep.count || 0,
        pendingWithdrawals: pendingWd.count || 0,
        totalDeposits,
        totalWithdrawals: 0,
        totalBalance,
        activeVips: activeVips.count || 0,
      });
    } finally {
      setLoadingStats(false);
    }
  }, [profile]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const distributeSunday = async () => {
    if (!window.confirm('Distribute Sunday referral rewards to top 3 users? (10,000 / 5,000 / 3,000 RWF)')) return;
    setDistributing(true);
    const { data, error } = await supabase.rpc('distribute_sunday_rewards');
    setDistributing(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Sunday rewards distributed successfully!');
    loadStats();
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (!profile) {
    navigate('/login', { replace: true });
    return null;
  }

  if (!profile.is_admin) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-6 text-center">
        <ShieldCheck className="w-10 h-10 text-muted-foreground mb-3" />
        <h1 className="text-lg font-black text-foreground">Admin access only</h1>
        <p className="text-sm text-muted-foreground mt-1">You don't have permission to view this page.</p>
        <button
          onClick={() => navigate('/home', { replace: true })}
          className="mt-5 px-5 py-2 rounded-full bg-primary text-white text-sm font-bold"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <div
        className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3 text-white"
        style={{ background: 'linear-gradient(135deg, #451A03 0%, #78350F 50%, #92400E 100%)' }}
      >
        <button
          onClick={() => navigate('/profile')}
          className="p-1.5 rounded-lg hover:bg-white/10"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <ShieldCheck className="w-5 h-5" />
          <h1 className="text-base font-black tracking-wide">Admin Panel</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-[52px] z-20 bg-card/95 backdrop-blur border-b border-border">
        <div className="flex gap-1 px-2 py-2 overflow-x-auto no-scrollbar">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                tab === key
                  ? 'bg-primary text-white'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 max-w-3xl mx-auto">
        {tab === 'overview' && (
          <Overview stats={stats} loading={loadingStats} onRefresh={loadStats} onGo={setTab} onDistribute={distributeSunday} distributing={distributing} />
        )}
        {tab === 'deposits' && <AdminDeposits />}
        {tab === 'withdrawals' && <AdminWithdrawals />}
        {tab === 'users' && <AdminUsers />}
        {tab === 'vip' && <AdminVipPlans />}
        {tab === 'tasks' && <AdminTasks />}
        {tab === 'redeem' && <AdminRedeemCodes />}
        {tab === 'settings' && <AdminSettings />}
      </div>
    </div>
  );
}

function Overview({
  stats, loading, onRefresh, onGo, onDistribute, distributing,
}: {
  stats: Stats | null;
  loading: boolean;
  onRefresh: () => void;
  onGo: (t: TabKey) => void;
  onDistribute: () => void;
  distributing: boolean;
}) {
  if (loading && !stats) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }
  if (!stats) return null;

  const cards = [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, tab: 'users' as TabKey },
    { label: 'Pending Deposits', value: stats.pendingDeposits, icon: Clock, tab: 'deposits' as TabKey },
    { label: 'Pending Withdrawals', value: stats.pendingWithdrawals, icon: Wallet, tab: 'withdrawals' as TabKey },
    { label: 'Active VIPs', value: stats.activeVips, icon: Crown, tab: 'vip' as TabKey },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {cards.map(({ label, value, icon: Icon, tab }) => (
          <button
            key={label}
            onClick={() => onGo(tab)}
            className="bg-card border border-border rounded-2xl p-4 text-left active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-semibold">{label}</span>
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div className="text-2xl font-black text-foreground">{value}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card rounded-2xl p-4">
          <div className="text-xs text-muted-foreground font-semibold mb-1">Total Deposits Value</div>
          <div className="text-lg font-black text-foreground">FRW {stats.totalDeposits.toLocaleString()}</div>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="text-xs text-muted-foreground font-semibold mb-1">Total User Balances</div>
          <div className="text-lg font-black text-foreground">FRW {stats.totalBalance.toLocaleString()}</div>
        </div>
      </div>

      <button
        onClick={onDistribute}
        disabled={distributing}
        className="w-full py-2.5 rounded-xl btn-gold text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {distributing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
        Distribute Sunday Rewards
      </button>

      <button
        onClick={onRefresh}
        className="w-full py-2.5 rounded-xl bg-muted text-foreground text-sm font-bold flex items-center justify-center gap-2"
      >
        <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        Refresh Stats
      </button>

      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 text-xs">
        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          Approve deposits to credit user balances and trigger referral commissions (10% / 5% / 2%).
          Rejecting a withdrawal refunds the reserved amount to the user.
        </p>
      </div>
    </div>
  );
}
