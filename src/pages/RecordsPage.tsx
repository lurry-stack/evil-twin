import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Layout, PageHeader } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { useRouter } from '../lib/router';
import { supabase, Deposit, Withdrawal, Transaction, fmt, fmtDate } from '../lib/supabase';

type Tab = 'all' | 'deposits' | 'withdrawals' | 'transactions';

export function RecordsPage() {
  const { profile } = useAuth();
  const { navigate } = useRouter();
  const [tab, setTab] = useState<Tab>('all');
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [d, w, t] = await Promise.all([
        supabase.from('deposits').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('withdrawals').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(50),
        supabase.from('transactions').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(100),
      ]);
      setDeposits((d.data || []) as Deposit[]);
      setWithdrawals((w.data || []) as Withdrawal[]);
      setTransactions((t.data || []) as Transaction[]);
      setLoading(false);
    })();
  }, [profile]);

  useEffect(() => {
    if (!profile) navigate('/login', { replace: true });
  }, [profile, navigate]);

  if (!profile) return null;

  if (loading) {
    return (
      <Layout>
        <PageHeader title="Records" />
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      </Layout>
    );
  }

  const statusColor = (s: string) => {
    const sl = (s || '').toLowerCase();
    if (sl === 'approved' || sl === 'completed' || sl === 'paid') return 'bg-green-100 text-green-700';
    if (sl === 'rejected' || sl === 'failed') return 'bg-red-100 text-red-700';
    return 'bg-yellow-100 text-yellow-700';
  };

  const txSign = (type: string) => {
    const positive = ['checkin', 'redeem', 'vip_income', 'commission', 'referral', 'deposit'];
    const negative = ['withdrawal', 'vip_purchase'];
    const sl = (type || '').toLowerCase();
    if (positive.some((p) => sl.includes(p))) return '+';
    if (negative.some((n) => sl.includes(n))) return '-';
    return '';
  };

  return (
    <Layout>
      <PageHeader title="Records" />
      <div className="p-4">
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {([
            { key: 'all', label: 'All' },
            { key: 'deposits', label: 'Deposits' },
            { key: 'withdrawals', label: 'Withdrawals' },
            { key: 'transactions', label: 'Transactions' },
          ] as { key: Tab; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                tab === key ? 'btn-gold' : 'bg-muted text-muted-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {(tab === 'all' || tab === 'deposits') && (
          <div className="mb-4">
            <div className="text-sm font-bold text-foreground mb-2">Deposits</div>
            {deposits.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-xs">No deposits yet</div>
            ) : (
            <div className="space-y-2">
              {deposits.map((d) => (
                <div key={d.id} className="glass-card rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-green-600">+RWF {fmt(d.amount)}</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(d.created_at)} · {d.bank_name}</div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor(d.status)}`}>{d.status}</span>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {(tab === 'all' || tab === 'withdrawals') && (
          <div className="mb-4">
            <div className="text-sm font-bold text-foreground mb-2">Withdrawals</div>
            {withdrawals.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-xs">No withdrawals yet</div>
            ) : (
            <div className="space-y-2">
              {withdrawals.map((w) => (
                <div key={w.id} className="glass-card rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-red-600">-RWF {fmt(w.amount)}</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(w.created_at)} · {w.bank_name}</div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor(w.status)}`}>{w.status}</span>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {(tab === 'all' || tab === 'transactions') && (
          <div className="mb-4">
            <div className="text-sm font-bold text-foreground mb-2">Transactions</div>
            {transactions.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-xs">No transactions yet</div>
            ) : (
            <div className="space-y-2">
              {transactions.map((t) => (
                <div key={t.id} className="glass-card rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-foreground">{t.description || t.type}</div>
                      <div className="text-xs text-muted-foreground">{fmtDate(t.created_at)}</div>
                    </div>
                    <div className="text-sm font-bold text-foreground">{txSign(t.type)}RWF {fmt(t.amount)}</div>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {deposits.length === 0 && withdrawals.length === 0 && transactions.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">No records yet</div>
        )}
      </div>
    </Layout>
  );
}
