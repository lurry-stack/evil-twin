import { useEffect, useState, useCallback } from 'react';
import { supabase, fmt, LockedPlan } from '../../lib/supabase';
import { useToast } from '../../lib/toast';
import { Loader2, Plus, Pencil, Trash2, X, Lock } from 'lucide-react';

const empty: Omit<LockedPlan, 'id'> = {
  name: '', investment_amount: 0, daily_income: 0, duration_days: 10,
  total_return: 0, sort_order: 0, is_active: true,
};

export function AdminLockedPlans() {
  const toast = useToast();
  const [rows, setRows] = useState<LockedPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<LockedPlan | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Omit<LockedPlan, 'id'>>(empty);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('locked_plans').select('*').order('sort_order', { ascending: true });
    if (error) { toast.error(error.message); setLoading(false); return; }
    setRows((data || []) as LockedPlan[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (p: LockedPlan) => {
    setEditing(p);
    setForm({
      name: p.name, investment_amount: p.investment_amount, daily_income: p.daily_income,
      duration_days: p.duration_days, total_return: p.total_return,
      sort_order: p.sort_order, is_active: p.is_active,
    });
    setCreating(false);
  };

  const startCreate = () => {
    setCreating(true);
    setEditing(null);
    setForm(empty);
  };

  const cancel = () => { setEditing(null); setCreating(false); };

  const save = async () => {
    if (!form.name) { toast.error('Name required'); return; }
    setBusy(true);
    if (editing) {
      const { error } = await supabase.from('locked_plans').update(form).eq('id', editing.id);
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success('Locked plan updated');
    } else {
      const { error } = await supabase.from('locked_plans').insert(form);
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success('Locked plan created');
    }
    cancel();
    load();
  };

  const remove = async (p: LockedPlan) => {
    if (!window.confirm(`Delete locked plan "${p.name}"? This cannot be undone.`)) return;
    setBusy(true);
    const { error } = await supabase.from('locked_plans').delete().eq('id', p.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Locked plan deleted');
    load();
  };

  return (
    <div className="space-y-3">
      <button
        onClick={startCreate}
        className="w-full bg-primary text-white text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5"
      >
        <Plus className="w-4 h-4" /> Add Locked Plan
      </button>

      {(editing || creating) && (
        <div className="bg-card border border-primary/30 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">{editing ? 'Edit Locked Plan' : 'New Locked Plan'}</span>
            <button onClick={cancel} className="text-muted-foreground"><X className="w-4 h-4" /></button>
          </div>
          <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Investment Amount" type="number" value={String(form.investment_amount)} onChange={(v) => setForm({ ...form, investment_amount: Number(v) })} />
            <Field label="Daily Income (8%)" type="number" value={String(form.daily_income)} onChange={(v) => setForm({ ...form, daily_income: Number(v) })} />
            <Field label="Duration (days)" type="number" value={String(form.duration_days)} onChange={(v) => setForm({ ...form, duration_days: Number(v) })} />
            <Field label="Total Return" type="number" value={String(form.total_return)} onChange={(v) => setForm({ ...form, total_return: Number(v) })} />
            <Field label="Sort Order" type="number" value={String(form.sort_order)} onChange={(v) => setForm({ ...form, sort_order: Number(v) })} />
            <label className="flex items-center gap-2 text-sm text-foreground mt-5">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Active
            </label>
          </div>
          <button
            onClick={save}
            disabled={busy}
            className="w-full bg-primary text-white text-sm font-bold py-2 rounded-lg disabled:opacity-60 flex items-center justify-center gap-1"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {editing ? 'Save Changes' : 'Create Locked Plan'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No locked plans yet</div>
      ) : (
        <div className="space-y-2">
          {rows.map((p) => (
            <div key={p.id} className="bg-card border border-amber-200 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      {p.name}
                      {!p.is_active && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Inactive</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Price RWF {fmt(p.investment_amount)} · {fmt(p.daily_income)}/day · {p.duration_days}d
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Total return: RWF {fmt(p.total_return)} · Order: {p.sort_order}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(p)} className="p-2 rounded-lg bg-primary/10 text-primary"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(p)} className="p-2 rounded-lg bg-red-50 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground font-semibold block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
      />
    </div>
  );
}
