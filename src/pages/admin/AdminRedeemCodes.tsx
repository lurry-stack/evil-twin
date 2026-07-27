import { useEffect, useState, useCallback } from 'react';
import { supabase, fmt, fmtDate } from '../../lib/supabase';
import { useToast } from '../../lib/toast';
import { Loader2, Plus, Pencil, Trash2, X, Gift, Copy, Check, Clock } from 'lucide-react';

type RedeemCode = {
  id: string;
  code: string;
  reward_amount: number;
  max_uses: number;
  used_count: number;
  is_active: boolean;
  expires_at: string | null;
  expiry_minutes: number | null;
  created_at: string;
};

const empty = {
  code: '', reward_amount: 0, max_uses: 1, is_active: true, expires_at: '', expiry_minutes: '',
};

export function AdminRedeemCodes() {
  const toast = useToast();
  const [rows, setRows] = useState<RedeemCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<RedeemCode | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('redeem_codes').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) { toast.error(error.message); setLoading(false); return; }
    setRows((data || []) as RedeemCode[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const genCode = () => Math.random().toString(36).slice(2, 10).toUpperCase();

  const startCreate = () => {
    setCreating(true);
    setEditing(null);
    setForm({ ...empty, code: genCode() });
  };

  const startEdit = (r: RedeemCode) => {
    setEditing(r);
    setCreating(false);
    setForm({
      code: r.code, reward_amount: r.reward_amount, max_uses: r.max_uses,
      is_active: r.is_active,
      expires_at: r.expires_at ? r.expires_at.slice(0, 16) : '',
      expiry_minutes: r.expiry_minutes ? String(r.expiry_minutes) : '',
    });
  };

  const cancel = () => { setEditing(null); setCreating(false); };

  const save = async () => {
    if (!form.code) { toast.error('Code required'); return; }
    setBusy(true);
    const payload: any = {
      code: form.code,
      reward_amount: Number(form.reward_amount),
      max_uses: Number(form.max_uses),
      is_active: form.is_active,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      expiry_minutes: form.expiry_minutes ? Number(form.expiry_minutes) : null,
    };
    if (editing) {
      const { error } = await supabase.from('redeem_codes').update(payload).eq('id', editing.id);
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success('Code updated');
    } else {
      const { error } = await supabase.from('redeem_codes').insert(payload);
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success('Code created');
    }
    cancel();
    load();
  };

  const remove = async (r: RedeemCode) => {
    if (!window.confirm(`Delete code "${r.code}"?`)) return;
    setBusy(true);
    const { error } = await supabase.from('redeem_codes').delete().eq('id', r.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Code deleted');
    load();
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      toast.success('Code copied');
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const formatExpiry = (r: RedeemCode) => {
    if (r.expiry_minutes) {
      const mins = r.expiry_minutes;
      if (mins >= 60) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
      }
      return `${mins}m`;
    }
    if (r.expires_at) return fmtDate(r.expires_at);
    return 'No expiry';
  };

  return (
    <div className="space-y-3">
      <button
        onClick={startCreate}
        className="w-full bg-primary text-white text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5"
      >
        <Plus className="w-4 h-4" /> Generate Code
      </button>

      {(editing || creating) && (
        <div className="bg-card border border-primary/30 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">{editing ? 'Edit Code' : 'New Code'}</span>
            <button onClick={cancel} className="text-muted-foreground"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[11px] text-muted-foreground font-semibold block mb-1">Code</label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={() => setForm({ ...form, code: genCode() })}
              className="self-end px-3 py-2 rounded-lg bg-muted text-foreground text-xs font-bold"
            >
              Random
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground font-semibold block mb-1">Reward (FRW)</label>
              <input
                type="number"
                value={String(form.reward_amount)}
                onChange={(e) => setForm({ ...form, reward_amount: Number(e.target.value) })}
                className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground font-semibold block mb-1">Max Uses</label>
              <input
                type="number"
                value={String(form.max_uses)}
                onChange={(e) => setForm({ ...form, max_uses: Number(e.target.value) })}
                className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground font-semibold block mb-1">Expiry Duration (minutes)</label>
            <input
              type="number"
              value={form.expiry_minutes}
              onChange={(e) => setForm({ ...form, expiry_minutes: e.target.value })}
              placeholder="e.g. 60 = 1 hour, 1440 = 1 day"
              className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Code expires this many minutes after first use. Leave empty for no time limit.</p>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground font-semibold block mb-1">Or Absolute Expiry (optional)</label>
            <input
              type="datetime-local"
              value={form.expires_at}
              onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            Active
          </label>
          <button
            onClick={save}
            disabled={busy}
            className="w-full bg-primary text-white text-sm font-bold py-2 rounded-lg disabled:opacity-60 flex items-center justify-center gap-1"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {editing ? 'Save Changes' : 'Create Code'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No redeem codes yet</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Gift className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      <span className="font-mono">{r.code}</span>
                      <button onClick={() => copy(r.code)} className="text-muted-foreground">
                        {copied === r.code ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                      </button>
                      {!r.is_active && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Inactive</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Reward: FRW {fmt(r.reward_amount)} · Used {r.used_count}/{r.max_uses}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Expires: {formatExpiry(r)}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(r)} className="p-2 rounded-lg bg-primary/10 text-primary"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(r)} className="p-2 rounded-lg bg-red-50 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
