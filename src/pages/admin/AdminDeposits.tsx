import { useEffect, useState, useCallback } from 'react';
import { supabase, fmt, fmtDate, Deposit, Profile } from '../../lib/supabase';
import { useToast } from '../../lib/toast';
import { Loader2, CheckCircle2, XCircle, Clock, Search } from 'lucide-react';

type DepositWithUser = Deposit & { user?: Pick<Profile, 'full_name' | 'phone'> | null };

export function AdminDeposits() {
  const toast = useToast();
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<DepositWithUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('deposits').select('*, user:user_id(full_name, phone)').order('created_at', { ascending: false }).limit(200);
    if (filter !== 'all') q = q.eq('status', filter);
    const { data, error } = await q;
    if (error) { toast.error(error.message); setLoading(false); return; }
    let list = (data || []) as DepositWithUser[];
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((d) =>
        d.user?.full_name?.toLowerCase().includes(s) ||
        d.user?.phone?.toLowerCase().includes(s) ||
        d.bank_name?.toLowerCase().includes(s),
      );
    }
    setRows(list);
    setLoading(false);
  }, [filter, search, toast]);

  useEffect(() => { load(); }, [load]);

  const approve = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.rpc('approve_deposit', { p_deposit_id: id });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Deposit approved. Balance credited.');
    load();
  };

  const reject = async (id: string) => {
    const note = window.prompt('Rejection reason (optional):') || 'Rejected by admin';
    setBusy(id);
    const { error } = await supabase.rpc('reject_deposit', { p_deposit_id: id, p_note: note });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Deposit rejected.');
    load();
  };

  const statusBadge = (s: string) => {
    if (s === 'approved') return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1 w-fit"><CheckCircle2 className="w-3 h-3" />Approved</span>;
    if (s === 'rejected') return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1 w-fit"><XCircle className="w-3 h-3" />Rejected</span>;
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 flex items-center gap-1 w-fit"><Clock className="w-3 h-3" />Pending</span>;
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-bold capitalize whitespace-nowrap ${
              filter === f ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search user, phone, bank"
          className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No deposits found</div>
      ) : (
        <div className="space-y-2">
          {rows.map((d) => (
            <div key={d.id} className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-black text-foreground">+FRW {fmt(d.amount)}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {d.user?.full_name || 'Unknown'} · {d.user?.phone || '—'}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {fmtDate(d.created_at)} · {d.bank_name} · {d.account_number}
                  </div>
                  {d.admin_note && (
                    <div className="text-[11px] text-red-600 mt-1">Note: {d.admin_note}</div>
                  )}
                </div>
                {statusBadge(d.status)}
              </div>
              {d.status === 'pending' && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => approve(d.id)}
                    disabled={busy === d.id}
                    className="flex-1 bg-green-600 text-white text-xs font-bold py-2 rounded-lg disabled:opacity-60 flex items-center justify-center gap-1"
                  >
                    {busy === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCircle2 className="w-3.5 h-3.5" />Approve</>}
                  </button>
                  <button
                    onClick={() => reject(d.id)}
                    disabled={busy === d.id}
                    className="flex-1 bg-red-600 text-white text-xs font-bold py-2 rounded-lg disabled:opacity-60 flex items-center justify-center gap-1"
                  >
                    <XCircle className="w-3.5 h-3.5" />Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
